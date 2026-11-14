/**
 * Brush hardness (Photoshop): 100 % = a sharp edge, lower values give a soft round brush. The edge is softened by
 * blurring the drawn strokes, so it works for the plain line, the custom tip and the dynamics alike.
 * Pure functions, no DOM.
 */

/** Largest share of the brush size used as the blur radius (hardness 0 %) */
const SOFT_RATIO = 0.4;

/**
 * @param {number|string|null|undefined} value hardness in %, anything invalid means 100
 * @returns {number} 0-100
 */
export function clean_hardness(value) {
	const number = typeof value == 'number' ? value : parseFloat(String(value));
	if (!isFinite(number)) {
		return 100;
	}
	return Math.max(0, Math.min(100, number));
}

/**
 * @param {number} size brush size in pixels
 * @param {number|string|null|undefined} hardness in %
 * @returns {number} blur radius in pixels (0 = a sharp brush)
 */
export function soft_blur_radius(size, hardness) {
	const width = Number(size);
	if (!isFinite(width) || width <= 0) {
		return 0;
	}
	return width * SOFT_RATIO * (100 - clean_hardness(hardness)) / 100;
}
