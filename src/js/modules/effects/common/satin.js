import config from '../../../config.js';
import Effects_innerShadow_class from './inner-shadow.js';
import { safe_color, clamp_int } from './../../../libs/layer-styles.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../../tools/translate.js';

/**
 * Layer style Satin - soft silky shading inside an image layer. Two copies of the layer shape shifted against
 * each other by the angle and distance are combined (XOR), blurred, colored and clipped to the layer.
 * It reuses the drawing and the cache of Inner Shadow; only the shape of the shading differs.
 */
class Effects_satin_class extends Effects_innerShadow_class {

	satin(filter_id) {
		if (config.layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}

		const filter = this.Base_layers.find_filter_by_id(filter_id, 'satin');

		const params = [
			{name: "angle", title: "Angle:", value: filter.angle ??= 19, range: [-180, 180]},
			{name: "distance", title: "Distance:", value: filter.distance ??= 11, range: [0, 50]},
			{name: "blur", title: "Radius:", value: filter.blur ??= 14, range: [0, 50]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 50, range: [1, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#000000", type: 'color'},
		];
		this.show_dialog('satin', params, filter_id);
	}

	/**
	 * @param {object} params angle (degrees), distance (pixels)
	 * @returns {{x: number, y: number}} the shift of one of the two copies
	 */
	offsets(params) {
		const angle = clamp_int(params.angle, -360, 360, 0) * Math.PI / 180;
		const distance = clamp_int(params.distance, 0, 100, 0);
		return {x: Math.round(Math.cos(angle) * distance), y: Math.round(Math.sin(angle) * distance)};
	}

	build_shadow(source, width, height, params) {
		width = Math.max(1, Math.round(width));
		height = Math.max(1, Math.round(height));
		const x = clamp_int(params.x, -100, 100, 0);
		const y = clamp_int(params.y, -100, 100, 0);
		const blur = clamp_int(params.blur, 0, 100, 0);
		const pad = blur * 3 + Math.max(Math.abs(x), Math.abs(y));

		const work = document.createElement('canvas');
		work.width = width + pad * 2;
		work.height = height + pad * 2;
		const ctx = work.getContext('2d');

		//the two shifted copies cancel each other where they overlap
		ctx.drawImage(source, pad + x, pad + y, width, height);
		ctx.globalCompositeOperation = 'xor';
		ctx.drawImage(source, pad - x, pad - y, width, height);

		//blur, then color the result
		const soft = document.createElement('canvas');
		soft.width = work.width;
		soft.height = work.height;
		const soft_ctx = soft.getContext('2d');
		soft_ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
		soft_ctx.drawImage(work, 0, 0);
		soft_ctx.filter = 'none';
		soft_ctx.globalCompositeOperation = 'source-in';
		soft_ctx.fillStyle = safe_color(params.color);
		soft_ctx.fillRect(0, 0, soft.width, soft.height);

		//clip to the original shape
		soft_ctx.globalCompositeOperation = 'destination-in';
		soft_ctx.drawImage(source, pad, pad, width, height);

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d').drawImage(soft, -pad, -pad);
		return canvas;
	}

	draw_preview(ctx, source, x, y, width, height, params, ratio) {
		super.draw_preview(ctx, source, x, y, width, height, {...params, ...this.offsets(params)}, ratio);
	}

	demo(canvas_id, canvas_thumb) {
		const canvas = document.getElementById(canvas_id);
		const ctx = canvas.getContext("2d");
		const width = this.Effects_browser.preview_width - 20;
		const height = this.Effects_browser.preview_height - 20;

		ctx.drawImage(canvas_thumb, 10, 10, width, height);
		const shift = this.offsets({angle: 19, distance: 8});
		ctx.drawImage(this.build_shadow(canvas_thumb, width, height, {...shift, blur: 8, color: '#000000'}), 10, 10);
	}

	render_post(ctx, data, layer) {
		super.render_post(ctx, {...data, params: {...data.params, ...this.offsets(data.params)}}, layer);
	}

}

export default Effects_satin_class;
