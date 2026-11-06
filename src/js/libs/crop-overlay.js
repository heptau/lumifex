/**
 * Composition guides drawn inside the crop frame: rule of thirds, golden ratio, diagonals, grid.
 * Pure functions without the DOM.
 */

export const CROP_OVERLAYS = ['None', 'Thirds', 'Golden Ratio', 'Diagonals', 'Grid'];

//the golden ratio splits a side to 38.2 % and 61.8 %
const GOLDEN = 1 / (1 + (1 + Math.sqrt(5)) / 2);

/**
 * Normalizes the value of the setting (a string, or an object with `value` from the tool attributes);
 * anything unknown gives the default, the rule of thirds.
 *
 * @param {*} value
 * @returns {string} one of CROP_OVERLAYS
 */
export function normalize_overlay(value) {
	const name = value != null && typeof value === 'object' ? value.value : value;
	return CROP_OVERLAYS.indexOf(name) >= 0 ? name : 'Thirds';
}

/**
 * @param {*} kind name of the overlay (see CROP_OVERLAYS)
 * @param {number} width width of the frame
 * @param {number} height height of the frame
 * @returns {Array<[number, number, number, number]>} segments [x1, y1, x2, y2] relative to the corner of the frame
 */
export function overlay_lines(kind, width, height) {
	width = Number(width);
	height = Number(height);
	if (!(width > 0) || !(height > 0)) {
		return [];
	}
	const fractions = {
		'Thirds': [1 / 3, 2 / 3],
		'Golden Ratio': [GOLDEN, 1 - GOLDEN],
		'Grid': [0.25, 0.5, 0.75],
	}[normalize_overlay(kind)];

	if (fractions) {
		const lines = [];
		for (const f of fractions) {
			lines.push([width * f, 0, width * f, height]);
		}
		for (const f of fractions) {
			lines.push([0, height * f, width, height * f]);
		}
		return lines;
	}
	if (normalize_overlay(kind) === 'Diagonals') {
		return [[0, 0, width, height], [width, 0, 0, height]];
	}
	return [];
}
