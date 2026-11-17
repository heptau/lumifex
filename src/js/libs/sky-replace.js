/**
 * Edit > Sky Replacement (Photoshop) - pure functions over ImageData-like objects ({data, width, height}, RGBA) and
 * masks ({data, width, height}, one byte per pixel, 255 = sky), no DOM.
 */
import { select_sky_mask, morph_mask, feather_mask } from './selection-mask.js';

/** Built-in skies: vertical gradients from the top to the horizon (no download, privacy first) */
export const SKY_PRESETS = {
	'Blue Sky': [[38, 104, 196], [148, 196, 236]],
	'Sunset': [[52, 62, 128], [250, 150, 80]],
	'Dusk': [[20, 24, 64], [190, 100, 120]],
	'Overcast': [[150, 158, 168], [214, 218, 222]],
};

/**
 * A gradient sky of the given size
 *
 * @param {number} width
 * @param {number} height
 * @param {string} preset a key of SKY_PRESETS (unknown = Blue Sky)
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function gradient_sky(width, height, preset) {
	const colors = SKY_PRESETS[preset] || SKY_PRESETS['Blue Sky'];
	const [top, bottom] = colors;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		//a little faster toward the horizon, as a real sky lightens there
		const t = height > 1 ? Math.pow(y / (height - 1), 0.8) : 0;
		const r = top[0] + (bottom[0] - top[0]) * t;
		const g = top[1] + (bottom[1] - top[1]) * t;
		const b = top[2] + (bottom[2] - top[2]) * t;
		for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	}
	return {data, width, height};
}

/**
 * Where a sky picture is drawn: it covers the whole width of the document, its top on the top of the document,
 * enlarged by `scale` % around the top center and moved down by `offset` % of the document height
 *
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function fit_sky_rect(source_width, source_height, width, height, scale = 100, offset = 0) {
	const factor = Math.max(width / Math.max(1, source_width), height / Math.max(1, source_height))
		* Math.max(10, Math.min(400, Number(scale) || 100)) / 100;
	const w = source_width * factor;
	const h = source_height * factor;
	return {
		x: Math.round((width - w) / 2),
		y: Math.round(Math.max(-100, Math.min(100, Number(offset) || 0)) / 100 * height),
		width: Math.round(w),
		height: Math.round(h),
	};
}

/**
 * The sky of a photo as a soft mask: Select Sky, then Shift Edge (grow / shrink in pixels) and Fade Edge (feather)
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{tolerance?: number, shift?: number, fade?: number}} options
 */
export function sky_mask(image, options = {}) {
	let mask = select_sky_mask(image, options.tolerance == undefined ? 30 : options.tolerance);
	const shift = Math.round(Number(options.shift) || 0);
	if (shift != 0) {
		mask = morph_mask(mask, shift);
	}
	const fade = Math.round(Number(options.fade) || 0);
	if (fade > 0) {
		mask = feather_mask(mask, fade);
	}
	return mask;
}

/**
 * The mean color of the sky picture where the mask is (the color that lights the foreground)
 *
 * @returns {number[]} [r, g, b]
 */
export function mean_sky_color(sky, mask) {
	let r = 0;
	let g = 0;
	let b = 0;
	let total = 0;
	const length = Math.min(mask.data.length, sky.data.length / 4);
	for (let p = 0, i = 0; p < length; p++, i += 4) {
		const weight = mask.data[p] * sky.data[i + 3];
		if (weight > 0) {
			r += sky.data[i] * weight;
			g += sky.data[i + 1] * weight;
			b += sky.data[i + 2] * weight;
			total += weight;
		}
	}
	if (total == 0) {
		return [128, 128, 128];
	}
	return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
}

function soft_light(b, s) {
	b /= 255;
	s /= 255;
	let result;
	if (s <= 0.5) {
		result = b - (1 - 2 * s) * b * (1 - b);
	}
	else {
		const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
		result = b + (2 * s - 1) * (d - b);
	}
	return result * 255;
}

/**
 * The finished picture (for the preview): the sky through the mask over the photo; the rest of the photo gets the
 * color of the sky in the Soft Light mode by `lighting` % - the same as the layers the command makes
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image the photo, changed in place
 * @param {{data: Uint8ClampedArray, width: number, height: number}} sky of the same size
 * @param {{data: Uint8ClampedArray}} mask
 * @param {number} lighting 0-100
 * @param {number[]} color [r, g, b] of the lighting
 */
export function compose_sky(image, sky, mask, lighting, color) {
	const light = Math.max(0, Math.min(100, Number(lighting) || 0)) / 100;
	const d = image.data;
	const s = sky.data;
	for (let p = 0, i = 0; i < d.length; p++, i += 4) {
		const m = mask.data[p] / 255;
		for (let c = 0; c < 3; c++) {
			let value = d[i + c];
			if (light > 0 && m < 1) {
				value += (soft_light(value, color[c]) - value) * light * (1 - m);
			}
			const sky_alpha = m * s[i + 3] / 255;
			d[i + c] = Math.round(value + (s[i + c] - value) * sky_alpha);
		}
	}
	return image;
}
