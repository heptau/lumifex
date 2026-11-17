import config from './../../config.js';
import { is_brush_drag_press, drag_brush_values } from './../../libs/brush-drag.js';

/**
 * Brush size and hardness by dragging on the canvas, as in Photoshop: Alt + right button (Windows) or
 * Ctrl + Option + left button (Mac). Left / right changes the size, up / down the hardness (tools with that option).
 * The circle of the new size is drawn at the place of the press. Works for every tool that has the "size" option.
 */
class GUI_brush_drag_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
		this.drag = null;
		this.suppress_menu_until = 0;
	}

	init(gui_tools) {
		if (this.ready) {
			return;
		}
		this.ready = true;
		this.GUI_tools = gui_tools;
		document.addEventListener('mousedown', (event) => this.mousedown(event), true);
		document.addEventListener('mousemove', (event) => this.mousemove(event), true);
		document.addEventListener('mouseup', (event) => this.mouseup(event), true);
		document.addEventListener('contextmenu', (event) => {
			//the right button of the drag must not open the context menu
			if (this.drag || Date.now() < this.suppress_menu_until) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		}, true);
	}

	size_attribute() {
		const attributes = config.TOOL ? config.TOOL.attributes : null;
		return attributes && attributes.size !== undefined ? attributes : null;
	}

	mousedown(event) {
		const id = event.target && event.target.id;
		if ((id != 'canvas_minipaint' && id != 'main_wrapper') || !is_brush_drag_press(event)) {
			return;
		}
		const attributes = this.size_attribute();
		if (!attributes) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const size_is_object = typeof attributes.size == 'object';
		const hardness = attributes.hardness && typeof attributes.hardness == 'object' ? parseFloat(attributes.hardness.value) : null;
		const position = config.mouse && config.mouse.valid !== undefined ? {x: config.mouse.x, y: config.mouse.y} : {x: 0, y: 0};
		this.drag = {
			x: event.clientX,
			y: event.clientY,
			at: position,
			start: {
				size: parseFloat(size_is_object ? attributes.size.value : attributes.size) || 1,
				min: size_is_object && attributes.size.min != null ? attributes.size.min : 1,
				max: size_is_object && attributes.size.max != null ? attributes.size.max : 999,
				hardness: Number.isFinite(hardness) ? hardness : null,
			},
			values: null,
		};
		this.drag.values = {size: this.drag.start.size, hardness: this.drag.start.hardness};
		config.need_render = true;
	}

	mousemove(event) {
		if (!this.drag) {
			return;
		}
		event.stopImmediatePropagation();
		const values = drag_brush_values(this.drag.start, event.clientX - this.drag.x, event.clientY - this.drag.y, config.ZOOM);
		this.drag.values = values;
		const attributes = this.size_attribute();
		if (attributes) {
			if (typeof attributes.size == 'object') {
				attributes.size.value = values.size;
			}
			else {
				attributes.size = values.size;
			}
			if (values.hardness !== null && attributes.hardness && typeof attributes.hardness == 'object') {
				attributes.hardness.value = values.hardness;
			}
		}
		config.need_render = true;
	}

	mouseup(event) {
		if (!this.drag) {
			return;
		}
		event.stopImmediatePropagation();
		this.drag = null;
		this.suppress_menu_until = Date.now() + 400;
		if (this.GUI_tools) {
			const tool = this.GUI_tools.tools_modules[config.TOOL.name];
			if (config.TOOL.on_update != undefined && tool && tool.object[config.TOOL.on_update]) {
				const attributes = this.size_attribute();
				const size = attributes ? (typeof attributes.size == 'object' ? attributes.size.value : attributes.size) : null;
				tool.object[config.TOOL.on_update]({key: 'size', value: size});
			}
			this.GUI_tools.show_action_attributes();
		}
		config.need_render = true;
	}

	/**
	 * The circle of the new size (document coordinates), called from Base_layers.render_overlay
	 */
	render_overlay(ctx) {
		if (!this.drag || !this.drag.values) {
			return;
		}
		const radius = Math.max(0.5, this.drag.values.size / 2);
		const {x, y} = this.drag.at;
		ctx.save();
		if (this.drag.values.hardness !== null) {
			//the soft part of the brush: a red fill fading to the edge, like the preview of Photoshop
			const inner = radius * this.drag.values.hardness / 100;
			const gradient = ctx.createRadialGradient(x, y, Math.max(0, inner - 0.01), x, y, radius);
			gradient.addColorStop(0, 'rgba(255, 0, 0, 0.45)');
			gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
			ctx.fillStyle = 'rgba(255, 0, 0, 0.45)';
			ctx.beginPath();
			ctx.arc(x, y, Math.max(0, inner), 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.lineWidth = 2 / config.ZOOM;
		ctx.strokeStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.stroke();
		ctx.lineWidth = 1 / config.ZOOM;
		ctx.strokeStyle = '#000000';
		ctx.stroke();
		ctx.restore();
	}
}

let instance = null;

export default GUI_brush_drag_class;
