import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Edit_selection_class from './../edit/selection.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { content_aware_scale, MAX_CARVE_PIXELS } from './../../libs/seam-carving.js';
import { sample_mask_for_layer } from './../../libs/selection-mask.js';
import { t } from '../tools/translate.js';

/**
 * Image > Content-Aware Scale - resizes the active image layer by removing the seams with the (a selection is protected)
 * least detail (or adding seams) instead of squeezing / stretching everything (see libs/seam-carving.js), one undo step
 */
class Image_content_aware_scale_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Edit_selection = new Edit_selection_class();
	}

	scale() {
		const layer = config.layer;
		if (!layer || layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		if (layer.width_original * layer.height_original > MAX_CARVE_PIXELS) {
			alertify.error(t('The image is too large for Content-Aware Scale.'));
			return;
		}
		new Dialog_class().show({
			title: 'Content-Aware Scale',
			params: [
				{name: 'width_percent', title: 'Width (%):', value: 80, range: [10, 200]},
				{name: 'height_percent', title: 'Height (%):', value: 100, range: [10, 200]},
				{name: 'protect', title: 'Protect selection:', value: true},
			],
			on_finish: (params) => this.scale_handler(layer.id, params),
		});
	}

	/**
	 * @param {number} layer_id
	 * @param {{width_percent: number, height_percent: number, protect?: boolean}} params
	 */
	scale_handler(layer_id, params) {
		const layer = this.Base_layers.get_layer(layer_id);
		if (!layer || layer.type != 'image') {
			return;
		}
		const width_share = Math.min(200, Math.max(10, parseFloat(params.width_percent) || 100)) / 100;
		const height_share = Math.min(200, Math.max(10, parseFloat(params.height_percent) || 100)) / 100;
		if (width_share == 1 && height_share == 1) {
			return;
		}
		const canvas = this.Base_layers.convert_layer_to_canvas(layer_id, true);
		const source = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		//the selection (also a soft or shaped one) is the area the seams must avoid
		const selection = params.protect === false ? null : this.Edit_selection.get_mask();
		if (selection != null) {
			source.protect = sample_mask_for_layer(selection.mask, layer, source.width, source.height);
		}
		const carved = content_aware_scale(source, canvas.width * width_share, canvas.height * height_share);
		if (carved == null) {
			alertify.error(t('The image is too large for Content-Aware Scale.'));
			return;
		}
		const out = document.createElement('canvas');
		out.width = carved.width;
		out.height = carved.height;
		out.getContext('2d').putImageData(new ImageData(carved.data, carved.width, carved.height), 0, 0);

		//a stretched layer keeps its stretch
		const stretch_x = layer.width / layer.width_original;
		const stretch_y = layer.height / layer.height_original;
		return app.State.do_action(
			new app.Actions.Bundle_action('content_aware_scale', 'Content-Aware Scale', [
				new app.Actions.Update_layer_image_action(out, layer.id),
				new app.Actions.Update_layer_action(layer.id, {
					width: Math.max(1, Math.round(out.width * stretch_x)),
					height: Math.max(1, Math.round(out.height * stretch_y)),
					width_original: out.width,
					height_original: out.height,
				}),
			])
		);
	}
}

export default Image_content_aware_scale_class;
