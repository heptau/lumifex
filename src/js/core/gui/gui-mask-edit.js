import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../base-tools.js';
import Selection_mask_class from './../selection-mask-state.js';
import { serialize_layer_mask, deserialize_layer_mask, uniform_layer_mask } from './../../libs/layer-mask.js';
import { mask_value_of_color, paint_value_line, fill_mask_value, gradient_mask, selection_weights, mask_to_rgba } from './../../libs/mask-paint.js';
import { t } from './../../modules/tools/translate.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

//tools that paint into the layer mask while the mask is the target (Photoshop: a click on the mask thumbnail)
export const MASK_PAINT_TOOLS = ['brush', 'pencil', 'erase', 'gradient', 'fill'];

/**
 * Editing a layer mask with the ordinary tools, as in Photoshop: a click on the mask thumbnail in the Layers panel makes
 * the mask the target, then Brush, Pencil, Eraser, Gradient and Paint Bucket paint into it in shades of gray (black
 * hides, white reveals; the Eraser paints the background color). A click on the layer thumbnail makes the pixels the
 * target again. Alt + click on the mask thumbnail shows the mask alone, "\" shows it as a red overlay.
 *
 * Every stroke is one undo step through Update_layer_action; while it is painted the layer shows the mask live.
 */
class GUI_mask_edit_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.layer_id = null; //the layer whose mask is the target
		this.view = 'normal'; //normal | gray (mask alone) | overlay (red over the hidden parts)
		this.session = null; //the stroke being painted
		this.view_cache = null; //{mask, kind, canvas}
		this.tools = null;
	}

	/**
	 * Installs the listeners. They run in the capture phase, before the tools, and take over only while the mask is
	 * the target and a painting tool is active.
	 */
	init() {
		if (this.ready) {
			return;
		}
		this.ready = true;
		this.tools = new Base_tools_class();
		document.addEventListener('mousedown', (event) => this.mousedown(event), true);
		document.addEventListener('mousemove', (event) => this.mousemove(event), true);
		document.addEventListener('mouseup', (event) => this.mouseup(event), true);
	}

	/**
	 * @returns {object|null} the active layer when its mask is the target
	 */
	target_layer() {
		const layer = config.layer;
		if (this.layer_id === null || !layer || layer.id != this.layer_id || !layer.mask) {
			return null;
		}
		return layer;
	}

	is_editing(layer_id) {
		const layer = this.target_layer();
		return layer !== null && (layer_id === undefined || layer.id == layer_id);
	}

	/**
	 * Makes the mask of the layer the target (selects the layer too)
	 */
	async edit_mask(layer_id) {
		const id = layer_id === undefined ? (config.layer ? config.layer.id : null) : parseInt(layer_id, 10);
		const layer = id === null ? null : app.Layers.get_layer(id);
		if (!layer) {
			return;
		}
		if (!layer.mask) {
			alertify.error(t('The layer has no mask.'));
			return;
		}
		if (config.layer.id != layer.id) {
			await app.State.do_action(new app.Actions.Select_layer_action(layer.id));
		}
		this.layer_id = layer.id;
		this.refresh();
	}

	/**
	 * Makes the pixels of the layer the target again
	 */
	edit_layer() {
		if (this.layer_id === null && this.view == 'normal') {
			return;
		}
		this.layer_id = null;
		this.view = 'normal';
		this.refresh();
	}

	/**
	 * Alt + click on the mask thumbnail: the mask alone in gray (a second one shows the picture again)
	 */
	toggle_view_mask(layer_id) {
		if (layer_id !== undefined && (!config.layer || config.layer.id != layer_id)) {
			this.edit_mask(layer_id).then(() => this.toggle_view_mask());
			return;
		}
		if (!config.layer || !config.layer.mask) {
			alertify.error(t('The layer has no mask.'));
			return;
		}
		this.layer_id = config.layer.id;
		this.view = this.view == 'gray' ? 'normal' : 'gray';
		this.refresh();
	}

	/**
	 * "\" - the mask as a red overlay over the hidden parts (the rubylith of Photoshop)
	 */
	toggle_overlay() {
		if (!config.layer || !config.layer.mask) {
			alertify.error(t('The layer has no mask.'));
			return;
		}
		this.layer_id = config.layer.id;
		this.view = this.view == 'overlay' ? 'normal' : 'overlay';
		this.refresh();
	}

	/**
	 * Called after the layers changed: the target ends when another layer is selected or the mask is gone
	 */
	sync() {
		if (this.layer_id !== null && this.target_layer() === null) {
			this.layer_id = null;
			this.view = 'normal';
		}
	}

	refresh() {
		this.sync();
		config.need_render = true;
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
	}

	//mouse

	is_canvas_event(event) {
		const id = event.target && event.target.id;
		return id == 'canvas_minipaint' || id == 'main_wrapper';
	}

	mousedown(event) {
		if (event.button !== 0 || !this.is_canvas_event(event) || MASK_PAINT_TOOLS.includes(config.TOOL.name) == false) {
			return;
		}
		const layer = this.target_layer();
		if (layer === null) {
			return;
		}
		//Alt + click is the eyedropper in the painting tools (it picks the color of the picture as before)
		if (event.altKey && config.TOOL.name != 'erase') {
			return;
		}
		event.stopImmediatePropagation();
		event.preventDefault();
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (layer.rotate) {
			alertify.error(t('Rotate is not supported on this type of object. Convert to raster?'));
			return;
		}
		const work = deserialize_layer_mask(layer.mask) || uniform_layer_mask(layer, 255);
		const point = this.to_mask(this.tools.get_mouse_coordinates_from_event(event), layer, work);
		this.session = {
			layer,
			tool: config.TOOL.name,
			work,
			original: layer.mask,
			start: point,
			last: point,
			base: config.TOOL.name == 'gradient' ? new Uint8ClampedArray(work.data) : null,
		};
		if (this.session.tool == 'fill') {
			fill_mask_value(work, mask_value_of_color(config.COLOR), this.selection_for(layer, work));
			this.finish();
			return;
		}
		if (this.session.tool != 'gradient') {
			this.paint(point, point);
		}
	}

	mousemove(event) {
		if (this.session === null) {
			return;
		}
		event.stopImmediatePropagation();
		const point = this.to_mask(this.tools.get_mouse_coordinates_from_event(event), this.session.layer, this.session.work);
		if (this.session.tool == 'gradient') {
			this.session.end = point;
			this.apply_gradient();
			return;
		}
		this.paint(this.session.last, point);
		this.session.last = point;
	}

	mouseup(event) {
		if (this.session === null) {
			return;
		}
		event.stopImmediatePropagation();
		if (this.session.tool == 'gradient') {
			this.session.end = this.to_mask(this.tools.get_mouse_coordinates_from_event(event), this.session.layer, this.session.work);
			this.apply_gradient();
		}
		this.finish();
	}

	/**
	 * Document position -> position in the mask of the layer
	 */
	to_mask(point, layer, work) {
		return {
			x: (point.x - layer.x) * work.width / layer.width,
			y: (point.y - layer.y) * work.height / layer.height,
		};
	}

	tool_params() {
		const tool = config.TOOLS.find((item) => item.name == this.session.tool);
		const params = {};
		if (tool) {
			for (const key in tool.attributes) {
				const item = tool.attributes[key];
				params[key] = item !== null && typeof item === 'object' && item.value !== undefined ? item.value : item;
			}
		}
		return params;
	}

	paint(from, to) {
		const session = this.session;
		const params = this.tool_params();
		const scale = session.work.width / session.layer.width;
		const size = Math.max(1, parseFloat(params.size) || 1);
		const radius = Math.max(0.5, size / 2 * scale);
		let softness = 0;
		let opacity = 1;
		let color = config.COLOR;
		if (session.tool == 'brush') {
			const hardness = Number.isFinite(parseFloat(params.hardness)) ? parseFloat(params.hardness) : 100;
			softness = 1 - Math.min(100, Math.max(0, hardness)) / 100;
			const flow = Number.isFinite(parseFloat(params.flow)) ? parseFloat(params.flow) : 100;
			opacity = Math.min(100, Math.max(1, flow)) / 100;
		}
		else if (session.tool == 'erase') {
			color = config.COLOR_BG;
			softness = params.strict === false ? 0.5 : 0;
		}
		paint_value_line(session.work, from, to, radius, softness, mask_value_of_color(color), opacity);
		this.show_live();
	}

	apply_gradient() {
		const session = this.session;
		if (!session.end) {
			return;
		}
		const params = this.tool_params();
		const type = String(params.type || 'Linear');
		const shape = type == 'Radial' ? 'radial' : (type == 'Reflected' ? 'reflected' : 'linear');
		let start = mask_value_of_color(config.COLOR);
		let end = mask_value_of_color(config.COLOR_BG);
		if (params.reverse === true) {
			[start, end] = [end, start];
		}
		session.work.data.set(session.base);
		gradient_mask(session.work, session.start, session.end, start, end, shape, this.selection_for(session.layer, session.work));
		this.show_live();
	}

	/**
	 * @returns {Uint8ClampedArray|null} the selection in the pixels of the mask, null = everything
	 */
	selection_for(layer, work) {
		const selection = new Selection_mask_class().get();
		if (!selection || !selection.mask) {
			return null;
		}
		return selection_weights(selection.mask, layer, work.width, work.height);
	}

	show_live() {
		const session = this.session;
		session.layer.mask = serialize_layer_mask(session.work);
		config.need_render = true;
	}

	finish() {
		const session = this.session;
		this.session = null;
		const painted = serialize_layer_mask(session.work);
		session.layer.mask = session.original; //the action stores the old value itself
		if (JSON.stringify(painted) === JSON.stringify(session.original)) {
			config.need_render = true;
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('layer_mask', 'Paint Layer Mask', [
				new app.Actions.Update_layer_action(session.layer.id, {mask: painted, mask_enabled: true}),
			])
		);
	}

	/**
	 * Edit > Fill while the mask is the target: the whole mask (or the selected part) gets the gray of the color
	 */
	fill(color, opacity = 1) {
		const layer = this.target_layer();
		if (layer === null) {
			return;
		}
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (layer.rotate) {
			alertify.error(t('Rotate is not supported on this type of object. Convert to raster?'));
			return;
		}
		const work = deserialize_layer_mask(layer.mask) || uniform_layer_mask(layer, 255);
		fill_mask_value(work, mask_value_of_color(color), this.selection_for(layer, work), opacity);
		this.session = {layer, tool: 'fill', work, original: layer.mask};
		this.finish();
	}

	//drawing

	/**
	 * Called from Base_layers.render_overlay (document coordinates)
	 */
	render_overlay(ctx) {
		if (this.view == 'normal') {
			return;
		}
		const layer = this.target_layer();
		if (layer === null) {
			return;
		}
		const canvas = this.view_canvas(layer, this.view);
		if (!canvas) {
			return;
		}
		ctx.save();
		if (this.view == 'gray') {
			//outside the layer nothing is masked: shown black like an empty mask
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, config.WIDTH, config.HEIGHT);
		}
		ctx.imageSmoothingEnabled = config.ZOOM < 1;
		ctx.drawImage(canvas, layer.x, layer.y, layer.width, layer.height);
		ctx.restore();
	}

	view_canvas(layer, kind) {
		const cached = this.view_cache;
		if (cached && cached.mask === layer.mask && cached.kind === kind) {
			return cached.canvas;
		}
		const mask = deserialize_layer_mask(layer.mask);
		if (!mask) {
			return null;
		}
		const canvas = document.createElement('canvas');
		canvas.width = mask.width;
		canvas.height = mask.height;
		const ctx = canvas.getContext('2d');
		const image = ctx.createImageData(mask.width, mask.height);
		image.data.set(mask_to_rgba(mask, kind == 'gray' ? 'gray' : 'overlay'));
		ctx.putImageData(image, 0, 0);
		this.view_cache = {mask: layer.mask, kind, canvas};
		return canvas;
	}
}

let instance = null;

export default GUI_mask_edit_class;
