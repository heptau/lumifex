/**
 * Brush presets: a named set of the options of the Brush (size, hardness, spacing, scatter, jitter, symmetry...).
 * A preset is stored as plain values by the name of the option; reading and applying validates everything against the
 * definition of the tool, because the stored text can be edited or come from an older version. Pure functions, no DOM.
 *
 * @typedef {Object<string, number|boolean|string>} Brush_preset
 * @typedef {{name: string, values: Brush_preset}} Named_preset
 */

export const STORAGE_KEY = 'lumifex_brush_presets';
export const MAX_PRESETS = 50;
export const MAX_NAME = 40;
const MAX_TEXT = 100000;

/**
 * @param {*} attribute one option of the tool: a number, a boolean or {value, min, max, values}
 * @returns {number|boolean|string|undefined}
 */
function value_of(attribute) {
	if (attribute !== null && typeof attribute == 'object') {
		return attribute.value;
	}
	return attribute;
}

/**
 * @param {Object<string, any>} attributes the options of the tool (config.TOOLS[...].attributes)
 * @returns {Brush_preset} the current values of all options
 */
export function snapshot_attributes(attributes) {
	/** @type {Brush_preset} */
	const values = {};
	Object.keys(attributes || {}).forEach((key) => {
		const value = value_of(attributes[key]);
		if (typeof value == 'number' || typeof value == 'boolean' || typeof value == 'string') {
			values[key] = value;
		}
	});
	return values;
}

/**
 * Checks one stored value against the option it is for
 *
 * @param {*} attribute definition of the option
 * @param {*} value
 * @returns {number|boolean|string|undefined} the value to use, undefined when it is not acceptable
 */
function clean_value(attribute, value) {
	const current = value_of(attribute);
	if (typeof current == 'boolean') {
		return typeof value == 'boolean' ? value : undefined;
	}
	if (typeof current == 'number') {
		if (typeof value != 'number' || !isFinite(value)) {
			return undefined;
		}
		const min = attribute && typeof attribute == 'object' && typeof attribute.min == 'number' ? attribute.min : -Infinity;
		const max = attribute && typeof attribute == 'object' && typeof attribute.max == 'number' ? attribute.max : Infinity;
		return Math.max(min, Math.min(max, value));
	}
	if (typeof current == 'string') {
		const allowed = attribute && typeof attribute == 'object' && Array.isArray(attribute.values) ? attribute.values : null;
		return typeof value == 'string' && (allowed == null || allowed.includes(value)) ? value : undefined;
	}
	return undefined;
}

/**
 * Puts a preset into the options of the tool (in place). Unknown names and bad values are ignored, options the preset
 * does not mention stay as they are.
 *
 * @param {Object<string, any>} attributes
 * @param {Brush_preset} values
 * @returns {number} how many options were changed
 */
export function apply_preset(attributes, values) {
	let changed = 0;
	if (!attributes || !values || typeof values != 'object') {
		return changed;
	}
	Object.keys(values).forEach((key) => {
		if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
			return;
		}
		const clean = clean_value(attributes[key], values[key]);
		if (clean === undefined) {
			return;
		}
		if (attributes[key] !== null && typeof attributes[key] == 'object') {
			attributes[key].value = clean;
		}
		else {
			attributes[key] = clean;
		}
		changed++;
	});
	return changed;
}

/**
 * @param {*} name
 * @returns {string} the name without control characters, trimmed and shortened ('' when nothing is left)
 */
export function clean_preset_name(name) {
	return Array.from(String(name == null ? '' : name)).filter((c) => c.charCodeAt(0) >= 32).join('').trim().slice(0, MAX_NAME);
}

/**
 * Reads the stored list; anything that is not valid is dropped
 *
 * @param {string|null|undefined} text JSON
 * @returns {Named_preset[]}
 */
export function parse_presets(text) {
	if (typeof text != 'string' || text.length > MAX_TEXT) {
		return [];
	}
	let data;
	try {
		data = JSON.parse(text);
	}
	catch {
		return [];
	}
	if (!Array.isArray(data)) {
		return [];
	}
	const seen = new Set();
	/** @type {Named_preset[]} */
	const list = [];
	data.forEach((item) => {
		const name = item && typeof item == 'object' ? clean_preset_name(item.name) : '';
		if (name == '' || seen.has(name) || list.length >= MAX_PRESETS || !item.values || typeof item.values != 'object' || Array.isArray(item.values)) {
			return;
		}
		/** @type {Brush_preset} */
		const values = {};
		Object.keys(item.values).forEach((key) => {
			const value = item.values[key];
			if (typeof value == 'number' ? isFinite(value) : (typeof value == 'boolean' || typeof value == 'string')) {
				values[key] = typeof value == 'string' ? value.slice(0, 50) : value;
			}
		});
		seen.add(name);
		list.push({name, values});
	});
	return list;
}

/**
 * Adds a preset, or replaces the one with the same name
 *
 * @param {Named_preset[]} list
 * @param {string} name
 * @param {Brush_preset} values
 * @returns {Named_preset[]|null} a new list, null when the name is empty or the list is full
 */
export function add_preset(list, name, values) {
	const clean = clean_preset_name(name);
	if (clean == '') {
		return null;
	}
	const exists = list.some((item) => item.name == clean);
	if (!exists && list.length >= MAX_PRESETS) {
		return null;
	}
	const entry = {name: clean, values: Object.assign({}, values)};
	return exists ? list.map((item) => (item.name == clean ? entry : item)) : list.concat([entry]);
}

/**
 * @param {Named_preset[]} list
 * @param {string} name
 * @returns {Named_preset[]} a new list without the preset
 */
export function remove_preset(list, name) {
	return list.filter((item) => item.name != name);
}
