/**
 * Content-Aware Move (Photoshop): the part inside the shape is moved, the place it leaves is filled with the texture of
 * the surroundings (`patch_region`, colors adapted to the edge of the hole) and the moved part is blended in with a
 * soft edge. Pure functions over ImageData-like pictures.
 */
import { patch_region } from './patch.js';
import { feather_mask } from './selection-mask.js';

/**
 * @param {{x0: number, y0: number, x1: number, y1: number}} box the moved part (picture pixels, x1/y1 exclusive)
 * @param {number} dx the move
 * @param {number} dy
 * @param {number} width of the picture
 * @param {number} height
 * @returns {{dx: number, dy: number}} where a clean texture for the hole is taken from (relative to the hole)
 */
export function fill_source_offset(box, dx, dy, width, height) {
	const bw = box.x1 - box.x0;
	const bh = box.y1 - box.y0;
	const inside = (ox, oy) => box.x0 + ox >= 0 && box.y0 + oy >= 0 && box.x1 + ox <= width && box.y1 + oy <= height;
	const horizontal = Math.abs(dx) >= Math.abs(dy);
	const candidates = horizontal
		? [[-Math.sign(dx || 1) * (bw + 4), 0], [Math.sign(dx || 1) * (bw + 4) + dx, 0], [0, bh + 4], [0, -(bh + 4)]]
		: [[0, -Math.sign(dy || 1) * (bh + 4)], [0, Math.sign(dy || 1) * (bh + 4) + dy], [bw + 4, 0], [-(bw + 4), 0]];
	for (const [ox, oy] of candidates) {
		if (inside(ox, oy)) {
			return {dx: ox, dy: oy};
		}
	}
	//no clean place of the same size: the place the part goes to (it gets covered anyway)
	return {dx: Math.round(dx), dy: Math.round(dy)};
}

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image changed in place
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask the moved part (0-255), the size of the image
 * @param {number} dx
 * @param {number} dy
 * @param {object} [options] adapt (0-100, how the fill follows the colors around the hole), softness (edge, px)
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} the image
 */
export function content_aware_move(image, mask, dx, dy, options = {}) {
	const w = image.width;
	const h = image.height;
	dx = Math.round(Number(dx) || 0);
	dy = Math.round(Number(dy) || 0);
	let x0 = w, y0 = h, x1 = -1, y1 = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (mask.data[y * w + x] > 0) {
				x0 = Math.min(x0, x);
				y0 = Math.min(y0, y);
				x1 = Math.max(x1, x);
				y1 = Math.max(y1, y);
			}
		}
	}
	if (x1 < 0 || (dx === 0 && dy === 0)) {
		return image;
	}
	const original = new Uint8ClampedArray(image.data);

	//1. the hole is filled from a clean place next to it
	const source = fill_source_offset({x0, y0, x1: x1 + 1, y1: y1 + 1}, dx, dy, w, h);
	const adapt = Number.isFinite(Number(options.adapt)) ? Number(options.adapt) : 100;
	patch_region(image, mask, source.dx, source.dy, {adapt});

	//2. the part is put on its new place with a soft edge
	const softness = Math.max(0, Math.min(20, Number(options.softness ?? 2) || 0));
	const soft = softness > 0 ? feather_mask(mask, softness) : mask;
	for (let y = y0 - softness - 1; y <= y1 + softness + 1; y++) {
		for (let x = x0 - softness - 1; x <= x1 + softness + 1; x++) {
			if (x < 0 || y < 0 || x >= w || y >= h) {
				continue;
			}
			const a = Math.min(soft.data[y * w + x], mask.data[y * w + x] > 0 ? 255 : soft.data[y * w + x]) / 255;
			if (a <= 0) {
				continue;
			}
			const tx = x + dx;
			const ty = y + dy;
			if (tx < 0 || ty < 0 || tx >= w || ty >= h) {
				continue;
			}
			const from = (y * w + x) * 4;
			const to = (ty * w + tx) * 4;
			for (let c = 0; c < 4; c++) {
				image.data[to + c] = image.data[to + c] + (original[from + c] - image.data[to + c]) * a;
			}
		}
	}
	return image;
}
