/**
 * Edit > Fill... (Photoshop): what the fill is made of, how it is blended and how strong it is. Pure functions, no DOM.
 */
import { BLEND_MODES } from './blend-modes.js';

/** The contents of the Fill dialog */
export const FILL_CONTENTS = ['Foreground Color', 'Background Color', 'Pattern', 'Black', '50% Gray', 'White'];

/** The labels of the blend modes (Normal, Multiply...) as the Layers panel has them */
export const FILL_MODES = BLEND_MODES.map((mode) => mode[1]);

/**
 * @param {string} label one of FILL_MODES
 * @returns {string} the canvas composite operation, source-over for anything unknown
 */
export function fill_operation(label) {
	const mode = BLEND_MODES.find((entry) => entry[1] === label);
	return mode ? mode[0] : 'source-over';
}

/**
 * @param {string} contents one of FILL_CONTENTS
 * @param {string} foreground #rrggbb
 * @param {string} background #rrggbb
 * @returns {string|null} the color of the contents as #rrggbb; null for the Pattern and for an unknown choice
 */
export function fill_color(contents, foreground, background) {
	switch (contents) {
		case 'Foreground Color':
			return foreground;
		case 'Background Color':
			return background;
		case 'Black':
			return '#000000';
		case '50% Gray':
			return '#808080';
		case 'White':
			return '#ffffff';
		default:
			return null;
	}
}

/**
 * @param {object} options what the dialog returned (strings, maybe garbage)
 * @returns {{contents: string, mode: string, opacity: number, color: string|null}} the contents (Foreground Color when
 *  unknown), the label of the mode (Normal when unknown), the opacity 1-100 (100 when it is not a number) and a color
 *  of its own (#rrggbb, for Stroke Selection; null when there is none or it is not valid)
 */
export function clean_fill_options(options) {
	const source = options && typeof options == 'object' ? options : {};
	const opacity = parseFloat(source.opacity);
	return {
		contents: FILL_CONTENTS.includes(source.contents) ? source.contents : FILL_CONTENTS[0],
		mode: FILL_MODES.includes(source.mode) ? source.mode : FILL_MODES[0],
		opacity: isNaN(opacity) ? 100 : Math.min(100, Math.max(1, opacity)),
		color: typeof source.color == 'string' && /^#[0-9a-f]{6}$/i.test(source.color) ? source.color.toLowerCase() : null,
	};
}
