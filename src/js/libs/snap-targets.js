/**
 * View > Snap To (Photoshop): which things the Move tool and the other tools snap to. Pure functions, no DOM.
 */

/** The kinds of snap targets: the guides, the edges and centers of other layers, the document bounds and center, the lines of the grid (only while it is shown) */
export const SNAP_KEYS = ['guides', 'layers', 'bounds', 'grid'];

/** @returns {{guides: boolean, layers: boolean, bounds: boolean, grid: boolean}} everything on, the behavior from before the option existed */
export function default_snap_to() {
	return {guides: true, layers: true, bounds: true, grid: true};
}

/**
 * Reads the stored choice, which is not trusted: anything that is not a plain object gives the defaults and every
 * key that is not exactly `false` stays on.
 *
 * @param {string|null|undefined} text JSON
 * @returns {{guides: boolean, layers: boolean, bounds: boolean, grid: boolean}}
 */
export function parse_snap_to(text) {
	const result = default_snap_to();
	let value;
	try {
		value = JSON.parse(text || 'null');
	}
	catch {
		return result;
	}
	if (value === null || typeof value != 'object' || Array.isArray(value)) {
		return result;
	}
	for (const key of SNAP_KEYS) {
		if (Object.prototype.hasOwnProperty.call(value, key) && value[key] === false) {
			result[key] = false;
		}
	}
	return result;
}

/**
 * @param {object} snap_to the current choice
 * @param {string} key one of SNAP_KEYS, anything else changes nothing
 * @returns {{guides: boolean, layers: boolean, bounds: boolean, grid: boolean}} a new choice with that target switched
 */
export function toggle_snap_to(snap_to, key) {
	const next = Object.assign(default_snap_to(), snap_to);
	if (SNAP_KEYS.includes(key)) {
		next[key] = !next[key];
	}
	return next;
}

/**
 * The positions of the grid lines on one axis (the first line at 0 is the edge of the document and is left out)
 *
 * @param {number} size the distance between lines in pixels
 * @param {number} length the size of the document on that axis
 * @param {number} [max] the most lines returned (a tiny grid on a huge document would be useless and slow)
 * @returns {number[]}
 */
export function grid_lines(size, length, max = 5000) {
	const step = Math.floor(size);
	if (!isFinite(step) || step < 1 || !isFinite(length) || length <= 0 || length / step > max) {
		return [];
	}
	const lines = [];
	for (let position = step; position < length; position += step) {
		lines.push(position);
	}
	return lines;
}
