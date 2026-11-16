/**
 * The fields of the Properties section for an adjustment layer (Photoshop's Properties panel): one input for every
 * setting of the adjustment, made from the same definition as the dialog (libs/adjustment-layers.js). Pure
 * functions, no DOM.
 */
import { ADJUSTMENTS, is_adjustment } from './adjustment-layers.js';
import { SMART_FILTERS, is_smart_filter } from './smart-filters.js';

/**
 * @typedef {{name: string, title: string, kind: 'range'|'select'|'color'|'checkbox', range?: number[], step?: number,
 *   values?: string[], value: any}} Field
 */

/**
 * @param {{name?: string, title?: string, value?: any, values?: string[], range?: number[], step?: number, type?: string}[]} params
 *  the settings as the dialogs define them
 * @returns {Field[]} one field for every named setting that has an input (headings have none)
 */
export function fields_from_params(params) {
	/** @type {Field[]} */
	const fields = [];
	params.forEach((param) => {
		if (!param.name) {
			return;
		}
		/** @type {'range'|'select'|'color'|'checkbox'|null} */
		let kind = null;
		if (Array.isArray(param.values)) {
			kind = 'select';
		}
		else if (param.type == 'color') {
			kind = 'color';
		}
		else if (typeof param.value == 'boolean') {
			kind = 'checkbox';
		}
		else if (Array.isArray(param.range)) {
			kind = 'range';
		}
		if (kind) {
			fields.push({name: param.name, title: param.title || param.name, kind, range: param.range, step: param.step, values: param.values, value: param.value});
		}
	});
	return fields;
}

/**
 * @param {string} key an adjustment
 * @returns {Field[]} the inputs of its settings (the settings edited by their own editor, such as the curves graph,
 *  have none); an unknown adjustment has no fields
 */
export function property_fields(key) {
	return is_adjustment(key) ? fields_from_params(ADJUSTMENTS[key].params) : [];
}

/**
 * @param {string} key a smart filter
 * @returns {Field[]} the inputs of its settings; an unknown filter has no fields
 */
export function smart_property_fields(key) {
	return is_smart_filter(key) ? fields_from_params(SMART_FILTERS[key].params) : [];
}

/**
 * Turns what an input holds (a string, a checkbox state) into the value of the setting
 *
 * @param {Field} field
 * @param {any} raw
 * @returns {any} a number within the range, one of the listed values, a #rrggbb color or a boolean; anything invalid
 *  gives the default of the field
 */
export function field_value(field, raw) {
	switch (field.kind) {
		case 'range': {
			const number = parseFloat(raw);
			if (isNaN(number)) {
				return field.value;
			}
			const [min, max] = field.range || [-Infinity, Infinity];
			return Math.min(max, Math.max(min, number));
		}
		case 'select':
			return (field.values || []).includes(raw) ? raw : field.value;
		case 'color':
			return typeof raw == 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : field.value;
		default:
			return raw === true || raw === 'true' || raw === 'on';
	}
}
