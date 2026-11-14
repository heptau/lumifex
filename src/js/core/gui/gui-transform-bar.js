import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Tools_settings_class from './../../modules/tools/settings.js';
import Tools_translate_class, { t } from './../../modules/tools/translate.js';
import { fields_from_layer, update_from_field } from './../../libs/transform-bar.js';

const FIELD_DEFINITIONS = [
	{field: 'x', input: 'transform_bar_x', label: 'X:', title: 'Horizontal position of the center'},
	{field: 'y', input: 'transform_bar_y', label: 'Y:', title: 'Vertical position of the center'},
	{field: 'width', input: 'transform_bar_width', label: 'W:', title: 'Width'},
	{field: 'height', input: 'transform_bar_height', label: 'H:', title: 'Height'},
	{field: 'rotate', input: 'transform_bar_rotate', label: 'Angle:', title: 'Rotation in degrees'},
];

const LINK_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" '
	+ 'stroke-linecap="round" aria-hidden="true"><path d="M6.5 9.5l3-3"/><path d="M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1"/>'
	+ '<path d="M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1"/></svg>';

/**
 * Numeric transform bar in the options bar (Photoshop shows it for Free Transform): X, Y, W, H and the angle of the
 * active layer, with a chain that keeps the proportions. It is shown for the Move tool, which is also what
 * Edit > Free Transform chooses. A change is one undo step through Update_layer_action; the values follow the layer
 * while it is dragged with the mouse (sync is called after every render).
 */
class GUI_transform_bar_class {

	constructor() {
		this.Helper = new Helper_class();
		this.Tools_settings = new Tools_settings_class();
		this.Tools_translate = new Tools_translate_class();
		this.link = null; //null = by the layer (a picture keeps its proportions), true / false = chosen by the user
	}

	/**
	 * Draws the bar into the options bar (called after the options of the tool were drawn)
	 */
	render() {
		const container = document.getElementById('action_attributes');
		if (!container || !app.GUI || !app.GUI.GUI_tools || app.GUI.GUI_tools.active_tool != 'select') {
			return;
		}
		const bar = document.createElement('div');
		bar.className = 'item transform_bar';
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', t('Transform'));
		FIELD_DEFINITIONS.forEach((definition) => {
			if (definition.field == 'height') {
				const chain = document.createElement('button');
				chain.type = 'button';
				chain.id = 'transform_bar_link';
				chain.className = 'ui_icon_button input_height';
				chain.title = t('Keep proportions');
				chain.setAttribute('aria-label', t('Keep proportions'));
				chain.innerHTML = LINK_ICON;
				chain.addEventListener('click', () => {
					this.link = !this.is_linked();
					this.sync();
				});
				bar.appendChild(chain);
			}
			const label = document.createElement('label');
			label.className = 'trn';
			label.htmlFor = definition.input;
			label.textContent = definition.label;
			const input = document.createElement('input');
			input.type = 'number';
			input.id = definition.input;
			input.step = 'any';
			input.title = t(definition.title);
			input.addEventListener('change', () => this.apply(definition.field, input.value));
			bar.appendChild(label);
			bar.appendChild(input);
		});
		container.appendChild(bar);
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, bar);
		}
		this.sync();
	}

	/**
	 * @returns {boolean} the width and the height change together
	 */
	is_linked() {
		if (this.link !== null) {
			return this.link;
		}
		return !!config.layer && config.layer.type == 'image';
	}

	units() {
		return {
			type: this.Tools_settings.get_setting('default_units'),
			resolution: this.Tools_settings.get_setting('resolution'),
		};
	}

	/**
	 * Puts the values of the active layer into the fields (a field that is being typed into is left alone)
	 */
	sync() {
		const bar = document.querySelector('#action_attributes .transform_bar');
		if (!bar) {
			return;
		}
		const fields = fields_from_layer(config.layer);
		const units = this.units();
		FIELD_DEFINITIONS.forEach((definition) => {
			const input = /** @type {HTMLInputElement} */ (document.getElementById(definition.input));
			if (!input) {
				return;
			}
			input.disabled = fields == null;
			if (fields == null) {
				input.value = '';
				return;
			}
			if (document.activeElement === input) {
				return;
			}
			const value = fields[definition.field];
			input.value = definition.field == 'rotate'
				? String(Math.round(value * 100) / 100)
				: String(this.Helper.get_user_unit(value, units.type, units.resolution) ?? '');
		});
		const chain = document.getElementById('transform_bar_link');
		if (chain) {
			chain.setAttribute('aria-pressed', String(this.is_linked()));
			chain.disabled = fields == null;
		}
	}

	/**
	 * One field was edited: the layer is changed in one history step
	 *
	 * @param {'x'|'y'|'width'|'height'|'rotate'} field
	 * @param {string} text
	 */
	apply(field, text) {
		const layer = config.layer;
		if (layer == null) {
			return;
		}
		const units = this.units();
		const value = field == 'rotate' ? parseFloat(text) : this.Helper.get_internal_unit(text, units.type, units.resolution);
		const settings = typeof value == 'number' ? update_from_field(layer, field, value, this.is_linked()) : null;
		if (settings == null) {
			this.sync();
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('transform_layer', 'Transform Layer', [
				new app.Actions.Update_layer_action(layer.id, settings),
			])
		).finally(() => this.sync());
	}
}

export default GUI_transform_bar_class;
