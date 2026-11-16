/**
 * The places where a brush-like tool stamps while the pointer travels from one position to the next, so a fast
 * stroke leaves no gaps. Pure functions, no DOM.
 */

/**
 * @param {{x: number, y: number}|null} from the last place that was stamped (null: there is none yet)
 * @param {{x: number, y: number}} to where the pointer is now
 * @param {number} spacing the largest distance between two stamps (at least 1)
 * @returns {{x: number, y: number}[]} the places after `from` up to and including `to`, evenly spread; just `to` when
 *  there is no `from` or the numbers are not usable
 */
export function stroke_steps(from, to, spacing) {
	if (!to || !isFinite(to.x) || !isFinite(to.y)) {
		return [];
	}
	if (!from || !isFinite(from.x) || !isFinite(from.y)) {
		return [{x: to.x, y: to.y}];
	}
	const gap = Math.max(1, Number(spacing) || 1);
	const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / gap));
	const places = [];
	for (let s = 1; s <= steps; s++) {
		places.push({x: from.x + (to.x - from.x) * s / steps, y: from.y + (to.y - from.y) * s / steps});
	}
	return places;
}
