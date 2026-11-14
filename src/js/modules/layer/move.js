import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';

class Layer_move_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	up() {
		app.State.do_action(
			new app.Actions.Reorder_layer_action(config.layer.id, 1)
		);
	}

	down() {
		app.State.do_action(
			new app.Actions.Reorder_layer_action(config.layer.id, -1)
		);
	}

	/**
	 * Layer > Arrange > Bring to Front (Shift+Ctrl+]) - one history step
	 */
	top() {
		return this.move_all(1);
	}

	/**
	 * Layer > Arrange > Send to Back (Shift+Ctrl+[) - one history step
	 */
	bottom() {
		return this.move_all(-1);
	}

	/**
	 * @param {number} direction 1 up, -1 down
	 */
	move_all(direction) {
		const layer = config.layer;
		if (!layer) {
			return;
		}
		const steps = config.layers.filter((other) => (direction > 0 ? other.order > layer.order : other.order < layer.order)).length;
		if (steps == 0) {
			return;
		}
		const actions = [];
		for (let i = 0; i < steps; i++) {
			actions.push(new app.Actions.Reorder_layer_action(layer.id, direction));
		}
		return app.State.do_action(
			new app.Actions.Bundle_action(direction > 0 ? 'layer_to_front' : 'layer_to_back', direction > 0 ? 'Bring Layer to Front' : 'Send Layer to Back', actions)
		);
	}
}

export default Layer_move_class;
