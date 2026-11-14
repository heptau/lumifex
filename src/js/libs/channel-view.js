/**
 * The Channels panel (Photoshop): which color channels of the picture are shown. Only the view changes - a color matrix
 * on the canvas - the image and the exports stay as they are. Pure functions, no DOM.
 *
 * @typedef {'red'|'green'|'blue'} Color_channel
 * @typedef {{hidden: Color_channel[], solo: Color_channel|'alpha'|null}} Channel_view
 */

export const COLOR_CHANNELS = ['red', 'green', 'blue'];
export const ALL_CHANNELS = ['red', 'green', 'blue', 'alpha'];

/** @returns {Channel_view} everything is shown */
export function default_view() {
	return {hidden: [], solo: null};
}

/**
 * @param {Channel_view} view
 * @returns {boolean} the picture is shown as it is
 */
export function is_default_view(view) {
	return !view || (view.solo == null && (!view.hidden || view.hidden.length == 0));
}

/**
 * Hides a color channel or shows it again (the eye of its row). A single channel view is left.
 *
 * @param {Channel_view} view
 * @param {string} channel
 * @returns {Channel_view} a new state; the same one for an unknown channel
 */
export function toggle_channel(view, channel) {
	if (!COLOR_CHANNELS.includes(channel)) {
		return view;
	}
	const hidden = view.solo == null ? view.hidden.slice() : [];
	const at = hidden.indexOf(/** @type {Color_channel} */ (channel));
	if (at >= 0) {
		hidden.splice(at, 1);
	}
	else {
		hidden.push(/** @type {Color_channel} */ (channel));
	}
	return {hidden, solo: null};
}

/**
 * Shows a single channel as a grayscale picture (a click on the row); null or "rgb" shows everything again
 *
 * @param {Channel_view} view
 * @param {string|null} channel
 * @returns {Channel_view}
 */
export function solo_channel(view, channel) {
	if (channel == null || !ALL_CHANNELS.includes(channel)) {
		return default_view();
	}
	return {hidden: [], solo: /** @type {Color_channel|'alpha'} */ (channel)};
}

/**
 * @param {Channel_view} view
 * @returns {number[]|null} the 4x5 color matrix (20 numbers, row-major) of an SVG feColorMatrix, null for the default view
 */
export function view_matrix(view) {
	if (is_default_view(view)) {
		return null;
	}
	if (view.solo != null) {
		if (view.solo == 'alpha') {
			//the transparency becomes the brightness, the picture is opaque
			return [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
		}
		const row = [0, 0, 0, 0, 0];
		row[COLOR_CHANNELS.indexOf(view.solo)] = 1;
		return row.concat(row, row, [0, 0, 0, 1, 0]);
	}
	const shown = (channel) => (view.hidden.includes(channel) ? 0 : 1);
	return [
		shown('red'), 0, 0, 0, 0,
		0, shown('green'), 0, 0, 0,
		0, 0, shown('blue'), 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Joins CSS filter values (url(#...), ...) of the different parts of the view
 *
 * @param {(string|null|undefined)[]} parts
 * @returns {string} '' when there is none
 */
export function compose_filter(parts) {
	return parts.filter((part) => typeof part == 'string' && part != '').join(' ');
}
