/**
 * The anchor of Canvas Size (Photoshop): when the canvas gets bigger or smaller, the content stays at the chosen
 * place (a corner, an edge or the center) instead of always at the top left. Pure functions, no DOM.
 */

/** The nine anchors; the first is the behaviour from before the option existed */
export const ANCHORS = ['Top Left', 'Top', 'Top Right', 'Left', 'Center', 'Right', 'Bottom Left', 'Bottom', 'Bottom Right'];

/**
 * @param {string} anchor one of ANCHORS, anything else means Top Left
 * @returns {{x: number, y: number}} the share of the size change that moves the content: 0, 0.5 or 1
 */
export function anchor_shares(anchor) {
	const index = ANCHORS.indexOf(anchor);
	if (index < 0) {
		return {x: 0, y: 0};
	}
	return {x: (index % 3) / 2, y: Math.floor(index / 3) / 2};
}

/**
 * Relative Canvas Size (Photoshop): the entered numbers are added to the current size (negative ones shrink it)
 *
 * @param {number} current current size in pixels
 * @param {number} delta the change in pixels (anything but a finite number means no change)
 * @param {number} [max] the largest allowed size
 * @returns {number} whole pixels, at least 1
 */
export function relative_size(current, delta, max = 100000) {
	const change = isFinite(delta) ? delta : 0;
	return Math.min(max, Math.max(1, Math.round(current + change)));
}

/**
 * How far the layers move when the canvas changes its size
 *
 * @param {number} old_width
 * @param {number} old_height
 * @param {number} new_width
 * @param {number} new_height
 * @param {string} anchor
 * @returns {{x: number, y: number}} whole pixels (a growing canvas moves the content right / down)
 */
export function anchor_offset(old_width, old_height, new_width, new_height, anchor) {
	const share = anchor_shares(anchor);
	const dx = Math.round((new_width - old_width) * share.x);
	const dy = Math.round((new_height - old_height) * share.y);
	return {x: isFinite(dx) ? dx : 0, y: isFinite(dy) ? dy : 0};
}
