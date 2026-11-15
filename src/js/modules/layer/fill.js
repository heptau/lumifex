import app from './../../app.js';
import config from './../../config.js';
import { get_pattern_canvas } from './../edit/fill.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

/**
 * Layer > New Fill Layer - a layer filled with the foreground color, a gradient from foreground to background color
 * or the pattern from Edit > Define Pattern
 */
class Layer_fill_class {

	/**
	 * @param {string} kind "solid", "gradient" or "pattern"
	 */
	fill_layer(kind) {
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');
		if (kind == 'pattern') {
			const pattern = get_pattern_canvas();
			if (pattern == null) {
				alertify.warning(t('Define a pattern first (Edit > Define Pattern).'));
				return;
			}
			ctx.fillStyle = ctx.createPattern(pattern, 'repeat');
		}
		else if (kind == 'gradient') {
			const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			gradient.addColorStop(0, config.COLOR);
			gradient.addColorStop(1, config.COLOR_BG);
			ctx.fillStyle = gradient;
		}
		else {
			ctx.fillStyle = config.COLOR;
		}
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		app.State.do_action(
			new app.Actions.Bundle_action('fill_layer', 'New Fill Layer', [
				new app.Actions.Insert_layer_action({
					name: kind == 'gradient' ? t('Gradient Fill') : (kind == 'pattern' ? t('Pattern Fill') : t('Color Fill')),
					type: 'image',
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
					data: canvas.toDataURL('image/png'),
				}, false),
			])
		);
	}
}

export default Layer_fill_class;
