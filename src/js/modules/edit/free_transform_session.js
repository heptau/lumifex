import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_tools_class from './../../core/base-tools.js';
import GUI_context_menu_class from './../../core/gui/gui-context-menu.js';
import Edit_selection_class from './selection.js';
import { quad_bounds, warp_to_quad, is_valid_quad, handle_position, CORNER_HANDLES, EDGE_HANDLES } from './../../libs/perspective.js';
import {
	frame_from_box, frame_handles, frame_quad, hit_test, quad_hit_test, drag_frame, drag_quad, turn_frame, flip_frame,
	flip_quad, same_frame, frame_fields, frame_from_field, union_rect, flip_mask, selection_on_layer, quad_center, rotate_quad,
	FRAME_HANDLES, QUAD_MODES, MODES,
} from './../../libs/free-transform.js';
import { lift_pixels } from './../../libs/selection-move.js';
import { create_mask, mask_bounds as selection_mask_bounds } from './../../libs/selection-mask.js';
import { deserialize_layer_mask, serialize_layer_mask } from './../../libs/layer-mask.js';
import { normalize_rotate } from './../../libs/vector-rotation.js';
import { describe_transform, remember_transform } from './../../libs/transform-repeat.js';
import { are_edges_hidden, set_edges_hidden } from './../../libs/marching-ants.js';
import { t } from '../tools/translate.js';

const MAX_SIDE = 8192;
const HANDLE_SIZE = 8; //screen pixels
const REACH = 10; //screen pixels
const PREVIEW_SIDE = 600; //the quad preview is made from a copy of at most this size

const CURSORS = {
	tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
	top: 'ns-resize', bottom: 'ns-resize', left: 'ew-resize', right: 'ew-resize',
	move: 'move', rotate: 'grab',
};

const NUMBER_FIELDS = [
	{field: 'x', label: 'X:'},
	{field: 'y', label: 'Y:'},
	{field: 'width', label: 'W:'},
	{field: 'height', label: 'H:'},
	{field: 'rotate', label: 'Angle:'},
];

//the right click menu of the session; the targets are commands of the session, not of the application
const SESSION_MENU = [
	{name: 'Free Transform', target: 'mode:free'},
	{name: 'Scale', target: 'mode:scale'},
	{name: 'Rotate', target: 'mode:rotate'},
	{name: 'Skew', target: 'mode:skew'},
	{name: 'Distort', target: 'mode:distort'},
	{name: 'Perspective', target: 'mode:perspective'},
	{name: 'Warp', target: 'warp'},
	{divider: true},
	{name: 'Rotate 180°', target: 'turn:180'},
	{name: 'Rotate 90° Clockwise', target: 'turn:90'},
	{name: 'Rotate 90° Counter Clockwise', target: 'turn:-90'},
	{divider: true},
	{name: 'Flip Horizontal', target: 'flip:h'},
	{name: 'Flip Vertical', target: 'flip:v'},
];

let instance = null;

function canvas_of(image) {
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
	return canvas;
}

