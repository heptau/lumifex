import app from './../app.js';
import config from './../config.js';
import Patch_class from './patch.js';
import { polygon_mask } from './../libs/selection-mask.js';
import { picture_to_layer, vector_to_layer } from './../libs/patch.js';
import { content_aware_move } from './../libs/content-move.js';

//room around the moved part: the fill looks for a clean place of the same size next to the hole, and for its colors
const MARGIN = 70;

/**
 * Content-Aware Move (Photoshop): draw around an object, then drag the shape to a new place. The object moves there
 * with a soft edge and the place it leaves is filled from the surroundings. Works in the pixels of the layer (also a
 * turned or stretched one), Esc cancels, one undo step.
 */
class Content_move_class extends Patch_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'content_move';
	}

	compute() {
		const layer = config.layer;
		const points = this.polygon.map((p) => picture_to_layer(layer, p.x, p.y));
		const move = vector_to_layer(layer, this.offset.x, this.offset.y);
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const left = Math.min.apply(null, xs), right = Math.max.apply(null, xs);
		const top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
		//the part, its new place, a clean place of its size next to it and room around
		const reach_x = right - left + MARGIN;
		const reach_y = bottom - top + MARGIN;
		const x0 = Math.floor(Math.max(0, Math.min(left, left + move.x) - reach_x));
		const y0 = Math.floor(Math.max(0, Math.min(top, top + move.y) - reach_y));
		const x1 = Math.ceil(Math.min(layer.width_original, Math.max(right, right + move.x) + reach_x));
		const y1 = Math.ceil(Math.min(layer.height_original, Math.max(bottom, bottom + move.y) + reach_y));
		const width = x1 - x0;
		const height = y1 - y0;
		if (width < 1 || height < 1) {
			return null;
		}
		if (this.layer_canvas == null) {
			this.layer_canvas = document.createElement('canvas');
			this.layer_canvas.width = layer.width_original;
			this.layer_canvas.height = layer.height_original;
			this.layer_canvas.getContext('2d', {willReadFrequently: true}).drawImage(layer.link, 0, 0);
		}
		const image = this.layer_canvas.getContext('2d').getImageData(x0, y0, width, height);
		const before = new ImageData(new Uint8ClampedArray(image.data), width, height);
		const mask = polygon_mask(points.map((p) => ({x: p.x - x0, y: p.y - y0})), width, height);
		const params = this.getParams();
		content_aware_move(image, mask, move.x, move.y, {adapt: params.adapt, softness: params.softness});
		return {x: x0, y: y0, image, before};
	}

	apply() {
		const layer = config.layer;
		const result = this.compute();
		if (result == null) {
			this.reset_state();
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(this.layer_canvas, 0, 0);
		ctx.putImageData(result.image, result.x, result.y);
		this.reset_state();
		config.need_render = true;
		return app.State.do_action(
			new app.Actions.Bundle_action('content_move_tool', 'Content-Aware Move', [
				new app.Actions.Update_layer_image_action(canvas, null, {keep_alpha: true}),
			])
		);
	}
}

export default Content_move_class;
