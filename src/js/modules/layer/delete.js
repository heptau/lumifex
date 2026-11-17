import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import { selected_layers } from './../../core/layer-selection.js';

class Layer_delete_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	/**
	 * Layer > Delete - the active layer, or all layers selected in the Layers panel in one step
	 */
	delete() {
		const layers = selected_layers();
		if (layers.length > 1) {
			app.State.do_action(
				new app.Actions.Bundle_action('delete_layers', 'Delete Layers', layers.map((layer) => new app.Actions.Delete_layer_action(layer.id)))
			);
			return;
		}
		app.State.do_action(
			new app.Actions.Delete_layer_action(config.layer.id)
		);
	}

}

export default Layer_delete_class;
