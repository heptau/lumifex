/**
 * View > Snap To (Photoshop): which things the Move tool and the other tools snap to. Pure functions, no DOM.
 */

/** The kinds of snap targets: the guides, the edges and centers of other layers, the document bounds and center */
export const SNAP_KEYS = ['guides', 'layers', 'bounds'];

/** @returns {{guides: boolean, layers: boolean, bounds: boolean}} everything on, the behavior from before the option existed */
export function default_snap_to() {
	return {guides: true, layers: true, bounds: true};
}

/**
 * Reads the stored choice, which is not trusted: anything that is not a plain object gives the defaults and every
 * key that is not exactly `false` stays on.
 *
 * @param {string|null|undefined} text JSON
 * @returns {{guides: boolean, layers: boolean, bounds: boolean}}
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
 * @returns {{guides: boolean, layers: boolean, bounds: boolean}} a new choice with that target switched
 */
export function toggle_snap_to(snap_to, key) {
	const next = Object.assign(default_snap_to(), snap_to);
	if (SNAP_KEYS.includes(key)) {
		next[key] = !next[key];
	}
	return next;
}
