import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import { visibility_toggles } from './../../libs/layer-select.js';

class Layer_visibility_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	/**
	 * Layer > Show All Layers - every hidden layer becomes visible (one undo step)
	 */
	show_all() {
		return this.apply('show_all', 'Show All Layers');
	}

	/**
	 * Layer > Hide Other Layers - only the active layer stays visible (one undo step)
	 */
	hide_others() {
		return this.apply('hide_others', 'Hide Other Layers');
	}

	apply(mode, label) {
		const ids = visibility_toggles(config.layers, config.layer ? config.layer.id : null, mode);
		if (ids.length == 0) {
			return;
		}
		return app.State.do_action(
			new app.Actions.Bundle_action(mode, label, ids.map((id) => new app.Actions.Toggle_layer_visibility_action(id)))
		);
	}

	toggle() {
		app.State.do_action(
			new app.Actions.Toggle_layer_visibility_action(config.layer.id)
		);
	}

}

export default Layer_visibility_class;
