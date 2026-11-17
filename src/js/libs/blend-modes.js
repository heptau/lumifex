import { CUSTOM_BLEND, is_custom_blend } from './custom-blend.js';

/**
 * Blend modes of layers in the order of the layers panel (like Photoshop): composite operation -> label.
 * The ids starting with `lf-` are blended by libs/custom-blend.js, the others by the canvas.
 * Pure functions without the DOM.
 */
export const BLEND_MODES = [
	['source-over', 'Normal'],
	[CUSTOM_BLEND.dissolve, 'Dissolve'],
	['darken', 'Darken'],
	['multiply', 'Multiply'],
	['color-burn', 'Color Burn'],
	[CUSTOM_BLEND.linear_burn, 'Linear Burn'],
	[CUSTOM_BLEND.darker_color, 'Darker Color'],
	['lighten', 'Lighten'],
	['screen', 'Screen'],
	['color-dodge', 'Color Dodge'],
	['lighter', 'Linear Dodge (Add)'],
	[CUSTOM_BLEND.lighter_color, 'Lighter Color'],
	['overlay', 'Overlay'],
	['soft-light', 'Soft Light'],
	['hard-light', 'Hard Light'],
	[CUSTOM_BLEND.vivid_light, 'Vivid Light'],
	[CUSTOM_BLEND.linear_light, 'Linear Light'],
	[CUSTOM_BLEND.pin_light, 'Pin Light'],
	[CUSTOM_BLEND.hard_mix, 'Hard Mix'],
	['difference', 'Difference'],
	['exclusion', 'Exclusion'],
	[CUSTOM_BLEND.subtract, 'Subtract'],
	[CUSTOM_BLEND.divide, 'Divide'],
	['hue', 'Hue'],
	['saturation', 'Saturation'],
	['color', 'Color'],
	['luminosity', 'Luminosity'],
];

/** The modes the canvas blends itself (for places that can only use `globalCompositeOperation`) */
export const CANVAS_BLEND_MODES = BLEND_MODES.filter((mode) => !is_custom_blend(mode[0]));

//other composite operations a layer can have (Layer > Composition…, the clipping mask is source-atop)
const CANVAS_OPERATIONS = ['source-in', 'source-out', 'source-atop', 'destination-over', 'destination-in', 'destination-out',
	'destination-atop', 'copy', 'xor'];

/**
 * A blend mode read from a project or a file: anything that is not known becomes Normal
 *
 * @param {*} mode
 * @returns {string}
 */
export function clean_blend_mode(mode) {
	if (typeof mode !== 'string') {
		return 'source-over';
	}
	if (BLEND_MODES.some((entry) => entry[0] === mode) || CANVAS_OPERATIONS.indexOf(mode) >= 0) {
		return mode;
	}
	return 'source-over';
}

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
