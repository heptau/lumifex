import app from './../../app.js';
import config from './../../config.js';
import { is_adjustment, clean_settings, ADJUSTMENTS } from './../../libs/adjustment-layers.js';
import { property_fields, field_value } from './../../libs/adjustment-fields.js';
import Layer_adjustment_class from './../../modules/layer/adjustment.js';
import { create_field_row } from './gui-field-row.js';
import { t } from './../../modules/tools/translate.js';

/**
 * The Properties section of an adjustment layer (Photoshop's Properties panel): the settings of the adjustment are
 * edited right in the Layer details panel instead of in a dialog. The picture changes while a slider moves; letting
 * go is one undo step. The curves graph still has its dialog (the button Edit...).
 */
class GUI_adjustment_props_class {

	constructor() {
		this.signature = null; //which layer and adjustment the rows were built for
		this.inputs = {}; //setting name -> input
		this.start = null; //the params of the layer when an edit started
	}

	/**
	 * Shows the section for an adjustment layer and hides it for any other; call it after the active layer or its
	 * settings may have changed (the values of inputs that are not being edited follow the layer)
	 */
	render() {
		const box = document.getElementById('adjustment_detail_params');
		if (!box) {
			return;
		}
		const layer = config.layer;
		const key = layer && layer.type == 'adjustment' && layer.params ? layer.params.adjustment : null;
		if (!is_adjustment(key)) {
			box.hidden = true;
			if (this.signature !== null) {
				box.textContent = '';
				this.signature = null;
				this.inputs = {};
			}
			return;
		}
		box.hidden = false;
		const signature = `${layer.id}|${key}`;
		if (signature !== this.signature) {
			this.build(box, layer, key);
			this.signature = signature;
		}
		const settings = clean_settings(key, layer.params.settings);
		Object.keys(this.inputs).forEach((name) => {
			const input = this.inputs[name];
			if (document.activeElement === input.main) {
				return;
			}
			const value = settings[name];
			if (input.main.type == 'checkbox') {
				input.main.checked = value === true;
			}
			else {
				input.main.value = String(value);
				if (input.number) {
					input.number.value = String(value);
				}
			}
		});
	}

	/**
	 * @param {HTMLElement} box
	 * @param {object} layer
	 * @param {string} key
	 */
	build(box, layer, key) {
		box.textContent = '';
		this.inputs = {};
		const heading = document.createElement('div');
		heading.className = 'row';
		const title = document.createElement('strong');
		title.textContent = t(ADJUSTMENTS[key].title);
		heading.appendChild(title);
		box.appendChild(heading);

		property_fields(key).forEach((field) => {
			const {row, main, number} = create_field_row(field);
			box.appendChild(row);
			this.inputs[field.name] = {main, number};
			this.listen(field, main, number);
		});

		if (ADJUSTMENTS[key].state) {
			const row = document.createElement('div');
			row.className = 'row center';
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'dots';
			button.textContent = t('Edit...');
			button.addEventListener('click', () => new Layer_adjustment_class().edit());
			row.appendChild(button);
			box.appendChild(row);
		}
	}

	/**
	 * The edit of one setting: the layer follows the input while it moves, the history gets one step when it is let go
	 */
	listen(field, main, number) {
		const read = (source) => field_value(field, source.type == 'checkbox' ? source.checked : source.value);
		const live = (source) => {
			const layer = config.layer;
			if (!layer || layer.type != 'adjustment' || !layer.params) {
				return;
			}
			if (this.start === null) {
				this.start = layer.params;
			}
			const value = read(source);
			const settings = clean_settings(layer.params.adjustment, Object.assign({}, this.start.settings, {[field.name]: value}));
			layer.params = Object.assign({}, this.start, {settings});
			if (number && source !== number) {
				number.value = String(value);
			}
			if (number && source === number) {
				main.value = String(value);
			}
			config.need_render = true;
		};
		const commit = () => {
			const layer = config.layer;
			if (this.start === null || !layer) {
				this.start = null;
				return;
			}
			const next = layer.params;
			layer.params = this.start; //the action stores the old value itself
			this.start = null;
			if (JSON.stringify(next) !== JSON.stringify(layer.params)) {
				app.State.do_action(
					new app.Actions.Bundle_action('edit_adjustment_layer', 'Edit Adjustment Layer', [
						new app.Actions.Update_layer_action(layer.id, {params: next}),
					])
				);
			}
		};
		const type = main.type;
		main.addEventListener(type == 'checkbox' || main.tagName == 'SELECT' ? 'change' : 'input', () => {
			live(main);
			if (type == 'checkbox' || main.tagName == 'SELECT') {
				commit();
			}
		});
		main.addEventListener('change', commit);
		if (number) {
			number.addEventListener('input', () => live(number));
			number.addEventListener('change', commit);
		}
	}
}

export default GUI_adjustment_props_class;
