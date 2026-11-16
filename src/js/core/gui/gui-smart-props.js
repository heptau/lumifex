import app from './../../app.js';
import config from './../../config.js';
import { is_smart_entry, is_smart_filter, clean_smart_settings, SMART_FILTERS } from './../../libs/smart-filters.js';
import { smart_property_fields, field_value } from './../../libs/adjustment-fields.js';
import { create_field_row } from './gui-field-row.js';
import { t } from './../../modules/tools/translate.js';

/**
 * The Properties section for the smart filters of a layer (Photoshop's Properties panel): every filter has its own
 * block with the settings, edited right in the Layer details panel. The picture follows while a slider moves; letting go
 * is one undo step (the whole list of filters is swapped, as the dialog does).
 */
class GUI_smart_props_class {

	constructor() {
		this.signature = null;
		this.inputs = {}; //filter id -> {setting name -> {main, number}}
		this.start = null; //the list of filters when an edit started
	}

	render() {
		const box = document.getElementById('smart_detail_params');
		if (!box) {
			return;
		}
		const layer = config.layer;
		const entries = layer && Array.isArray(layer.filters) ? layer.filters.filter((f) => is_smart_entry(f) && f.params && is_smart_filter(f.params.key)) : [];
		if (entries.length == 0) {
			box.hidden = true;
			if (this.signature !== null) {
				box.textContent = '';
				this.signature = null;
				this.inputs = {};
			}
			return;
		}
		box.hidden = false;
		const signature = `${layer.id}|${entries.map((f) => `${f.id}:${f.params.key}`).join(',')}`;
		if (signature !== this.signature) {
			this.build(box, entries);
			this.signature = signature;
		}
		entries.forEach((entry) => {
			const settings = clean_smart_settings(entry.params.key, entry.params.settings);
			const rows = this.inputs[entry.id] || {};
			Object.keys(rows).forEach((name) => {
				const input = rows[name];
				if (document.activeElement === input.main) {
					return;
				}
				if (input.main.type == 'checkbox') {
					input.main.checked = settings[name] === true;
				}
				else {
					input.main.value = String(settings[name]);
					if (input.number) {
						input.number.value = String(settings[name]);
					}
				}
			});
		});
	}

	build(box, entries) {
		box.textContent = '';
		this.inputs = {};
		entries.forEach((entry) => {
			const key = entry.params.key;
			const heading = document.createElement('div');
			heading.className = 'row';
			const title = document.createElement('strong');
			title.textContent = t(SMART_FILTERS[key].title);
			heading.appendChild(title);
			box.appendChild(heading);
			this.inputs[entry.id] = {};
			smart_property_fields(key).forEach((field) => {
				const {row, main, number} = create_field_row(field);
				box.appendChild(row);
				this.inputs[entry.id][field.name] = {main, number};
				this.listen(entry.id, field, main, number);
			});
		});
	}

	/**
	 * Replaces the settings of one filter in a list of filters (the other entries stay the same objects)
	 */
	with_setting(list, id, name, value) {
		return list.map((filter) => {
			if (filter.id !== id) {
				return filter;
			}
			const settings = clean_smart_settings(filter.params.key, Object.assign({}, filter.params.settings, {[name]: value}));
			return Object.assign({}, filter, {params: Object.assign({}, filter.params, {settings})});
		});
	}

	listen(id, field, main, number) {
		const read = (source) => field_value(field, source.type == 'checkbox' ? source.checked : source.value);
		const live = (source) => {
			const layer = config.layer;
			if (!layer || !Array.isArray(layer.filters)) {
				return;
			}
			if (this.start === null) {
				this.start = layer.filters;
			}
			const value = read(source);
			layer.filters = this.with_setting(this.start, id, field.name, value);
			if (number) {
				(source === number ? main : number).value = String(value);
			}
			config.need_render = true;
		};
		const commit = () => {
			const layer = config.layer;
			if (this.start === null || !layer) {
				this.start = null;
				return;
			}
			const next = layer.filters;
			layer.filters = this.start; //the action stores the old list itself
			this.start = null;
			if (JSON.stringify(next) !== JSON.stringify(layer.filters)) {
				app.State.do_action(
					new app.Actions.Bundle_action('edit_smart_filter', 'Edit Smart Filter', [
						new app.Actions.Update_layer_action(layer.id, {filters: next}),
					])
				);
			}
		};
		const instant = main.type == 'checkbox' || main.tagName == 'SELECT';
		main.addEventListener(instant ? 'change' : 'input', () => {
			live(main);
			if (instant) {
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

export default GUI_smart_props_class;
