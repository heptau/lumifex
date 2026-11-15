/**
 * The fields of the Properties section for an adjustment layer (Photoshop's Properties panel): one input for every
 * setting of the adjustment, made from the same definition as the dialog (libs/adjustment-layers.js). Pure
 * functions, no DOM.
 */
import { ADJUSTMENTS, is_adjustment } from './adjustment-layers.js';

/**
 * @typedef {{name: string, title: string, kind: 'range'|'select'|'color'|'checkbox', range?: number[], step?: number,
 *   values?: string[], value: any}} Field
 */

/**
 * @param {string} key an adjustment
 * @returns {Field[]} the inputs of its settings (headings and the settings edited by their own editor, such as the curves
 *  graph, have none); an unknown adjustment has no fields
 */
export function property_fields(key) {
	if (!is_adjustment(key)) {
		return [];
	}
	/** @type {Field[]} */
	const fields = [];
	ADJUSTMENTS[key].params.forEach((param) => {
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