function image_data_of(canvas) {
	return canvas.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Edit > Free Transform (Ctrl+T) as in Photoshop: a frame with eight handles lies around the active layer (turned with
 * it). Dragging inside moves, a handle scales (a picture keeps its proportions, Shift frees them; a vector layer the
 * other way round; Alt scales around the center), outside turns (Shift by 15 degrees), Ctrl / Cmd on a corner distorts
 * and on an edge skews. The bar at the top shows the numbers and has Flip, Reset, Cancel and Apply; Enter applies,
 * Escape cancels, the right button opens a menu of the modes. With a selection on a picture layer only the selected
 * pixels are transformed: they are lifted (a soft edge stays soft), the layer keeps a hole, and on Apply they are put
 * back where the frame is (the layer grows to hold them, or they are cut at its edge when it has a layer mask).
 * Everything that is applied is one step of the history; Cancel leaves none.
 */
class Edit_free_transform_session_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
		this.active = false;
		this.pointer = new Base_tools_class(); //only for the position of the mouse on the picture
		this.selection = new Edit_selection_class();
		this.menu = new GUI_context_menu_class();
	}

	start() {
		if (this.active) {
			return;
		}
		const layer = config.layer;
		if (layer == null || layer.type == null) {
			alertify.error(t('Layer is empty.'));
			return;
		}
		if (layer.type == 'adjustment' || ![layer.x, layer.y, layer.width, layer.height].every((v) => typeof v == 'number' && isFinite(v))) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (!(layer.width > 0) || !(layer.height > 0)) {
			alertify.error(t('Layer is empty.'));
			return;
		}
		this.layer = layer;
		this.is_image = layer.type == 'image';
		this.saved = {
			x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotate: layer.rotate,
			link_canvas: layer.link_canvas, has_link_canvas: Object.prototype.hasOwnProperty.call(layer, 'link_canvas'),
		};
		this.piece = null;
		if (this.selection.has_selection() && !this.lift_selection()) {
			return;
		}
		if (this.piece == null) {
			this.start_frame = frame_from_box(layer);
			this.can_rotate = normalize_rotate(layer) !== null;
		}
		else {
			this.can_rotate = true;
		}
		this.frame = Object.assign({}, this.start_frame);
		this.quad = null;
		this.mode = 'free';
		this.dragging = null;
		this.hover = null;
		this.flip_cache = null;
		this.preview_quad = null;
		this.active = true;

		this.on_down = (event) => this.pointer_down(event);
		this.on_move = (event) => this.pointer_move(event);
		this.on_up = () => this.pointer_up();
		this.on_key = (event) => this.key_down(event);
		this.on_menu = (event) => this.context_menu(event);
		this.on_history = () => this.cancel();
		document.addEventListener('mousedown', this.on_down, true);
		document.addEventListener('mousemove', this.on_move, true);
		document.addEventListener('mouseup', this.on_up, true);
		document.addEventListener('keydown', this.on_key, true);
		document.addEventListener('contextmenu', this.on_menu, true);
		document.addEventListener('minipaint:history', this.on_history);
		config.view_overlay = (ctx) => this.draw(ctx);

		this.show_bar();
		this.show_preview();
	}

	/**
	 * A selection on the layer: the selected pixels are lifted from a picture layer that is not turned or stretched.
	 *
	 * @returns {boolean} false when the session must not start
	 */
	lift_selection() {
		const layer = this.layer;
		const current = this.selection.get_mask();
		const bounds = current ? selection_mask_bounds(current.mask) : null;
		const stretched = layer.width != layer.width_original || layer.height != layer.height_original;
		if (!this.is_image || layer.rotate || stretched || bounds == null) {
			//only the pixels of a plain picture can be lifted, the whole layer is transformed instead
			return true;
		}
		const area = selection_on_layer(bounds, layer);
		if (area == null) {
			alertify.error(t('Empty selection'));
			return false;
		}
		const lx = Math.round(layer.x);
		const ly = Math.round(layer.y);
		const full = document.createElement('canvas');
		full.width = Math.round(layer.width);
		full.height = Math.round(layer.height);
		full.getContext('2d', {willReadFrequently: true}).drawImage(layer.link, 0, 0, full.width, full.height);
		const geometry = {x: lx, y: ly, width: full.width, height: full.height};
		const parts = lift_pixels(image_data_of(full), current.mask, geometry);
		const piece = document.createElement('canvas');
		piece.width = area.width;
		piece.height = area.height;
		piece.getContext('2d').drawImage(canvas_of(parts.selected), lx - area.x, ly - area.y);
		//the selection itself, to be transformed with the pixels
		const mask_piece = new ImageData(area.width, area.height);
		for (let y = 0; y < area.height; y++) {
			for (let x = 0; x < area.width; x++) {
				const value = current.mask.data[(area.y + y) * current.mask.width + area.x + x];
				const i = (y * area.width + x) * 4;
				mask_piece.data[i] = 255;
				mask_piece.data[i + 1] = 255;
				mask_piece.data[i + 2] = 255;
				mask_piece.data[i + 3] = value;
			}
		}
		this.piece = {
			canvas: piece,
			mask: mask_piece,
			hole: canvas_of(parts.hole),
			origin: geometry,
			selection: current.mask,
		};
		this.start_frame = frame_from_box(area);
		//the layer shows the hole, the lifted pixels are drawn by the overlay
		layer.link_canvas = this.piece.hole;
		set_edges_hidden_saved(this);
		return true;
	}

	zoom() {
		return config.ZOOM || 1;
	}

	point(event) {
		return this.pointer.get_mouse_coordinates_from_event(event);
	}

	on_canvas(event) {
		return event.target && (event.target.id == 'canvas_minipaint' || event.target.id == 'main_wrapper');
	}

	/**
	 * @returns {boolean} the frame can become a free shape (only pictures are recalculated in pixels)
	 */
	can_distort() {
		if (this.piece) {
			return true;
		}
		if (!this.is_image) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return false;
		}
		if (this.layer.mask || this.layer.smart_mask) {
			alertify.error(t('Apply or delete the layer mask first.'));
			return false;
		}
		return true;
	}

	/**
	 * The frame becomes a quad (Skew, Distort, Perspective, or Ctrl + a handle)
	 *
	 * @returns {boolean}
	 */
	enter_quad() {
		if (this.quad) {
			return true;
		}
		if (!this.can_distort()) {
			return false;
		}
		this.quad = frame_quad(this.frame);
		this.prepare_source();
		this.update_bar();
		return true;
	}

	/**
	 * The picture of the whole layer as it is shown, and a smaller copy for the preview of a quad
	 */
	prepare_source() {
		if (this.source) {
			return;
		}
		let full;
		if (this.piece) {
			full = this.piece.canvas;
		}
		else {
			full = document.createElement('canvas');
			full.width = Math.max(1, Math.round(this.saved.width));
			full.height = Math.max(1, Math.round(this.saved.height));
			full.getContext('2d').drawImage(this.layer.link, 0, 0, full.width, full.height);
		}
		const scale = Math.min(1, PREVIEW_SIDE / Math.max(full.width, full.height));
		const small = document.createElement('canvas');
		small.width = Math.max(1, Math.round(full.width * scale));
		small.height = Math.max(1, Math.round(full.height * scale));
		small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);
		this.source = {full, scale, small: image_data_of(small)};
	}

	set_mode(mode) {
		if (!MODES.includes(mode)) {
			return;
		}
		if (QUAD_MODES.includes(mode) && !this.enter_quad()) {
			return;
		}
		this.mode = mode;
		this.update_bar();
		config.need_render = true;
	}

	/**
	 * What a press does here
	 *
	 * @param {MouseEvent} event
	 * @param {{x: number, y: number}} point
	 * @returns {string|null}
	 */
	kind_at(event, point) {
		const reach = REACH / this.zoom();
		if (this.quad) {
			return quad_hit_test(this.quad, point, reach);
		}
		let kind = hit_test(this.frame, point, reach);
		if (this.mode == 'scale' && kind == 'rotate') {
			return null;
		}
		if (this.mode == 'rotate' && FRAME_HANDLES.includes(kind)) {
			kind = 'rotate';
		}
		if (kind == 'rotate' && !this.can_rotate) {
			return null;
		}
		return kind;
	}

	pointer_down(event) {
		if (this.menu.host) {
			if (this.menu.host.contains(event.target)) {
				return;
			}
			//a click anywhere else closes the menu of the session
			this.menu.hide();
			if (this.on_canvas(event)) {
				event.stopImmediatePropagation();
				event.preventDefault();
			}
			return;
		}
		if (!this.on_canvas(event)) {
			return;
		}
		//the tools do not get the click while the session is on
		event.stopImmediatePropagation();
		event.preventDefault();
		if (event.button !== 0) {
			return;
		}
		const point = this.point(event);
		let kind = this.kind_at(event, point);
		if ((event.ctrlKey || event.metaKey) && this.quad == null && FRAME_HANDLES.includes(kind) && this.mode != 'rotate') {
			//Ctrl / Cmd + a corner distorts, + an edge skews
			if (!this.enter_quad()) {
				return;
			}
			kind = quad_hit_test(this.quad, point, REACH / this.zoom());
		}
		if (kind) {
			this.dragging = {
				kind, from: point, frame: Object.assign({}, this.frame), quad: this.quad ? this.quad.map((c) => [c[0], c[1]]) : null,
			};
		}
	}

	pointer_move(event) {
		if (this.dragging == null) {
			if (this.on_canvas(event) && !this.menu.host) {
				const kind = this.kind_at(event, this.point(event));
				if (kind != this.hover) {
					this.hover = kind;
					const wrapper = document.getElementById('main_wrapper');
					if (wrapper) {
						wrapper.style.cursor = CURSORS[kind] || 'default';
					}
				}
			}
			return;
		}
		event.stopImmediatePropagation();
		const point = this.point(event);
		const drag = this.dragging;
		if (drag.quad) {
			const next = drag_quad(drag.quad, this.mode, drag.kind, drag.from, point, {shift: event.shiftKey});
			if (is_valid_quad(next)) {
				this.quad = next;
			}
		}
		else {
			this.frame = drag_frame(drag.frame, drag.kind, drag.from, point, {
				shift: event.shiftKey, alt: event.altKey, ratio_default: this.is_image,
			});
		}
		this.schedule_preview();
	}

	pointer_up() {
		if (this.dragging) {
			this.dragging = null;
			this.show_preview();
		}
	}

	key_down(event) {
		if (document.getElementById('popups').children.length > 0 || this.menu.host) {
			return;
		}
		const in_bar = this.bar && this.bar.contains(event.target) && event.target.tagName == 'INPUT';
		if (event.key == 'Enter') {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (in_bar) {
				//the typed number is taken, the session goes on
				this.field_changed(event.target);
				return;
			}
			this.apply();
		}
		else if (event.key == 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.cancel();
		}
		else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() == 'z') {
			//Undo while transforming throws the transformation away
			event.preventDefault();
			event.stopImmediatePropagation();
			this.cancel();
		}
		else if (!in_bar && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
			//the arrows nudge the frame (Shift by 10 pixels), not the layer
			event.preventDefault();
			event.stopImmediatePropagation();
			const step = event.shiftKey ? 10 : 1;
			const dx = event.key == 'ArrowLeft' ? -step : (event.key == 'ArrowRight' ? step : 0);
			const dy = event.key == 'ArrowUp' ? -step : (event.key == 'ArrowDown' ? step : 0);
			if (this.quad) {
				this.quad = this.quad.map((c) => [c[0] + dx, c[1] + dy]);
			}
			else {
				this.frame = Object.assign({}, this.frame, {cx: this.frame.cx + dx, cy: this.frame.cy + dy});
			}
			this.show_preview();
		}
	}

	context_menu(event) {
		if (!this.on_canvas(event)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if (this.dragging) {
			//Ctrl + click is the right button on macOS: a Ctrl drag of a handle must not open the menu
			return;
		}
		this.menu.show(event, SESSION_MENU, (target) => this.run_menu(target));
	}

	run_menu(target) {
		const [command, value] = String(target).split(':');
		if (command == 'mode') {
			this.set_mode(value);
		}
		else if (command == 'warp') {
			//Edit > Warp has its own dialog; the transformation made so far is dropped
			this.cancel();
			app.GUI.run_target('edit/warp.warp');
		}
		else if (command == 'turn') {
			this.turn(parseFloat(value));
		}
		else if (command == 'flip') {
			this.flip(value == 'h');
		}
	}

	turn(degrees) {
		if (this.quad) {
			this.quad = rotate_quad(this.quad, quad_center(this.quad), degrees);
		}
		else {
			if (!this.can_rotate) {
				alertify.error(t('Rotate is not supported on this type of object. Convert to raster?'));
				return;
			}
			this.frame = turn_frame(this.frame, degrees);
		}
		this.show_preview();
	}

	flip(horizontal) {
		if (this.piece == null && !this.is_image) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (this.quad) {
			this.quad = flip_quad(this.quad, horizontal);
		}
		else {
			this.frame = flip_frame(this.frame, horizontal);
		}
		this.show_preview();
	}

	reset() {
		this.frame = Object.assign({}, this.start_frame);
		this.quad = null;
		this.mode = 'free';
		this.update_bar();
		this.show_preview();
	}

	schedule_preview() {
		config.need_render = true;
		if (this.scheduled) {
			return;
		}
		this.scheduled = true;
		requestAnimationFrame(() => {
			this.scheduled = false;
			if (this.active) {
				this.show_preview();
			}
		});
	}

	/**
	 * The layer (or the lifted pixels) as it would be
	 */
	show_preview() {
		const layer = this.layer;
		if (this.quad) {
			this.prepare_source();
			const scale = this.source.scale;
			const result = warp_to_quad(this.source.small, this.quad.map((c) => [c[0] * scale, c[1] * scale]));
			if (result != null) {
				this.preview_quad = {canvas: canvas_of(result.image), x: result.x / scale, y: result.y / scale, scale};
			}
			if (this.piece == null && this.preview_quad) {
				layer.link_canvas = this.preview_quad.canvas;
				layer.x = this.preview_quad.x;
				layer.y = this.preview_quad.y;
				layer.width = this.preview_quad.canvas.width / scale;
				layer.height = this.preview_quad.canvas.height / scale;
				layer.rotate = 0;
			}
		}
		else if (this.piece == null) {
			const box = this.frame;
			layer.x = box.cx - box.width / 2;
			layer.y = box.cy - box.height / 2;
			layer.width = box.width;
			layer.height = box.height;
			if (this.can_rotate) {
				layer.rotate = box.angle;
			}
			if (this.is_image) {
				const flipped = this.flipped_canvas();
				if (flipped) {
					layer.link_canvas = flipped;
				}
				else {
					this.restore_link_canvas();
				}
			}
		}
		this.sync_bar();
		config.need_render = true;
	}

	/**
	 * @returns {HTMLCanvasElement|null} the picture of the layer mirrored as the frame is (null when it is not mirrored)
	 */
	flipped_canvas() {
		const fx = this.frame.flip_x;
		const fy = this.frame.flip_y;
		if (!fx && !fy) {
			return null;
		}
		const key = `${fx}|${fy}`;
		if (this.flip_cache && this.flip_cache.key == key) {
			return this.flip_cache.canvas;
		}
		const source = this.saved.link_canvas || this.layer.link;
		const width = source.naturalWidth || source.width;
		const height = source.naturalHeight || source.height;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		ctx.translate(fx ? width : 0, fy ? height : 0);
		ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
		ctx.drawImage(source, 0, 0);
		this.flip_cache = {key, canvas};
		return canvas;
	}

	restore_link_canvas() {
		if (this.piece) {
			this.layer.link_canvas = this.piece.hole;
		}
		else if (this.saved.has_link_canvas) {
			this.layer.link_canvas = this.saved.link_canvas;
		}
		else {
			delete this.layer.link_canvas;
		}
	}

	/**
	 * the lifted pixels where they would be, the frame and its handles
	 */
	draw(ctx) {
		if (!this.active) {
			return;
		}
		const scale = 1 / this.zoom();
		ctx.save();
		if (this.piece) {
			ctx.globalAlpha = (this.layer.opacity ?? 100) / 100;
			if (this.quad) {
				const p = this.preview_quad;
				if (p) {
					ctx.drawImage(p.canvas, p.x, p.y, p.canvas.width / p.scale, p.canvas.height / p.scale);
				}
			}
			else {
				const f = this.frame;
				ctx.save();
				ctx.translate(f.cx, f.cy);
				ctx.rotate(f.angle * Math.PI / 180);
				ctx.scale(f.flip_x ? -1 : 1, f.flip_y ? -1 : 1);
				ctx.drawImage(this.piece.canvas, -f.width / 2, -f.height / 2, f.width, f.height);
				ctx.restore();
			}
			ctx.globalAlpha = 1;
		}
		let corners;
		let handles;
		if (this.quad) {
			corners = this.quad.map((c) => ({x: c[0], y: c[1]}));
			handles = CORNER_HANDLES.concat(EDGE_HANDLES).map((name) => ({name, p: handle_position(this.quad, name)}));
		}
		else {
			const points = frame_handles(this.frame);
			corners = ['tl', 'tr', 'br', 'bl'].map((name) => points[name]);
			handles = FRAME_HANDLES.map((name) => ({name, p: points[name]}));
		}
		ctx.beginPath();
		corners.forEach((p, i) => (i == 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
		ctx.closePath();
		ctx.lineWidth = 3 * scale;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.stroke();
		ctx.lineWidth = scale;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		const size = HANDLE_SIZE * scale;
		handles.forEach((handle) => {
			ctx.fillStyle = this.dragging && this.dragging.kind == handle.name ? '#0a84ff' : '#ffffff';
			ctx.fillRect(handle.p.x - size / 2, handle.p.y - size / 2, size, size);
			ctx.lineWidth = scale;
			ctx.strokeStyle = '#222222';
			ctx.strokeRect(handle.p.x - size / 2, handle.p.y - size / 2, size, size);
		});
		ctx.restore();
	}

	finish() {
		this.active = false;
		document.removeEventListener('mousedown', this.on_down, true);
		document.removeEventListener('mousemove', this.on_move, true);
		document.removeEventListener('mouseup', this.on_up, true);
		document.removeEventListener('keydown', this.on_key, true);
		document.removeEventListener('contextmenu', this.on_menu, true);
		document.removeEventListener('minipaint:history', this.on_history);
		config.view_overlay = null;
		this.dragging = null;
		this.menu.hide();
		const wrapper = document.getElementById('main_wrapper');
		if (wrapper) {
			wrapper.style.cursor = '';
		}
		if (this.bar) {
			this.bar.remove();
			this.bar = null;
		}
		if (this.edges_hidden_before !== undefined) {
			set_edges_hidden(this.edges_hidden_before);
			this.edges_hidden_before = undefined;
		}
		this.source = null;
		this.flip_cache = null;
		this.preview_quad = null;
		config.need_render = true;
	}

	/**
	 * the layer as it was before the session
	 */
	restore() {
		const layer = this.layer;
		layer.x = this.saved.x;
		layer.y = this.saved.y;
		layer.width = this.saved.width;
		layer.height = this.saved.height;
		layer.rotate = this.saved.rotate;
		if (this.saved.has_link_canvas) {
			layer.link_canvas = this.saved.link_canvas;
		}
		else {
			delete layer.link_canvas;
		}
		config.need_render = true;
	}

	cancel() {
		if (!this.active) {
			return;
		}
		this.finish();
		this.restore();
	}

	apply() {
		if (!this.active) {
			return;
		}
		const layer = this.layer;
		const unchanged = this.quad == null && same_frame(this.frame, this.start_frame);
		const state = {frame: this.frame, quad: this.quad, piece: this.piece};
		const source = this.quad ? this.source : null;
		this.finish();
		this.restore();
		if (unchanged) {
			return;
		}
		if (config.layers.indexOf(layer) < 0) {
			return;
		}
		if (state.piece) {
			return this.apply_selection(layer, state);
		}
		if (state.quad) {
			return this.apply_quad(layer, state.quad, source.full);
		}
		return this.apply_frame(layer, state.frame);
	}

	/**
	 * The whole layer moved, scaled, turned (and mirrored, for a picture) - a vector layer stays a vector
	 */
	async apply_frame(layer, frame) {
		const settings = {
			x: Math.round(frame.cx - frame.width / 2),
			y: Math.round(frame.cy - frame.height / 2),
			width: Math.max(1, Math.round(frame.width)),
			height: Math.max(1, Math.round(frame.height)),
		};
		if (this.can_rotate) {
			settings.rotate = frame.angle;
		}
		const actions = [];
		let flipped = null;
		if (this.is_image && (frame.flip_x || frame.flip_y)) {
			this.frame = frame;
			flipped = this.flipped_canvas();
			this.flip_cache = null;
			actions.push(new app.Actions.Update_layer_image_action(flipped, layer.id));
			['mask', 'smart_mask'].forEach((key) => {
				const mask = layer[key] ? deserialize_layer_mask(layer[key]) : null;
				if (mask) {
					settings[key] = serialize_layer_mask(flip_mask(mask, frame.flip_x, frame.flip_y));
				}
			});
		}
		else {
			remember_transform(describe_transform(
				{x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotate: layer.rotate || 0},
				{x: settings.x, y: settings.y, width: settings.width, height: settings.height, rotate: settings.rotate ?? (layer.rotate || 0)}
			));
		}
		actions.push(new app.Actions.Update_layer_action(layer.id, settings));
		if (flipped) {
			//the picture is shown from this canvas until the layer has its new image
			layer.link_canvas = flipped;
		}
		try {
			await app.State.do_action(new app.Actions.Bundle_action('free_transform', 'Free Transform', actions));
		}
		finally {
			if (flipped) {
				this.restore_saved_link(layer);
			}
		}
	}

	restore_saved_link(layer) {
		if (this.saved.has_link_canvas) {
			layer.link_canvas = this.saved.link_canvas;
		}
		else {
			delete layer.link_canvas;
		}
		config.need_render = true;
	}

	/**
	 * The whole picture layer onto a free shape, in pixels
	 */
	async apply_quad(layer, quad, full) {
		const bounds = quad_bounds(quad);
		if (bounds.width > MAX_SIDE || bounds.height > MAX_SIDE) {
			alertify.error(t('The result would be too big.'));
			return;
		}
		const result = warp_to_quad(image_data_of(full), quad);
		if (result == null) {
			alertify.error(t('The corners make a shape that folds over itself.'));
			return;
		}
		const canvas = canvas_of(result.image);
		await app.State.do_action(
			new app.Actions.Bundle_action('free_transform', 'Free Transform', [
				new app.Actions.Update_layer_image_action(canvas, layer.id),
				new app.Actions.Update_layer_action(layer.id, {
					x: result.x,
					y: result.y,
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
					rotate: 0,
				}),
			])
		);
	}

	/**
	 * The lifted pixels put back where the frame is; the layer grows to hold them (a layer with a layer mask keeps its
	 * size and what falls out of it is lost). The selection follows the pixels.
	 */
	async apply_selection(layer, state) {
		const piece = state.piece;
		const quad = state.quad || frame_quad(state.frame);
		const bounds = quad_bounds(quad);
		if (bounds.width > MAX_SIDE || bounds.height > MAX_SIDE) {
			alertify.error(t('The result would be too big.'));
			return;
		}
		const pixels = warp_to_quad(image_data_of(piece.canvas), quad);
		const shape = warp_to_quad(piece.mask, quad);
		if (pixels == null || shape == null) {
			alertify.error(t('The corners make a shape that folds over itself.'));
			return;
		}
		const origin = piece.origin;
		const grow = !layer.mask && !layer.smart_mask;
		const area = grow ? union_rect(origin, {x: pixels.x, y: pixels.y, width: pixels.image.width, height: pixels.image.height}) : origin;
		if (area.width > MAX_SIDE || area.height > MAX_SIDE) {
			alertify.error(t('The result would be too big.'));
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = area.width;
		canvas.height = area.height;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(piece.hole, origin.x - area.x, origin.y - area.y);
		ctx.drawImage(canvas_of(pixels.image), pixels.x - area.x, pixels.y - area.y);

		//the selection where the pixels went
		const mask = create_mask(config.WIDTH, config.HEIGHT);
		const shape_image = shape.image;
		for (let y = 0; y < shape_image.height; y++) {
			const ty = shape.y + y;
			if (ty < 0 || ty >= mask.height) {
				continue;
			}
			for (let x = 0; x < shape_image.width; x++) {
				const tx = shape.x + x;
				if (tx >= 0 && tx < mask.width) {
					mask.data[ty * mask.width + tx] = shape_image.data[(y * shape_image.width + x) * 4 + 3];
				}
			}
		}
		const selection_actions = this.selection.mask_actions(mask) || [new app.Actions.Reset_selection_action()];

		const actions = [new app.Actions.Update_layer_image_action(canvas, layer.id)];
		if (area.x != origin.x || area.y != origin.y || area.width != origin.width || area.height != origin.height) {
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: area.x,
				y: area.y,
				width: area.width,
				height: area.height,
				width_original: area.width,
				height_original: area.height,
			}));
		}
		if (actions.length == 1) {
			//the picture is shown from this canvas until the layer has its new image (only when the size stays)
			layer.link_canvas = canvas;
		}
		try {
			await app.State.do_action(new app.Actions.Bundle_action('free_transform', 'Free Transform', actions.concat(selection_actions)));
		}
		finally {
			this.restore_saved_link(layer);
		}
	}

	/**
	 * the bar at the top: the numbers, Flip, Reset, Cancel, Apply
	 */
	show_bar() {
		const bar = document.createElement('div');
		bar.className = 'distort_bar free_transform_bar';
		bar.setAttribute('role', 'toolbar');
		bar.setAttribute('aria-label', t('Free Transform'));
		const button = (text, handler) => {
			const element = document.createElement('button');
			element.type = 'button';
			element.textContent = t(text);
			element.addEventListener('click', handler);
			bar.appendChild(element);
			return element;
		};
		const divider = () => {
			const element = document.createElement('span');
			element.className = 'distort_bar_divider';
			bar.appendChild(element);
		};
		this.inputs = {};
		NUMBER_FIELDS.forEach((definition) => {
			const label = document.createElement('label');
			label.textContent = t(definition.label);
			const input = document.createElement('input');
			input.type = 'number';
			input.step = 'any';
			input.dataset.field = definition.field;
			input.addEventListener('change', () => this.field_changed(input));
			label.appendChild(input);
			bar.appendChild(label);
			this.inputs[definition.field] = input;
		});
		divider();
		button('Flip Horizontal', () => this.flip(true));
		button('Flip Vertical', () => this.flip(false));
		divider();
		button('Reset', () => this.reset());
		button('Cancel', () => this.cancel());
		const apply = button('Apply', () => this.apply());
		apply.className = 'primary';
		document.body.appendChild(bar);
		this.bar = bar;
		this.update_bar();
	}

	update_bar() {
		if (!this.inputs) {
			return;
		}
		Object.keys(this.inputs).forEach((field) => {
			this.inputs[field].disabled = this.quad != null || (field == 'rotate' && !this.can_rotate);
		});
		this.sync_bar();
	}

	sync_bar() {
		if (!this.bar || !this.inputs) {
			return;
		}
		const values = frame_fields(this.frame);
		Object.keys(this.inputs).forEach((field) => {
			const input = this.inputs[field];
			if (document.activeElement !== input) {
				input.value = this.quad ? '' : String(Math.round(values[field] * 100) / 100);
			}
		});
	}

	field_changed(input) {
		if (!this.active || this.quad) {
			return;
		}
		const next = frame_from_field(this.frame, input.dataset.field, input.value, this.is_image);
		if (next) {
			this.frame = next;
			this.show_preview();
		}
		else {
			this.sync_bar();
		}
	}
}

/**
 * The marching ants of the selection are hidden while its pixels are transformed (they would show the old place)
 *
 * @param {Edit_free_transform_session_class} session
 */
function set_edges_hidden_saved(session) {
	session.edges_hidden_before = are_edges_hidden();
	set_edges_hidden(true);
}

export default Edit_free_transform_session_class;
