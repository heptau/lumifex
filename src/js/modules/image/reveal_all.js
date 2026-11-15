import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { reveal_all_size } from './../../libs/reveal-all.js';
import { t } from '../tools/translate.js';

class Image_reveal_all_class {

	/**
	 * Image > Reveal All - enlarges the canvas so that all layers fit (one history step)
	 */
	reveal() {
		const size = reveal_all_size(config.layers, config.WIDTH, config.HEIGHT);
		if (size.width == config.WIDTH && size.height == config.HEIGHT) {
			alertify.message(t('All layers already fit into the canvas.'));
			return;
		}

		const actions = [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				WIDTH: size.width,
				HEIGHT: size.height,
			}),
		];
		if (size.dx != 0 || size.dy != 0) {
			for (const layer of config.layers) {
				if (typeof layer.x == 'number' && typeof layer.y == 'number') {
					actions.push(new app.Actions.Update_layer_action(layer.id, {x: layer.x + size.dx, y: layer.y + size.dy}));
				}
			}
		}
		actions.push(new app.Actions.Prepare_canvas_action('do'));

		app.State.do_action(
			new app.Actions.Bundle_action('reveal_all', 'Reveal All', actions)
		);
	}
}

export default Image_reveal_all_class;
