import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Edit_selection_class from './selection.js';
import { serialize_layer_mask } from './../../libs/layer-mask.js';
import { invert_mask } from './../../libs/selection-mask.js';
import {
	SKY_PRESETS, gradient_sky, fit_sky_rect, sky_mask, mean_sky_color, compose_sky,
} from './../../libs/sky-replace.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

let instance = null;

/**
 * Edit > Sky Replacement (Photoshop): finds the sky of the active image layer (Select Sky), and puts a new sky - a
 * built-in gradient or another image layer - above it as a new layer with a layer mask; the foreground can get the
 * color of the new sky through a "Sky Lighting" layer (Soft Light, masked to the foreground). The photo itself is not
 * changed, everything is one undo step.
 */
class Edit_sky_replacement_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Edit_selection = new Edit_selection_class();
	}

	/**
	 * @returns {string[]} the skies offered: the built-in gradients and the other image layers
	 */
	sky_names() {
		const layers = config.layers.filter((layer) => layer.type == 'image' && layer.id != config.layer.id);
		return Object.keys(SKY_PRESETS).map((name) => t(name))
			.concat(layers.slice().reverse().map((layer) => `${layer.name} #${layer.id}`));
	}

	/**
	 * The sky as a picture of the given size (the document, or the preview)
	 */
	sky_picture(name, width, height, params) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		const preset = Object.keys(SKY_PRESETS).find((key) => t(key) == name);
		let source;
		if (preset) {
			const sky = gradient_sky(width, height, preset);
			const picture = document.createElement('canvas');
			picture.width = width;
			picture.height = height;
			picture.getContext('2d').putImageData(new ImageData(sky.data, width, height), 0, 0);
			source = picture;
		}
		else {
			const id = parseInt(String(name).split('#').pop(), 10);
			const layer = this.Base_layers.get_layer(id);
			source = layer && layer.link ? layer.link : null;
		}
		if (source) {
			const rect = fit_sky_rect(source.width, source.height, width, height, params.scale, params.offset);
			ctx.save();
			if (params.flip === true) {
				ctx.translate(width, 0);
				ctx.scale(-1, 1);
			}
			ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
			ctx.restore();
		}
		return ctx.getImageData(0, 0, width, height);
	}

	/**
	 * The photo (the active layer at its place in the document) at the given size
	 */
	photo(width, height) {
		const full = this.Edit_selection.layer_on_canvas(config.layer);
		if (width == full.width && height == full.height) {
			return full;
		}
		const big = document.createElement('canvas');
		big.width = full.width;
		big.height = full.height;
		big.getContext('2d').putImageData(full, 0, 0);
		const small = document.createElement('canvas');
		small.width = width;
		small.height = height;
		const ctx = small.getContext('2d', {willReadFrequently: true});
		ctx.drawImage(big, 0, 0, width, height);
		return ctx.getImageData(0, 0, width, height);
	}

	/**
	 * @param {object} params values of the dialog
	 * @param {number} ratio size of the picture / size of the document (the edge values are in document pixels)
	 */
	mask_options(params, ratio) {
		return {
			tolerance: params.tolerance,
			shift: Math.round(params.shift * ratio),
			fade: Math.round(params.fade * ratio),
		};
	}

	replace() {
		const layer = config.layer;
		if (!layer || layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		const names = this.sky_names();
		let preview_photo = null;
		this.POP.show({
			title: 'Sky Replacement',
			preview: true,
			params: [
				{name: 'sky', title: 'Sky:', type: 'select', values: names, value: names[0]},
				{name: 'tolerance', title: 'Tolerance:', value: 30, range: [1, 120]},
				{name: 'shift', title: 'Shift Edge:', value: 0, range: [-50, 50]},
				{name: 'fade', title: 'Fade Edge:', value: 4, range: [0, 50]},
				{name: 'scale', title: 'Scale:', value: 100, range: [50, 300]},
				{name: 'offset', title: 'Move Down:', value: 0, range: [-50, 50]},
				{name: 'flip', title: 'Flip:', value: false},
				{name: 'lighting', title: 'Lighting:', value: 30, range: [0, 100]},
			],
			on_change: (params, canvas_preview, w, h) => {
				if (!preview_photo || preview_photo.width != w || preview_photo.height != h) {
					preview_photo = this.photo(w, h);
				}
				const image = new ImageData(new Uint8ClampedArray(preview_photo.data), w, h);
				const mask = sky_mask(image, this.mask_options(params, w / config.WIDTH));
				const sky = this.sky_picture(params.sky, w, h, params);
				compose_sky(image, sky, mask, params.lighting, mean_sky_color(sky, mask));
				canvas_preview.putImageData(image, 0, 0);
			},
			on_finish: (params) => {
				this.apply(params);
			},
		});
	}

	/**
	 * Makes the layers: "Sky" (the sky picture with the sky as its layer mask) and "Sky Lighting"
	 */
	async apply(params) {
		const width = config.WIDTH;
		const height = config.HEIGHT;
		const image = this.photo(width, height);
		const mask = sky_mask(image, this.mask_options(params, 1));
		if (!mask.data.some((value) => value > 0)) {
			alertify.warning(t('No sky was found at the top of the picture.'));
			return;
		}
		const sky = this.sky_picture(params.sky, width, height, params);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d').putImageData(new ImageData(sky.data, width, height), 0, 0);
		const box = {x: 0, y: 0, width, height, width_original: width, height_original: height};
		const actions = [
			new app.Actions.Insert_layer_action(Object.assign({
				name: t('Sky'),
				type: 'image',
				data: canvas.toDataURL('image/png'),
				mask: serialize_layer_mask(mask),
			}, box), false),
		];
		const lighting = Math.max(0, Math.min(100, Math.round(params.lighting) || 0));
		if (lighting > 0) {
			const color = mean_sky_color(sky, mask);
			const light = document.createElement('canvas');
			light.width = width;
			light.height = height;
			const ctx = light.getContext('2d');
			ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
			ctx.fillRect(0, 0, width, height);
			actions.push(new app.Actions.Insert_layer_action(Object.assign({
				name: t('Sky Lighting'),
				type: 'image',
				data: light.toDataURL('image/png'),
				composition: 'soft-light',
				opacity: lighting,
				mask: serialize_layer_mask(invert_mask(mask)),
			}, box), false));
		}
		await app.State.do_action(new app.Actions.Bundle_action('sky_replacement', 'Sky Replacement', actions));
	}
}

export default Edit_sky_replacement_class;
