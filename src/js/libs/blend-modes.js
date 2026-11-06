/**
 * Blend modes of layers in the order of the layers panel (like Photoshop): canvas composite operation -> label.
 * Pure functions without the DOM.
 */
export const BLEND_MODES = [
	['source-over', 'Normal'],
	['darken', 'Darken'],
	['multiply', 'Multiply'],
	['color-burn', 'Color Burn'],
	['lighten', 'Lighten'],
	['screen', 'Screen'],
	['color-dodge', 'Color Dodge'],
	['overlay', 'Overlay'],
	['soft-light', 'Soft Light'],
	['hard-light', 'Hard Light'],
	['difference', 'Difference'],
	['exclusion', 'Exclusion'],
	['hue', 'Hue'],
	['saturation', 'Saturation'],
	['color', 'Color'],
	['luminosity', 'Luminosity'],
];

/**
 * The blend mode that follows (step = 1) or precedes (step = -1) the current one in the list; the list is circular.
 * A mode that is not in the list (an older project) counts as Normal.
 *
 * @param {string|undefined|null} current composite operation of the layer
 * @param {number} step 1 or -1
 * @returns {string} composite operation
 */
export function cycle_blend_mode(current, step) {
	const direction = step < 0 ? -1 : 1;
	let index = BLEND_MODES.findIndex((mode) => mode[0] === (current || 'source-over'));
	if (index < 0) {
		index = 0;
	}
	return BLEND_MODES[(index + direction + BLEND_MODES.length) % BLEND_MODES.length][0];
}
