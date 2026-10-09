/**
 * Backgrounds that can be shown behind transparent pixels (Settings > Transparency background).
 * The values are the labels of the select box (and the keys of the dictionaries), the CSS class
 * `.transparent-grid.<class>` is made by `transparency_class`.
 */
export const SEPARATOR = '---';

export const TRANSPARENCY_TYPES = [
	'Squares',
	SEPARATOR,
	'Gray', 'White', 'Black',
	SEPARATOR,
	'Red', 'Green', 'Blue',
	SEPARATOR,
	'Yellow', 'Cyan', 'Magenta',
];

/**
 * Canonical value of a stored setting or null. Older versions stored lower case values and "grey".
 * @param {*} value
 * @returns {string|null}
 */
export function normalize_transparency_type(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const lower = value.toLowerCase() === 'grey' ? 'gray' : value.toLowerCase();
	return TRANSPARENCY_TYPES.find((type) => type !== SEPARATOR && type.toLowerCase() === lower) || null;
}

export function is_transparency_type(value) {
	return normalize_transparency_type(value) !== null;
}

/**
 * CSS class of the background ("squares" has the checkerboard image as the default)
 * @param {string} value
 * @returns {string}
 */
export function transparency_class(value) {
	const type = normalize_transparency_type(value) || 'Squares';
	return type == 'Gray' ? 'grey' : type.toLowerCase();
}
