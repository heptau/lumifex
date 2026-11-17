/**
 * Select and Mask (Photoshop): how the refined selection is shown, and Decontaminate Colors. Pure functions over
 * ImageData-like pictures and masks of the same size.
 */

export const VIEW_MODES = ['Overlay', 'On Black', 'On White', 'Black & White', 'Marching Ants'];
export const OUTPUTS = ['Selection', 'Layer Mask', 'New Layer', 'New Layer with Layer Mask'];

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image the visible picture
 * @param {{data: Uint8ClampedArray}} mask
 * @param {string} view one of VIEW_MODES (Marching Ants has no picture of its own: null)
 * @returns {Uint8ClampedArray|null} RGBA covering the document
 */
export function mask_view_rgba(image, mask, view) {
	if (!VIEW_MODES.includes(view) || view === 'Marching Ants') {
		return null;
	}
	const out = new Uint8ClampedArray(image.data.length);
	for (let p = 0, i = 0; p < mask.data.length; p++, i += 4) {
		const a = mask.data[p] / 255;
		if (view === 'Black & White') {
			out[i] = out[i + 1] = out[i + 2] = mask.data[p];
			out[i + 3] = 255;
			continue;
		}
		const pa = image.data[i + 3] / 255 * a;
		let background;
		if (view === 'Overlay') {
			//the picture with red over the parts that are not selected
			const red = (1 - a) * 0.5;
			out[i] = image.data[i] * (1 - red) + 255 * red;
			out[i + 1] = image.data[i + 1] * (1 - red);
			out[i + 2] = image.data[i + 2] * (1 - red);
			out[i + 3] = Math.max(image.data[i + 3], Math.round(red * 255));
			continue;
		}
		if (view === 'On Black') {
			background = 0;
		}
		else {
			background = 255;
		}
		const cover = pa;
		out[i] = image.data[i] * cover + background * (1 - cover);
		out[i + 1] = image.data[i + 1] * cover + background * (1 - cover);
		out[i + 2] = image.data[i + 2] * cover + background * (1 - cover);
		out[i + 3] = 255;
	}
	return out;
}

/**
 * Decontaminate Colors: the half selected pixels of the edge take the colors of the fully selected pixels nearby, so the
 * old background does not shine through when the object is put on another one.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image changed in place
 * @param {{data: Uint8ClampedArray}} mask
 * @param {number} amount 0-100 %
 * @param {number} [radius] how far the inner colors are looked for, default 8 px
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} the image
 */
export function decontaminate(image, mask, amount, radius = 8) {
	const strength = Math.min(100, Math.max(0, Number(amount) || 0)) / 100;
	if (strength === 0) {
		return image;
	}
	const w = image.width;
	const h = image.height;
	const r = Math.max(1, Math.min(50, Math.round(radius) || 8));
	//sums of the colors of the inner pixels (mask >= 250) in a box, from summed area tables
	const stride = w + 1;
	const sum = [new Float64Array(stride * (h + 1)), new Float64Array(stride * (h + 1)), new Float64Array(stride * (h + 1)), new Float64Array(stride * (h + 1))];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = y * w + x;
			const inner = mask.data[p] >= 250 && image.data[p * 4 + 3] > 0 ? 1 : 0;
			const q = (y + 1) * stride + x + 1;
			for (let c = 0; c < 3; c++) {
				sum[c][q] = image.data[p * 4 + c] * inner + sum[c][q - 1] + sum[c][q - stride] - sum[c][q - stride - 1];
			}
			sum[3][q] = inner + sum[3][q - 1] + sum[3][q - stride] - sum[3][q - stride - 1];
		}
	}
	const box = (table, x0, y0, x1, y1) => table[y1 * stride + x1] - table[y0 * stride + x1] - table[y1 * stride + x0] + table[y0 * stride + x0];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = y * w + x;
			const m = mask.data[p];
			if (m === 0 || m >= 250) {
				continue;
			}
			const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
			const count = box(sum[3], x0, y0, x1, y1);
			if (count < 1) {
				continue;
			}
			//the less the pixel is selected, the more of the background it contains
			const t = strength * (1 - m / 255);
			for (let c = 0; c < 3; c++) {
				const inner = box(sum[c], x0, y0, x1, y1) / count;
				image.data[p * 4 + c] = image.data[p * 4 + c] + (inner - image.data[p * 4 + c]) * t;
			}
		}
	}
	return image;
}
