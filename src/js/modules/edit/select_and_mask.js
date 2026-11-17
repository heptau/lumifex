import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Edit_selection_class from './selection.js';
import Layer_mask_class from './../layer/mask.js';
import Selection_mask_class from './../../core/selection-mask-state.js';
import Base_layers_class from './../../core/base-layers.js';
import { refine_mask } from './../../libs/selection-mask.js';
import { layer_mask_from_selection, serialize_layer_mask } from './../../libs/layer-mask.js';
import { mask_view_rgba, decontaminate, VIEW_MODES, OUTPUTS } from './../../libs/select-and-mask.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

/**
 * Select > Select and Mask… (Photoshop): one dialog that refines the selection and shows it in a chosen way - Overlay,
 * On Black, On White, Black & White or Marching Ants - with Snap to edges, Smooth, Feather, Contrast, Shift Edge,
 * Decontaminate Colors and the output: Selection, Layer Mask, New Layer or New Layer with Layer Mask.
 */
class Edit_select_and_mask_class {

	constructor() {
		this.Dialog = new Dialog_class();
		this.Edit_selection = new Edit_selection_class();
		this.Selection_mask = new Selection_mask_class();
		this.Base_layers = new Base_layers_class();
	}

	select_and_mask() {
		const current = this.Edit_selection.get_mask();
		if (current == null) {
			alertify.error(t('Empty selection'));
			return;
		}
		const base = current.mask;
		const layer = config.layer && config.layer.type == 'image' ? config.layer : null;
		const guide = layer ? this.Edit_selection.layer_on_canvas(layer) : null;
		const picture = guide || this.visible_picture();

		const params = [
			{name: 'view', title: 'View:', values: VIEW_MODES, value: VIEW_MODES[0]},
		];
		if (guide) {
			params.push(
				{name: 'edge_radius', title: 'Snap to edges:', value: 0, range: [0, 50]},
				{name: 'edge_sensitivity', title: 'Edge sensitivity:', value: 60, range: [1, 100]}
			);
		}
		params.push(
			{name: 'smooth', title: 'Smooth radius:', value: 0, range: [0, 100]},
			{name: 'feather', title: 'Feather radius:', value: 0, range: [0, 100]},
			{name: 'contrast', title: 'Contrast:', value: 0, range: [0, 100]},
			{name: 'shift', title: 'Shift edge:', value: 0, range: [-100, 100]},
			{name: 'decontaminate', title: 'Decontaminate colors:', value: 0, range: [0, 100]},
			{name: 'output', title: 'Output to:', values: layer ? OUTPUTS : OUTPUTS.slice(0, 1), value: OUTPUTS[0]}
		);

		let timer = null;
		let view_canvas = null;
		const show = (values) => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				if (!this.Dialog.active) {
					return;
				}
				try {
					const mask = refine_mask(base, values, guide);
					const rgba = mask_view_rgba(picture, mask, values.view);
					if (rgba) {
						this.Selection_mask.clear_preview();
						view_canvas = view_canvas || document.createElement('canvas');
						view_canvas.width = picture.width;
						view_canvas.height = picture.height;
						view_canvas.getContext('2d').putImageData(new ImageData(rgba, picture.width, picture.height), 0, 0);
						config.view_overlay = (ctx) => {
							if (this.Dialog.active) {
								ctx.drawImage(view_canvas, 0, 0);
							}
						};
					}
					else {
						config.view_overlay = null;
						this.Selection_mask.set_preview(mask, () => this.Dialog.active);
					}
				}
				catch (error) {
					console.warn('Select and Mask preview failed', error);
				}
				config.need_render = true;
			}, 120);
		};
		const finish = () => {
			clearTimeout(timer);
			this.Selection_mask.clear_preview();
			config.view_overlay = null;
			config.need_render = true;
		};
		const defaults = {};
		params.forEach((param) => {
			defaults[param.name] = param.value !== undefined ? param.value : (param.values ? param.values[0] : undefined);
		});
		this.Dialog.show({
			title: 'Select and Mask',
			params,
			live: true,
			on_change: show,
			on_cancel: finish,
			on_finish: (values) => {
				finish();
				this.output(refine_mask(base, values, guide), values, layer);
			},
		});
		show(defaults);
	}

	visible_picture() {
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		this.Base_layers.convert_layers_to_canvas(ctx, null, false);
		return ctx.getImageData(0, 0, canvas.width, canvas.height);
	}

	/**
	 * @param {object} mask the refined selection (document size)
	 * @param {object} values of the dialog
	 * @param {object|null} layer the active image layer
	 */
	output(mask, values, layer) {
		const output = OUTPUTS.includes(values.output) ? values.output : 'Selection';
		if (output == 'Selection' || !layer) {
			return this.Edit_selection.set_mask(mask, false);
		}
		if (layer.locked === true && output == 'Layer Mask') {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (layer.rotate) {
			alertify.error(t('Rotate is not supported on this type of object. Convert to raster?'));
			return;
		}
		if (output == 'Layer Mask') {
			return new Layer_mask_class().set_mask(layer, layer_mask_from_selection(mask, layer), 'Select and Mask');
		}
		//a new layer of the size of the document: the pixels of the layer, cleaned at the edge when asked
		const image = this.Edit_selection.layer_on_canvas(layer);
		decontaminate(image, mask, values.decontaminate);
		const with_mask = output == 'New Layer with Layer Mask';
		if (!with_mask) {
			for (let p = 0, i = 3; p < mask.data.length; p++, i += 4) {
				image.data[i] = image.data[i] * mask.data[p] / 255;
			}
		}
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		canvas.getContext('2d').putImageData(image, 0, 0);
		const settings = {
			name: `${layer.name} ${t('copy')}`,
			type: 'image',
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			width_original: canvas.width,
			height_original: canvas.height,
			data: canvas.toDataURL('image/png'),
		};
		if (with_mask) {
			settings.mask = serialize_layer_mask(mask);
			settings.mask_enabled = true;
		}
		//as in Photoshop the original layer is hidden, the new one is above it
		return app.State.do_action(
			new app.Actions.Bundle_action('select_and_mask', 'Select and Mask', [
				new app.Actions.Update_layer_action(layer.id, {visible: false}),
				new app.Actions.Insert_layer_action(settings, false),
				new app.Actions.Reset_selection_action(),
			])
		);
	}
}

export default Edit_select_and_mask_class;
