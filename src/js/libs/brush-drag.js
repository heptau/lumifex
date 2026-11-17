/**
 * Changing the size and the hardness of a brush by dragging on the canvas (Photoshop: Alt + right button on Windows,
 * Ctrl + Option on a Mac): left / right = size, up / down = hardness. Pure functions.
 */

/**
 * @param {{button: number, altKey: boolean, ctrlKey: boolean, metaKey?: boolean}} event
 * @returns {boolean} the press starts the size drag
 */
export function is_brush_drag_press(event) {
	if (!event || !event.altKey) {
		return false;
	}
	return event.button === 2 || (event.button === 0 && event.ctrlKey === true);
}

/**
 * @param {object} start {size, hardness (or null), min, max}
 * @param {number} dx screen pixels to the right
 * @param {number} dy screen pixels down
 * @param {number} zoom of the view (1 = 100 %)
 * @returns {{size: number, hardness: number|null}}
 */
export function drag_brush_values(start, dx, dy, zoom) {
	const scale = Number(zoom) > 0 ? Number(zoom) : 1;
	const min = Number.isFinite(start.min) ? start.min : 1;
	const max = Number.isFinite(start.max) ? start.max : 999;
	//the diameter follows the pointer on the screen: one screen pixel to the right = 2 / zoom picture pixels wider
	const size = Math.round(Math.min(max, Math.max(min, (Number(start.size) || 1) + 2 * (Number(dx) || 0) / scale)));
	let hardness = null;
	if (start.hardness !== null && start.hardness !== undefined && Number.isFinite(Number(start.hardness))) {
		//up = harder, down = softer, 2 screen pixels for one percent
		hardness = Math.round(Math.min(100, Math.max(0, Number(start.hardness) - (Number(dy) || 0) / 2)));
	}
	return {size, hardness};
}
