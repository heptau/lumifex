import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import colorThief_class from './../../libs/color-thief.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';
import { t } from '../tools/translate.js';

class Image_color_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.alertify = new colorThief_class();
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
	}

	palette() {
		if (config.layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		let palette = this.alertify.getPalette(config.layer.link);
		//getColor fails itself when the library finds no pixels, so ask only when there is a palette
		let dominant = palette && palette.length ? this.alertify.getColor(config.layer.link) : null;
		if (!dominant) {
			//the library skips transparent and nearly white pixels, so it finds nothing in such a layer
			if (!this.has_visible_pixels(config.layer.link)) {
				alertify.error(t('Layer is empty.'));
				return;
			}
			palette = [[255, 255, 255]];
			dominant = palette[0];
		}
		dominant = this.Helper.rgbToHex(dominant[0], dominant[1], dominant[2]);

		const settings = {
			title: 'Palette',
			params: [
				{title: "Dominant color:", html: this.generate_color_box(dominant, 200)},
			],
		};
		for (let i in palette) {
			const rgb = this.Helper.rgbToHex(palette[i][0], palette[i][1], palette[i][2]);
			i = parseInt(i);
			settings.params.push(
				{title: `Color #${i + 1}:`, html: this.generate_color_box(rgb, 100)}
			);
		}
		this.POP.show(settings);
	}

	has_visible_pixels(image) {
		const canvas = document.createElement('canvas');
		canvas.width = image.width || image.naturalWidth;
		canvas.height = image.height || image.naturalHeight;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0);
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] >= 125) {
				return true;
			}
		}
		return false;
	}

	generate_color_box(color, width) {
		let html = '';

		html += `<input style="width:100px;margin-right:10px;" type="text" value="${color}" />`;
		html += `<span style="display:inline-block;width:${width}px;height:21px;margin-bottom:-6px;border:1px solid black;background-color:${color}"></span>`;

		return html;
	}

}

export default Image_color_class;
