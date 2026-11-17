import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_tools_class from './../../core/base-tools.js';
import {
	PUPPET_DENSITIES, MAX_EXPANSION, build_mesh, clean_expansion, locate_point, point_at, mesh_distances, mls_rigid,
	triangle_affine, expand_triangle, mesh_bounds, find_pin,
} from './../../libs/puppet-warp.js';
import { alpha_bounds } from './../../libs/layer-styles.js';
import { is_typing_target } from './../../libs/shortcuts.js';
import { t } from '../tools/translate.js';

const MAX_SIDE = 8192;
const PREVIEW_PIXELS = 1000000; //the picture is reduced to this while a pin is dragged
const PIN_RADIUS = 6; //screen pixels
const REACH = 10; //screen pixels
const SEAM = 0.6; //pixels every drawn triangle grows by, so no seams are seen between them

let instance = null;

/**
 * Edit > Puppet Warp: a triangle mesh over the opaque pixels of the active image layer. A click on the mesh puts a pin,
 * dragging a pin bends the picture around the other pins, Alt + click on a pin removes it, Backspace removes the
 * selected pin. Enter or Apply makes the change (one history step), Escape or Cancel throws it away.
 *
 * The deformation is the rigid Moving Least Squares (libs/puppet-warp.js) of the mesh vertices with the distances
 * measured along the mesh; every triangle is then drawn with its own affine transformation. While the session runs,
 * the layer shows the bent picture through `link_canvas` (so it keeps its place in the stack, its opacity and blend
 * mode); the mesh and the pins are drawn through `config.view_overlay`.
 */
