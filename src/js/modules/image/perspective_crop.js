import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import { find_handle, drag_handle, handles_for, handle_position, is_valid_quad } from './../../libs/perspective.js';
import { rectify_quad, crop_size, start_quad } from './../../libs/perspective-crop.js';
import { t } from '../tools/translate.js';

const HANDLE_SIZE = 8; //screen pixels
const REACH = 12; //screen pixels

let instance = null;

/**
 * Image > Perspective Crop - four corners are put around something photographed at an angle (a page, a screen) and the
 * area between them becomes a straight rectangle that replaces the whole document. A bar at the top ends the session:
 * Enter or Apply makes it, Escape or Cancel leaves everything as it was. The picture that is cropped is the whole visible
 * document; the result is one image layer (one undo step).
 */
class Image_perspective_crop_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
		this.active = false;
		this.pointer = new Base_tools_class(); //only for the position of the mouse on the picture
		this.Base_layers = new Base_layers_class();
	}

	start() {
		if (this.active) {
			return;
		}
		this.w = config.WIDTH;
		this.h = config.HEIGHT;
		this.quad = start_quad(this.w, this.h);
		this.dragging = null;
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
		config.need_render = true;
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
		const point = this.pointer.get_mouse_coordinates_from_event(event);
		const handle = find_handle(this.quad, 'distort', point, REACH / (config.ZOOM || 1));
		if (handle) {
			this.dragging = {handle, point, quad: this.quad.map((c) => [c[0], c[1]])};
		}
	}

	pointer_move(event) {
		if (this.dragging == null) {
			return;
		}
		event.stopImmediatePropagation();
		const point = this.pointer.get_mouse_coordinates_from_event(event);
		const next = drag_handle(this.dragging.quad, 'distort', this.dragging.handle, point.x - this.dragging.point.x, point.y - this.dragging.point.y);
		if (is_valid_quad(next)) {
			this.quad = next;
		}
		config.need_render = true;
	}

	pointer_up() {
		this.dragging = null;
		config.need_render = true;
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
	}

	/**
	 * the darkened outside, the outline with a third grid and the handles
	 */
	draw(ctx) {
		if (!this.active) {
			return;
		}
		const scale = 1 / (config.ZOOM || 1);
		const q = this.quad;
		ctx.save();
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.beginPath();
		ctx.rect(0, 0, this.w, this.h);
		ctx.moveTo(q[0][0], q[0][1]);
		for (let i = 3; i >= 0; i--) {
			ctx.lineTo(q[i][0], q[i][1]);
		}
		ctx.closePath();
		ctx.fill('evenodd');
		//the lines of thirds follow the sides, so the angle can be judged
		ctx.lineWidth = scale;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
		for (const t of [1 / 3, 2 / 3]) {
			const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
			const top = lerp(q[0], q[1], t), bottom = lerp(q[3], q[2], t);
			const left = lerp(q[0], q[3], t), right = lerp(q[1], q[2], t);
			ctx.beginPath();
			ctx.moveTo(top[0], top[1]);
			ctx.lineTo(bottom[0], bottom[1]);
			ctx.moveTo(left[0], left[1]);
			ctx.lineTo(right[0], right[1]);
			ctx.stroke();
		}
		ctx.beginPath();
		q.forEach((p, i) => (i == 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
		ctx.closePath();
		ctx.lineWidth = 3 * scale;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.stroke();
		ctx.lineWidth = scale;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		handles_for('distort').forEach((handle) => {
			const p = handle_position(q, handle);
			const size = HANDLE_SIZE * scale;
			ctx.fillStyle = this.dragging && this.dragging.handle == handle ? '#0a84ff' : '#ffffff';
			ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
			ctx.strokeStyle = '#222222';
			ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
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
		config.need_render = true;
	}

	cancel() {
		if (this.active) {
			this.finish();
		}
	}

	reset() {
		this.quad = start_quad(this.w, this.h);
		config.need_render = true;
	}

	apply() {
		if (!this.active) {
			return;
		}
		const quad = this.quad;
		this.finish();
		const size = crop_size(quad);
		//the whole visible picture, the way it is shown
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		this.Base_layers.convert_layers_to_canvas(ctx, null, false);
		const result = rectify_quad(ctx.getImageData(0, 0, canvas.width, canvas.height), quad, size);
		if (result == null) {
			alertify.error(t('The corners make a shape that folds over itself.'));
			return;
		}
		const out = document.createElement('canvas');
		out.width = result.width;
		out.height = result.height;
		out.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);

		const actions = [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({WIDTH: result.width, HEIGHT: result.height}),
			new app.Actions.Insert_layer_action({
				name: t('Perspective Crop'), type: 'image', data: out.toDataURL('image/png'), x: 0, y: 0,
				width: result.width, height: result.height,
			}, false),
		];
		for (let i = config.layers.length - 1; i >= 0; i--) {
			actions.push(new app.Actions.Delete_layer_action(config.layers[i].id));
		}
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		return app.State.do_action(new app.Actions.Bundle_action('perspective_crop', 'Perspective Crop', actions));
	}

	show_bar() {
		const bar = document.createElement('div');
		bar.className = 'distort_bar';
		bar.setAttribute('role', 'toolbar');
		bar.setAttribute('aria-label', t('Perspective Crop'));
		const button = (text, handler) => {
			const element = document.createElement('button');
			element.type = 'button';
			element.textContent = t(text);
			element.addEventListener('click', handler);
			bar.appendChild(element);
			return element;
		};
		button('Reset', () => this.reset());
		button('Cancel', () => this.cancel());
		const apply = button('Apply', () => this.apply());
		apply.className = 'primary';
		document.body.appendChild(bar);
		this.bar = bar;
	}
}

export default Image_perspective_crop_class;
