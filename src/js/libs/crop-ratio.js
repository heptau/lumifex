/**
 * The aspect ratio option of the Crop tool: a new crop frame keeps the chosen proportions while it is dragged out.
 * Pure functions, no DOM.
 */

/** Free = any proportions, Original = those of the document; the others are width : height */
export const CROP_RATIOS = ['Free', 'Original', '1:1', '4:3', '3:2', '16:9', '5:4', '3:4', '2:3', '9:16'];

/**
 * @param {string} label one of CROP_RATIOS
 * @param {number} width the width of the document
 * @param {number} height the height of the document
 * @returns {number|null} width / height, null for Free (and for anything unknown or unusable)
 */
export function ratio_value(label, width, height) {
	if (label === 'Original') {
		return width > 0 && height > 0 ? width / height : null;
	}
	const match = /^(\d+):(\d+)$/.exec(typeof label == 'string' ? label : '');
	if (!match || !CROP_RATIOS.includes(label)) {
		return null;
	}
	return Number(match[1]) / Number(match[2]);
}

/**
 * Makes the dragged frame fit the ratio: the longer side (in proportion) stays, the other one is changed. The signs
 * are kept, so the frame still grows in the direction of the drag.
 *
 * @param {number} width the dragged width (negative when dragged to the left)
 * @param {number} height the dragged height (negative when dragged up)
 * @param {number|null} ratio width / height; null leaves the frame alone
 * @returns {{width: number, height: number}} whole pixels
 */
export function fit_to_ratio(width, height, ratio) {
	if (!(ratio > 0) || !isFinite(width) || !isFinite(height)) {
		return {width, height};
	}
	const w = Math.abs(width);
	const h = Math.abs(height);
	let out_w = w;
	let out_h = h;
	if (w / Math.max(h, 1e-9) > ratio) {
		out_h = w / ratio;
	}
	else {
		out_w = h * ratio;
	}
	return {width: Math.round(out_w) * (width < 0 ? -1 : 1), height: Math.round(out_h) * (height < 0 ? -1 : 1)};
}
