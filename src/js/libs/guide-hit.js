/**
 * Finding a guide under the pointer (the Move tool drags existing guides, as in Photoshop). Pure functions, no DOM.
 */

/**
 * @param {{x: number|null, y: number|null}[]} guides vertical guides have `x` and `y === null`, horizontal ones the opposite
 * @param {number} x pointer in document coordinates
 * @param {number} y pointer in document coordinates
 * @param {number} tolerance the largest distance in document pixels (callers pass a few screen pixels / zoom)
 * @returns {number} the index of the nearest guide within the tolerance, -1 when none (a tie goes to the later one,
 *  which is drawn on top)
 */
export function find_guide(guides, x, y, tolerance) {
	let best = -1;
	let best_distance = Infinity;
	if (!Array.isArray(guides) || !isFinite(tolerance) || tolerance < 0) {
		return -1;
	}
	for (let i = 0; i < guides.length; i++) {
		const guide = guides[i];
		if (!guide) {
			continue;
		}
		const vertical = guide.y === null && typeof guide.x == 'number';
		const horizontal = guide.x === null && typeof guide.y == 'number';
		if (!vertical && !horizontal) {
			continue;
		}
		const distance = Math.abs(vertical ? x - guide.x : y - guide.y);
		if (distance <= tolerance && distance <= best_distance) {
			best = i;
			best_distance = distance;
		}
	}
	return best;
}
