/**
 * Perspective Crop (Photoshop): four corners are put around something that is photographed at an angle (a page, a
 * screen, a sign) and the area between them becomes a straight rectangle. Pure functions, no DOM.
 *
 * @typedef {{data: Uint8ClampedArray, width: number, height: number}} Image_data
 * @typedef {number[][]} Quad four corners [x, y]: top left, top right, bottom right, bottom left
 */
import { solve_homography, is_valid_quad } from './perspective.js';

/** The longest side of the result */
export const MAX_CROP_SIDE = 8192;

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/**
 * The size the straightened picture gets: the mean of the lengths of the two opposite sides
 *
 * @param {Quad} quad
 * @returns {{width: number, height: number}} whole pixels, at least 1, at most MAX_CROP_SIDE
 */
export function crop_size(quad) {
	const length = (a, b) => Math.hypot(quad[b][0] - quad[a][0], quad[b][1] - quad[a][1]);
	const width = (length(0, 1) + length(3, 2)) / 2;
	const height = (length(0, 3) + length(1, 2)) / 2;
	const limit = (value) => clamp(Math.round(isFinite(value) ? value : 1), 1, MAX_CROP_SIDE);
	return {width: limit(width), height: limit(height)};
}

/**
 * The area between the corners as a straight rectangle (bilinear sampling, the premultiplied alpha is respected)
 *
 * @param {Image_data} image
 * @param {Quad} quad the corners in pixels of the picture (they may lie outside it: that part is transparent)
 * @param {{width: number, height: number}} [size] the size of the result, by default `crop_size(quad)`
 * @returns {Image_data|null} null when the corners do not make a proper shape
 */
export function rectify_quad(image, quad, size) {
	if (!Array.isArray(quad) || quad.length != 4 || !is_valid_quad(quad)) {
		return null;
	}
	const out_size = size || crop_size(quad);
	const w = Math.max(1, Math.min(MAX_CROP_SIDE, Math.round(out_size.width)));
	const h = Math.max(1, Math.min(MAX_CROP_SIDE, Math.round(out_size.height)));
	//from the rectangle of the result to the corners of the shape in the picture
	const H = solve_homography([[0, 0], [w, 0], [w, h], [0, h]], quad);
	if (H == null) {
		return null;
	}
	const src = image.data;
	const sw = image.width;
	const sh = image.height;
	const out = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const px = x + 0.5;
			const py = y + 0.5;
			const d = H[6] * px + H[7] * py + 1;
			if (Math.abs(d) < 1e-12) {
				continue;
			}
			const u = (H[0] * px + H[1] * py + H[2]) / d;
			const v = (H[3] * px + H[4] * py + H[5]) / d;
			if (u < 0 || v < 0 || u > sw || v > sh) {
				continue;
			}
			const fx = clamp(u - 0.5, 0, sw - 1);
			const fy = clamp(v - 0.5, 0, sh - 1);
			const x0 = Math.floor(fx), y0 = Math.floor(fy);
			const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
			const tx = fx - x0, ty = fy - y0;
			const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
			const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
			const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
			if (a <= 0) {
				continue;
			}
			const o = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				out[o + c] = (src[i00 + c] * src[i00 + 3] * w00 + src[i10 + c] * src[i10 + 3] * w10
					+ src[i01 + c] * src[i01 + 3] * w01 + src[i11 + c] * src[i11 + 3] * w11) / a;
			}
			out[o + 3] = a;
		}
	}
	return {data: out, width: w, height: h};
}

/**
 * The starting corners: a rectangle inset from the edges of the picture
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [inset] share of the size left free on every side
 * @returns {Quad}
 */
export function start_quad(width, height, inset = 0.1) {
	const dx = Math.round(width * inset);
	const dy = Math.round(height * inset);
	return [[dx, dy], [width - dx, dy], [width - dx, height - dy], [dx, height - dy]];
}
