import app from './../../app.js';
import config from './../../config.js';
import { layer_to_select } from './../../libs/layer-select.js';

/**
 * Layer > Select > Next / Previous / Top / Bottom Layer - moves the active layer through the stack
 */
class Layer_select_class {

	select(where) {
		const id = layer_to_select(config.layers, config.layer ? config.layer.id : null, where);
		if (id == null) {
			return;
		}
		return app.State.do_action(new app.Actions.Select_layer_action(id));
	}

	next() {
		return this.select('next');
	}

	previous() {
		return this.select('previous');
	}

	top() {
		return this.select('top');
	}

	bottom() {
		return this.select('bottom');
	}
}

export default Layer_select_class;
