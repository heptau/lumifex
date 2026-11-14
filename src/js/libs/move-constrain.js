/**
 * Shift while dragging with the Move tool keeps the move on one axis (Photoshop): the longer of the two distances wins.
 * Pure function, no DOM.
 *
 * @param {number} dx
 * @param {number} dy
 * @param {boolean} constrain Shift is held
 * @returns {{x: number, y: number}} the distances to use
 */
export function constrain_axis(dx, dy, constrain) {
	if (constrain !== true) {
		return {x: dx, y: dy};
	}
	return Math.abs(dx) >= Math.abs(dy) ? {x: dx, y: 0} : {x: 0, y: dy};
}
