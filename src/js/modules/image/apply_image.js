import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Edit_selection_class from './../edit/selection.js';
import Image_adjustments_class from './adjustments.js';
import { blend_with_mask } from './../../libs/selection-mask.js';
import {
	apply_image, calculations, extract_channel, APPLY_MODES, APPLY_CHANNELS, clean_apply_mode, clean_apply_channel,
} from './../../libs/apply-image.js';
import { add_channel, next_channel_name } from './../../libs/alpha-channels.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

let instance = null;

const MERGED = 'Merged';
const RESULTS = ['New Channel', 'Selection', 'New Layer'];

/**
 * Image > Apply Image and Image > Calculations (Photoshop): blending a layer or the merged picture (or one of their
 * channels) into the active layer, and blending two channels into a new channel, a selection or a gray layer.
 */
class Image_apply_image_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Edit_selection = new Edit_selection_class();
		this.Adjustments = new Image_adjustments_class();
	}

	/**
	 * @returns {string[]} the names of the sources in the dialogs: Merged and every layer with pixels
	 */
	source_names() {
		const layers = config.layers.filter((layer) => layer.type != null);
		return [MERGED].concat(layers.slice().reverse().map((layer) => `${layer.name} #${layer.id}`));
	}

	/**
	 * The source as a picture of the document size (a hidden layer counts too, as in Photoshop)
	 *
	 * @param {string} name a value of source_names()
	 * @returns {HTMLCanvasElement}
	 */
	document_picture(name) {
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');
		if (name == MERGED) {
			this.Base_layers.convert_layers_to_canvas(ctx, null, false);
			return canvas;
		}
		const id = parseInt(String(name).split('#').pop(), 10);
		const layer = this.Base_layers.get_layer(id);
		if (!layer) {
			return canvas;
		}
		const visible = layer.visible;
		layer.visible = true;
		try {
			this.Base_layers.convert_layers_to_canvas(ctx, id);
		}
		finally {
			layer.visible = visible;
		}
		return canvas;
	}

	/**
	 * The part of a picture of the document size that lies under the active layer, at the given size
	 * (the pixel size of the layer, or of the dialog preview)
	 */
	under_layer(picture, width, height) {
		const layer = config.layer;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		ctx.drawImage(picture, layer.x, layer.y, layer.width, layer.height, 0, 0, width, height);
		return ctx.getImageData(0, 0, width, height);
	}

	labels(list) {
		return list.map((item) => item[1]);
	}

	id_of(list, label) {
		const found = list.find((item) => item[1] === label);
		return found ? found[0] : list[0][0];
	}

	/**
	 * Image > Apply Image...
	 */
	apply() {
		if (this.Adjustments.can_apply() == false) {
			return;
		}
		const layer = config.layer;
		if (layer.rotate) {
			alertify.error(t('This command does not work with a rotated layer.'));
			return;
		}
		const names = this.source_names();
		const pictures = {};
		const picture = (name) => {
			if (!pictures[name]) {
				pictures[name] = this.document_picture(name);
			}
			return pictures[name];
		};
		const options = (params) => ({
			channel: clean_apply_channel(this.id_of(APPLY_CHANNELS, params.channel)),
			invert: params.invert === true,
			mode: clean_apply_mode(this.id_of(APPLY_MODES, params.mode)),
			opacity: params.opacity,
		});

		this.POP.show({
			title: 'Apply Image',
			preview: true,
			effects: true,
			params: [
				{name: 'source', title: 'Source:', type: 'select', values: names, value: names[0]},
				{name: 'channel', title: 'Channel:', type: 'select', values: this.labels(APPLY_CHANNELS), value: 'RGB'},
				{name: 'invert', title: 'Invert:', value: false},
				{name: 'mode', title: 'Blending:', type: 'select', values: this.labels(APPLY_MODES), value: 'Multiply'},
				{name: 'opacity', title: 'Opacity:', value: 100, range: [0, 100]},
			],
			on_change: (params, canvas_preview, w, h) => {
				const img = canvas_preview.getImageData(0, 0, w, h);
				const source = this.under_layer(picture(params.source), w, h);
				canvas_preview.putImageData(apply_image(img, source, options(params)), 0, 0);
			},
			on_finish: (params) => {
				this.apply_to_layer(picture(params.source), options(params));
			},
		});
	}

	/**
	 * Applies the source to the pixels of the active layer, only inside the selection; one undo step
	 */
	apply_to_layer(source_picture, options) {
		const canvas = this.Base_layers.convert_layer_to_canvas(null, true);
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const changed = apply_image(
			ctx.getImageData(0, 0, canvas.width, canvas.height),
			this.under_layer(source_picture, canvas.width, canvas.height),
			options
		);
		const selection = this.Edit_selection.get_mask();
		ctx.putImageData(selection == null ? changed : blend_with_mask(original, changed, selection.mask, config.layer), 0, 0);
		return app.State.do_action(new app.Actions.Update_layer_image_action(canvas, null, {keep_alpha: true}));
	}

	/**
	 * Image > Calculations...
	 */
	calculations() {
		const names = this.source_names();
		const channels = APPLY_CHANNELS.filter((item) => item[0] != 'rgb');
		const pictures = {};
		const channel_of = (name, label) => {
			const key = `${name}|${label}`;
			if (!pictures[key]) {
				const picture = this.document_picture(name);
				const image = picture.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, picture.width, picture.height);
				pictures[key] = extract_channel(image, this.id_of(channels, label));
			}
			return pictures[key];
		};
		const compute = (params) => calculations(
			channel_of(params.source_1, params.channel_1),
			channel_of(params.source_2, params.channel_2),
			{
				mode: clean_apply_mode(this.id_of(APPLY_MODES, params.mode)),
				opacity: params.opacity,
				invert_first: params.invert_1 === true,
				invert_second: params.invert_2 === true,
			}
		);
		const draw = (data, ctx, width, height) => {
			//the result in gray, scaled to the preview
			const full = document.createElement('canvas');
			full.width = config.WIDTH;
			full.height = config.HEIGHT;
			const full_ctx = full.getContext('2d');
			const image = full_ctx.createImageData(full.width, full.height);
			for (let p = 0, i = 0; p < data.length; p++, i += 4) {
				image.data[i] = image.data[i + 1] = image.data[i + 2] = data[p];
				image.data[i + 3] = 255;
			}
			full_ctx.putImageData(image, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(full, 0, 0, width, height);
		};

		this.POP.show({
			title: 'Calculations',
			preview: true,
			params: [
				{heading: 'Source 1'},
				{name: 'source_1', title: 'Layer:', type: 'select', values: names, value: names[0]},
				{name: 'channel_1', title: 'Channel:', type: 'select', values: this.labels(channels), value: 'Gray'},
				{name: 'invert_1', title: 'Invert:', value: false},
				{heading: 'Source 2'},
				{name: 'source_2', title: 'Layer:', type: 'select', values: names, value: names[0]},
				{name: 'channel_2', title: 'Channel:', type: 'select', values: this.labels(channels), value: 'Gray'},
				{name: 'invert_2', title: 'Invert:', value: false},
				{heading: 'Result'},
				{name: 'mode', title: 'Blending:', type: 'select', values: this.labels(APPLY_MODES), value: 'Multiply'},
				{name: 'opacity', title: 'Opacity:', value: 100, range: [0, 100]},
				{name: 'result', title: 'Result:', type: 'select', values: RESULTS, value: RESULTS[0]},
			],
			on_change: (params, canvas_preview, w, h) => {
				draw(compute(params), canvas_preview, w, h);
			},
			on_finish: (params) => {
				this.put_result(compute(params), params.result);
			},
		});
	}

	/**
	 * @param {Uint8ClampedArray} data a gray channel of the document size
	 * @param {string} result a value of RESULTS
	 */
	async put_result(data, result) {
		const mask = {width: config.WIDTH, height: config.HEIGHT, data};
		if (result == 'Selection') {
			await this.Edit_selection.set_mask(mask, !config.TOOL.keep_selection);
			return;
		}
		if (result == 'New Layer') {
			const canvas = document.createElement('canvas');
			canvas.width = mask.width;
			canvas.height = mask.height;
			const ctx = canvas.getContext('2d');
			const image = ctx.createImageData(mask.width, mask.height);
			for (let p = 0, i = 0; p < data.length; p++, i += 4) {
				image.data[i] = image.data[i + 1] = image.data[i + 2] = data[p];
				image.data[i + 3] = 255;
			}
			ctx.putImageData(image, 0, 0);
			await app.State.do_action(new app.Actions.Insert_layer_action({
				name: t('Calculations'),
				type: 'image',
				data: canvas.toDataURL('image/png'),
				x: 0,
				y: 0,
				width: mask.width,
				height: mask.height,
				width_original: mask.width,
				height_original: mask.height,
			}));
			return;
		}
		const list = Array.isArray(config.alpha_channels) ? config.alpha_channels : [];
		const added = add_channel(list, mask, next_channel_name(list, t('Alpha')));
		if (added == null) {
			alertify.error(t('A document can have at most 50 alpha channels.'));
			return;
		}
		await app.State.do_action(new app.Actions.Set_alpha_channels_action(added.list, 'Calculations'));
		alertify.success(t('The result is in the Channels panel.'));
	}
}

export default Image_apply_image_class;
