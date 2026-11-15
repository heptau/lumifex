import config from '../../../config.js';
import Effects_innerShadow_class from './inner-shadow.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../../tools/translate.js';

/**
 * Layer style Inner Glow - a soft glow that runs along the inner edge of an image layer.
 * It is an Inner Shadow without an offset, so it shares the drawing and the cache with it.
 */
class Effects_innerGlow_class extends Effects_innerShadow_class {

	inner_glow(filter_id) {
		if (config.layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}

		const filter = this.Base_layers.find_filter_by_id(filter_id, 'inner-glow');

		const params = [
			{name: "blur", title: "Radius:", value: filter.blur ??= 10, range: [1, 50]},
			{name: "choke", title: "Choke:", value: filter.choke ??= 0, range: [0, 100]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 75, range: [1, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#ffffbe", type: 'color'},
		];
		this.show_dialog('inner-glow', params, filter_id);
	}

	demo(canvas_id, canvas_thumb) {
		const canvas = document.getElementById(canvas_id);
		const ctx = canvas.getContext("2d");
		const width = this.Effects_browser.preview_width - 20;
		const height = this.Effects_browser.preview_height - 20;

		ctx.drawImage(canvas_thumb, 10, 10, width, height);
		ctx.drawImage(this.build_shadow(canvas_thumb, width, height, {x: 0, y: 0, blur: 6, color: '#ffffbe'}), 10, 10);
	}

}

export default Effects_innerGlow_class;
