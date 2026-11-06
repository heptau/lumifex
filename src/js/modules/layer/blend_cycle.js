import app from './../../app.js';
import config from './../../config.js';
import { cycle_blend_mode } from './../../libs/blend-modes.js';

/**
 * Layer > Blend Mode > Next / Previous: steps through the blend modes of the layers panel (one undo step)
 */
class Layer_blend_cycle_class {

	constructor() {
		if (Layer_blend_cycle_class.instance) {
			return Layer_blend_cycle_class.instance;
		}
		Layer_blend_cycle_class.instance = this;
	}

	next() {
		this.step(1);
	}

	previous() {
		this.step(-1);
	}

	step(direction) {
		if (!config.layer) {
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('change_layer_details', 'Change Layer Details', [
				new app.Actions.Update_layer_action(config.layer.id, {composition: cycle_blend_mode(config.layer.composition, direction)})
			])
		);
	}

}

export default Layer_blend_cycle_class;