class Edit_puppet_warp_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
		this.active = false;
		this.density = 'Normal';
		this.expansion = 2;
		this.show_mesh = true;
		this.pointer = new Base_tools_class(); //only for the position of the mouse on the picture
	}

	puppet_warp() {
		if (this.active) {
			return;
		}
		const layer = config.layer;
		if (layer == null || layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (layer.rotate) {
			alertify.error(t('This does not work on a rotated layer. Turn it back to 0° first.'));
			return;
		}
		if (layer.mask) {
			alertify.error(t('Apply or delete the layer mask first.'));
			return;
		}
		this.layer = layer;
		this.w = Math.max(1, Math.round(layer.width));
		this.h = Math.max(1, Math.round(layer.height));

		//the picture as it is shown on the canvas (also when the layer was stretched)
		this.full = document.createElement('canvas');
		this.full.width = this.w;
		this.full.height = this.h;
		this.full.getContext('2d').drawImage(layer.link, 0, 0, this.w, this.h);
		this.image = this.full.getContext('2d').getImageData(0, 0, this.w, this.h);

		//a smaller copy for dragging
		this.small_scale = Math.min(1, Math.sqrt(PREVIEW_PIXELS / (this.w * this.h)));
		if (this.small_scale < 1) {
			this.small = document.createElement('canvas');
			this.small.width = Math.max(1, Math.round(this.w * this.small_scale));
			this.small.height = Math.max(1, Math.round(this.h * this.small_scale));
			this.small.getContext('2d').drawImage(this.full, 0, 0, this.small.width, this.small.height);
		}
		else {
			this.small = this.full;
		}

		this.pins = [];
		this.selected = -1;
		this.dragging = null;
		if (!this.rebuild_mesh()) {
			alertify.error(t('The layer is empty.'));
			return;
		}
		this.saved = {x: layer.x, y: layer.y, width: layer.width, height: layer.height, link_canvas: layer.link_canvas};
		this.origin = {x: layer.x, y: layer.y};
		this.active = true;

		this.on_down = (event) => this.pointer_down(event);
		this.on_move = (event) => this.pointer_move(event);
		this.on_up = () => this.pointer_up();
		this.on_key = (event) => this.key_down(event);
		document.addEventListener('mousedown', this.on_down, true);
		document.addEventListener('mousemove', this.on_move, true);
		document.addEventListener('mouseup', this.on_up, true);
		document.addEventListener('keydown', this.on_key, true);
		config.view_overlay = (ctx) => this.draw(ctx);

		this.show_bar();
		this.deform();
		this.show_preview(false);
	}

	/**
	 * A new mesh by the current density and expansion; the pins stay where they are on the picture (the ones that
	 * fall out of the new mesh are dropped)
	 *
	 * @returns {boolean} false when the layer has no opaque pixel
	 */
	rebuild_mesh() {
		const mesh = build_mesh(this.image, {density: this.density, expansion: this.expansion});
		if (mesh == null) {
			return false;
		}
		this.mesh = mesh;
		this.pins = this.pins.filter((pin) => {
			const place = locate_point(mesh.vertices, mesh.triangles, pin.x, pin.y);
			if (place == null) {
				return false;
			}
			pin.distances = mesh_distances(mesh, place, pin.x, pin.y);
			return true;
		});
		this.selected = Math.min(this.selected, this.pins.length - 1);
		return true;
	}

	deform() {
		this.deformed = mls_rigid(this.mesh.vertices, this.pins);
	}

	/**
	 * Draws the bent picture.
	 *
	 * @param {boolean} reduced the smaller copy (while dragging)
	 * @returns {{canvas: HTMLCanvasElement, x: number, y: number, scale: number}|null} x, y = the corner of the canvas
	 *   measured from the original corner of the layer, in pixels of the document
	 */
	render(reduced) {
		const scale = reduced ? this.small_scale : 1;
		const source = reduced ? this.small : this.full;
		const bounds = mesh_bounds(this.deformed);
		if (bounds.width * scale > MAX_SIDE || bounds.height * scale > MAX_SIDE) {
			return null;
		}
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
		canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		const vertices = this.mesh.vertices;
		const deformed = this.deformed;
		const triangles = this.mesh.triangles;
		const sw = source.width;
		const sh = source.height;
		for (let i = 0; i < triangles.length; i += 3) {
			const s = [];
			const d = [];
			for (let k = 0; k < 3; k++) {
				const v = triangles[i + k];
				s.push(vertices[v * 2] * scale, vertices[v * 2 + 1] * scale);
				d.push((deformed[v * 2] - bounds.x) * scale, (deformed[v * 2 + 1] - bounds.y) * scale);
			}
			//the part of the source under the triangle (with a margin for the grown edge)
			const x0 = Math.max(0, Math.floor(Math.min(s[0], s[2], s[4])) - 2);
			const y0 = Math.max(0, Math.floor(Math.min(s[1], s[3], s[5])) - 2);
			const x1 = Math.min(sw, Math.ceil(Math.max(s[0], s[2], s[4])) + 2);
			const y1 = Math.min(sh, Math.ceil(Math.max(s[1], s[3], s[5])) + 2);
			if (x1 <= x0 || y1 <= y0) {
				continue; //only the expansion, nothing to draw
			}
			const matrix = triangle_affine(s, d);
			if (matrix == null) {
				continue;
			}
			const clip = expand_triangle(d, SEAM);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(clip[0], clip[1]);
			ctx.lineTo(clip[2], clip[3]);
			ctx.lineTo(clip[4], clip[5]);
			ctx.closePath();
			ctx.clip();
			ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
			ctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
			ctx.restore();
		}
		return {canvas, x: bounds.x, y: bounds.y, scale};
	}

	/**
	 * The layer shows the bent picture
	 *
	 * @param {boolean} reduced
	 */
	show_preview(reduced) {
		let result = this.render(reduced);
		if (result == null && !reduced) {
			result = this.render(true);
		}
		if (result == null) {
			return;
		}
		const layer = this.layer;
		layer.link_canvas = result.canvas;
		layer.x = this.origin.x + result.x;
		layer.y = this.origin.y + result.y;
		layer.width = result.canvas.width / result.scale;
		layer.height = result.canvas.height / result.scale;
		config.need_render = true;
	}

	schedule_preview() {
		if (this.scheduled) {
			return;
		}
		this.scheduled = true;
		requestAnimationFrame(() => {
			this.scheduled = false;
			if (this.active) {
				this.show_preview(this.dragging != null);
			}
		});
	}

	/**
	 * @returns {{x: number, y: number}} the position of the mouse measured from the original corner of the layer
	 */
	local_point(event) {
		const point = this.pointer.get_mouse_coordinates_from_event(event);
		return {x: point.x - this.origin.x, y: point.y - this.origin.y};
	}

	on_canvas(event) {
		return event.target && (event.target.id == 'canvas_minipaint' || event.target.id == 'main_wrapper');
	}

	pointer_down(event) {
		if (!this.on_canvas(event) || event.button !== 0) {
			return;
		}
		//the tools do not get the click while the session is on
		event.stopImmediatePropagation();
		event.preventDefault();
		const point = this.local_point(event);
		const hit = find_pin(this.pins, point.x, point.y, REACH / (config.ZOOM || 1));
		if (event.altKey) {
			if (hit >= 0) {
				this.remove_pin(hit);
			}
			return;
		}
		if (hit >= 0) {
			this.selected = hit;
			const pin = this.pins[hit];
			this.dragging = {pin: hit, dx: pin.tx - point.x, dy: pin.ty - point.y};
			config.need_render = true;
			return;
		}
		//a new pin where the bent mesh is clicked
		const place = locate_point(this.deformed, this.mesh.triangles, point.x, point.y);
		if (place == null) {
			return;
		}
		const source = point_at(this.mesh.vertices, this.mesh.triangles, place);
		this.pins.push({
			x: source.x,
			y: source.y,
			tx: point.x,
			ty: point.y,
			distances: mesh_distances(this.mesh, place, source.x, source.y),
		});
		this.selected = this.pins.length - 1;
		this.dragging = {pin: this.selected, dx: 0, dy: 0};
		this.deform();
		this.schedule_preview();
	}

	pointer_move(event) {
		if (this.dragging == null) {
			return;
		}
		event.stopImmediatePropagation();
		const point = this.local_point(event);
		const pin = this.pins[this.dragging.pin];
		pin.tx = point.x + this.dragging.dx;
		pin.ty = point.y + this.dragging.dy;
		this.deform();
		this.schedule_preview();
		config.need_render = true;
	}

	pointer_up() {
		if (this.dragging) {
			this.dragging = null;
			this.show_preview(false);
		}
	}

	remove_pin(index) {
		this.pins.splice(index, 1);
		this.selected = this.pins.length > 0 ? Math.min(index, this.pins.length - 1) : -1;
		this.dragging = null;
		this.deform();
		this.show_preview(false);
	}

	key_down(event) {
		if (document.getElementById('popups').children.length > 0) {
			return;
		}
		if (event.key == 'Enter') {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.apply();
		}
		else if (event.key == 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.cancel();
		}
		else if ((event.key == 'Backspace' || event.key == 'Delete') && !is_typing_target(event.target)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (this.selected >= 0) {
				this.remove_pin(this.selected);
			}
		}
	}

	/**
	 * the mesh and the pins
	 */
	draw(ctx) {
		if (!this.active) {
			return;
		}
		const unit = 1 / (config.ZOOM || 1);
		const ox = this.origin.x;
		const oy = this.origin.y;
		const deformed = this.deformed;
		ctx.save();
		if (this.show_mesh) {
			const triangles = this.mesh.triangles;
			ctx.beginPath();
			for (let i = 0; i < triangles.length; i += 3) {
				const a = triangles[i];
				const b = triangles[i + 1];
				const c = triangles[i + 2];
				ctx.moveTo(ox + deformed[a * 2], oy + deformed[a * 2 + 1]);
				ctx.lineTo(ox + deformed[b * 2], oy + deformed[b * 2 + 1]);
				ctx.lineTo(ox + deformed[c * 2], oy + deformed[c * 2 + 1]);
				ctx.closePath();
			}
			ctx.lineWidth = unit;
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
			ctx.stroke();
		}
		this.pins.forEach((pin, i) => {
			const x = ox + pin.tx;
			const y = oy + pin.ty;
			ctx.beginPath();
			ctx.arc(x, y, PIN_RADIUS * unit, 0, Math.PI * 2);
			ctx.fillStyle = '#ffd60a';
			ctx.fill();
			ctx.lineWidth = unit;
			ctx.strokeStyle = '#222222';
			ctx.stroke();
			if (i == this.selected) {
				ctx.beginPath();
				ctx.arc(x, y, PIN_RADIUS * 0.45 * unit, 0, Math.PI * 2);
				ctx.fillStyle = '#000000';
				ctx.fill();
			}
		});
		ctx.restore();
	}

	finish() {
		this.active = false;
		document.removeEventListener('mousedown', this.on_down, true);
		document.removeEventListener('mousemove', this.on_move, true);
		document.removeEventListener('mouseup', this.on_up, true);
		document.removeEventListener('keydown', this.on_key, true);
		config.view_overlay = null;
		this.dragging = null;
		if (this.bar) {
			this.bar.remove();
			this.bar = null;
		}
	}

	restore() {
		const layer = this.layer;
		layer.x = this.saved.x;
		layer.y = this.saved.y;
		layer.width = this.saved.width;
		layer.height = this.saved.height;
		if (this.saved.link_canvas) {
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
		const moved = this.pins.some((pin) => pin.tx != pin.x || pin.ty != pin.y);
		const result = moved ? this.render(false) : null;
		const layer = this.layer;
		const origin = this.origin;
		this.finish();
		this.restore();
		if (!moved) {
			return;
		}
		if (result == null) {
			alertify.error(t('The result would be too big.'));
			return;
		}
		//without the transparent margin of the expansion
		const ctx = result.canvas.getContext('2d');
		const box = alpha_bounds(ctx.getImageData(0, 0, result.canvas.width, result.canvas.height));
		if (box == null) {
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = box.width;
		canvas.height = box.height;
		canvas.getContext('2d').drawImage(result.canvas, -box.x, -box.y);
		return app.State.do_action(
			new app.Actions.Bundle_action('puppet_warp', 'Puppet Warp', [
				new app.Actions.Update_layer_image_action(canvas, layer.id),
				new app.Actions.Update_layer_action(layer.id, {
					x: Math.round(origin.x + result.x + box.x),
					y: Math.round(origin.y + result.y + box.y),
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
				}),
			])
		);
	}

	/**
	 * the bar at the top: the options of the mesh and the buttons that end the session
	 */
	show_bar() {
		const bar = document.createElement('div');
		bar.className = 'distort_bar puppet_bar';
		bar.setAttribute('role', 'toolbar');
		bar.setAttribute('aria-label', t('Puppet Warp'));
		const label = (text, control) => {
			const element = document.createElement('label');
			element.textContent = `${t(text)} `;
			element.appendChild(control);
			bar.appendChild(element);
			return element;
		};

		const density = document.createElement('select');
		PUPPET_DENSITIES.forEach((value) => {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = t(value);
			option.selected = value == this.density;
			density.appendChild(option);
		});
		density.addEventListener('change', () => {
			this.density = PUPPET_DENSITIES.includes(density.value) ? density.value : 'Normal';
			this.update_mesh();
		});
		label('Density:', density);

		const expansion = document.createElement('input');
		expansion.type = 'number';
		expansion.min = '0';
		expansion.max = String(MAX_EXPANSION);
		expansion.step = '1';
		expansion.value = String(this.expansion);
		expansion.addEventListener('change', () => {
			this.expansion = clean_expansion(expansion.value);
			expansion.value = String(this.expansion);
			this.update_mesh();
		});
		label('Expansion:', expansion);

		const mesh = document.createElement('input');
		mesh.type = 'checkbox';
		mesh.checked = this.show_mesh;
		mesh.addEventListener('change', () => {
			this.show_mesh = mesh.checked;
			config.need_render = true;
		});
		const mesh_label = document.createElement('label');
		mesh_label.appendChild(mesh);
		mesh_label.appendChild(document.createTextNode(` ${t('Show Mesh')}`));
		bar.appendChild(mesh_label);

		const divider = document.createElement('span');
		divider.className = 'distort_bar_divider';
		bar.appendChild(divider);
		const button = (text, handler) => {
			const element = document.createElement('button');
			element.type = 'button';
			element.textContent = t(text);
			element.addEventListener('click', handler);
			bar.appendChild(element);
			return element;
		};
		button('Remove All Pins', () => {
			this.pins = [];
			this.selected = -1;
			this.deform();
			this.show_preview(false);
		});
		button('Cancel', () => this.cancel());
		const apply = button('Apply', () => this.apply());
		apply.className = 'primary';
		document.body.appendChild(bar);
		this.bar = bar;
	}

	update_mesh() {
		if (!this.active) {
			return;
		}
		this.rebuild_mesh();
		this.deform();
		this.show_preview(false);
	}
}

export default Edit_puppet_warp_class;
