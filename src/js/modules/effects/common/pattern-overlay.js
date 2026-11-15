import config from '../../../config.js';
import Effects_layer_style_class from '../abstract/layer-style.js';
import { get_pattern_canvas } from './../../edit/fill.js';
import { clamp_int, blend_operation, BLEND_MODES, safe_pattern_url, pattern_size } from './../../../libs/layer-styles.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../../tools/translate.js';

/**
 * Layer style Pattern Overlay - covers the non transparent part of an image layer with the pattern defined by
 * Edit > Define Pattern. The pattern is stored in the style as a PNG data URL, so it stays with the project.
 */
class Effects_patternOverlay_class extends Effects_layer_style_class {

	constructor() {
		super();
		this.images = new Map(); //data URL -> {image, ready}
		this.pending_pattern = null;
	}

	pattern_overlay(filter_id) {
		if (config.layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}

		const filter = this.Base_layers.find_filter_by_id(filter_id, 'pattern-overlay');

		//the pattern of the style: the stored one when editing, otherwise the defined one
		let url = safe_pattern_url(filter.pattern);
		const defined = get_pattern_canvas();
		if (url == null && defined != null) {
			const size = pattern_size(defined.width, defined.height);
			const small = document.createElement('canvas');
			small.width = size.width;
			small.height = size.height;
			small.getContext('2d').drawImage(defined, 0, 0, size.width, size.height);
			url = safe_pattern_url(small.toDataURL('image/png'));
		}
		if (url == null) {
			alertify.warning(t('Define a pattern first (Edit > Define Pattern).'));
			return;
		}
		this.pending_pattern = url;

		const params = [
			{name: "scale", title: "Scale:", value: filter.scale ??= 100, range: [10, 400]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 100, range: [1, 100]},
			{name: "blend", title: "Blend mode:", value: filter.blend ??= 'normal', values: BLEND_MODES},
		];
		this.show_dialog('pattern-overlay', params, filter_id);
	}

	save(params, type, filter_id) {
		return super.save({...params, pattern: this.pending_pattern}, type, filter_id);
	}

	/**
	 * @param {string} url a safe pattern data URL
	 * @returns {HTMLImageElement|null} the decoded pattern, null while it is loading (the layers are redrawn afterwards)
	 */
	get_image(url) {
		let entry = this.images.get(url);
		if (!entry) {
			const image = new Image();
			entry = {image, ready: false};
			this.images.set(url, entry);
			image.onload = () => {
				entry.ready = true;
				this.Base_layers.render(true);
			};
			image.src = url;
		}
		return entry.ready ? entry.image : null;
	}

	/**
	 * The picture covered with the tiled pattern (transparent parts stay transparent)
	 *
	 * @param {CanvasImageSource} source
	 * @param {number} width
	 * @param {number} height
	 * @param {HTMLImageElement} pattern
	 * @param {number} factor the scale of the pattern (1 = as it is)
	 * @returns {HTMLCanvasElement}
	 */
	build_overlay(source, width, height, pattern, factor) {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(width));
		canvas.height = Math.max(1, Math.round(height));
		const ctx = canvas.getContext('2d');
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = 'source-in';
		const fill = ctx.createPattern(pattern, 'repeat');
		if (fill) {
			fill.setTransform(new DOMMatrix().scale(factor));
			ctx.fillStyle = fill;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		return canvas;
	}

	draw_preview(ctx, source, x, y, width, height, params, ratio) {
		ctx.drawImage(source, x, y, width, height);
		const pattern = this.pending_pattern ? this.get_image(this.pending_pattern) : null;
		if (!pattern) {
			return;
		}
		ctx.save();
		ctx.globalAlpha = clamp_int(params.opacity, 1, 100, 100) / 100;
		ctx.globalCompositeOperation = blend_operation(params.blend) || ctx.globalCompositeOperation;
		ctx.drawImage(this.build_overlay(source, width, height, pattern, clamp_int(params.scale, 10, 400, 100) / 100 * ratio), x, y);
		ctx.restore();
	}

	demo(canvas_id, canvas_thumb) {
		const canvas = document.getElementById(canvas_id);
		const ctx = canvas.getContext("2d");
		const width = this.Effects_browser.preview_width - 20;
		const height = this.Effects_browser.preview_height - 20;

		ctx.drawImage(canvas_thumb, 10, 10, width, height);
		//a small checkerboard stands for the pattern
		const tile = document.createElement('canvas');
		tile.width = tile.height = 8;
		const tile_ctx = tile.getContext('2d');
		tile_ctx.fillStyle = '#000000';
		tile_ctx.fillRect(0, 0, 4, 4);
		tile_ctx.fillRect(4, 4, 4, 4);
		ctx.globalAlpha = 0.5;
		ctx.drawImage(this.build_overlay(canvas_thumb, width, height, tile, 1), 10, 10);
		ctx.globalAlpha = 1;
	}

	render_post(ctx, data, layer) {
		if (!layer || layer.type != 'image') {
			return;
		}
		const url = safe_pattern_url(data.params.pattern);
		const pattern = url ? this.get_image(url) : null;
		if (!pattern) {
			return;
		}
		const scale = clamp_int(data.params.scale, 10, 400, 100);
		const overlay = this.cached(layer, `${url.length}|${url.slice(-40)}|${scale}`,
			(source) => this.build_overlay(source, layer.width, layer.height, pattern, scale / 100));

		const previous_filter = ctx.filter;
		ctx.filter = 'none';
		ctx.save();
		ctx.globalAlpha = ctx.globalAlpha * clamp_int(data.params.opacity, 1, 100, 100) / 100;
		ctx.globalCompositeOperation = blend_operation(data.params.blend) || ctx.globalCompositeOperation;
		this.transform_to_layer(ctx, layer);
		ctx.drawImage(overlay, -layer.width / 2, -layer.height / 2);
		ctx.restore();
		ctx.filter = previous_filter;
	}

}

export default Effects_patternOverlay_class;
