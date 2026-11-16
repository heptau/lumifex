/**
 * The pixels the Paint Bucket would fill: the ones whose color is close to the clicked one, either only the area that is
 * connected with it (Contiguous) or everywhere in the picture. Pure functions, no DOM.
 */

/**
 * @param {Uint8ClampedArray|number[]} data RGBA
 * @param {number} width
 * @param {number} height
 * @param {number} x the clicked pixel (whole numbers, a click outside gives an empty result)
 * @param {number} y
 * @param {number} tolerance 0-100 (%): how far every channel (alpha too) may be from the clicked color, as a share of 255
 * @param {boolean} contiguous only the pixels connected (up, down, left, right) with the clicked one
 * @returns {Uint8Array} width * height, 1 for a pixel that is to be filled
 */
export function fill_region(data, width, height, x, y, tolerance, contiguous) {
	const mask = new Uint8Array(width * height);
	x = Math.round(x);
	y = Math.round(y);
	if (!(x >= 0 && y >= 0 && x < width && y < height)) {
		return mask;
	}
	const limit = Math.min(100, Math.max(0, Number(tolerance) || 0)) * 255 / 100;
	const start = (y * width + x) * 4;
	const r = data[start], g = data[start + 1], b = data[start + 2], a = data[start + 3];
	const similar = (i) => Math.abs(data[i] - r) <= limit && Math.abs(data[i + 1] - g) <= limit
		&& Math.abs(data[i + 2] - b) <= limit && Math.abs(data[i + 3] - a) <= limit;

	if (!contiguous) {
		for (let p = 0; p < width * height; p++) {
			if (similar(p * 4)) {
				mask[p] = 1;
			}
		}
		return mask;
	}
	const stack = [y * width + x];
	mask[stack[0]] = 1;
	while (stack.length > 0) {
		const p = stack.pop();
		const px = p % width;
		const py = (p - px) / width;
		const neighbors = [];
		if (px > 0) { neighbors.push(p - 1); }
		if (px < width - 1) { neighbors.push(p + 1); }
		if (py > 0) { neighbors.push(p - width); }
		if (py < height - 1) { neighbors.push(p + width); }
		for (const q of neighbors) {
			if (mask[q] == 0 && similar(q * 4)) {
				mask[q] = 1;
				stack.push(q);
			}
		}
	}
	return mask;
}
