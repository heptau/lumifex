/**
 * Color Replacement (Photoshop) - paints a color over the picture but keeps its light and shade: the hue and
 * saturation of the new color are combined with the brightness of the pixel (the "Color" blend mode of the
 * W3C compositing spec). Pure functions on {data, width, height}, no DOM.
 */

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

/**
 * Moves a color along the gray axis until it has the wanted luminosity, then pulls it back into the 0-255 cube
 * without changing its hue (the spec's SetLum + ClipColor)
 *
 * @param {number[]} color [r, g, b]
 * @param {number} target the luminosity 0-255
 * @returns {number[]}
 */
function set_lum(color, target) {
	const d = target - lum(color[0], color[1], color[2]);
	let r = color[0] + d;
	let g = color[1] + d;
	let b = color[2] + d;
	const l = lum(r, g, b);
	const n = Math.min(r, g, b);
	const x = Math.max(r, g, b);
	if (n < 0) {
		r = l + (r - l) * l / (l - n);
		g = l + (g - l) * l / (l - n);
		b = l + (b - l) * l / (l - n);
	}
	if (x > 255) {
		r = l + (r - l) * (255 - l) / (x - l);
		g = l + (g - l) * (255 - l) / (x - l);
		b = l + (b - l) * (255 - l) / (x - l);
	}
	return [r, g, b];
}

/**
 * The result of the Color blend: hue and saturation of `paint`, luminosity of `base`
 *
 * @param {number[]} base [r, g, b] the pixel
 * @param {number[]} paint [r, g, b] the new color
 * @returns {number[]} [r, g, b] rounded to 0-255
 */
export function color_blend(base, paint) {
	//SetSat(paint, Sat(paint)) is paint itself, so only the luminosity has to be taken over from the base
	const result = set_lum(paint, lum(base[0], base[1], base[2]));
	return result.map((v) => Math.min(255, Math.max(0, Math.round(v))));
}

/**
 * @param {string} value #rrggbb
 * @returns {number[]|null} [r, g, b], null for anything else
 */
export function parse_paint_color(value) {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(typeof value == 'string' ? value : '');
	return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/**
 * One dab of the brush: the pixels within the radius are mixed with their recolored versions, the weight falling
 * from 1 inside the hardness to 0 at the edge. Pixels that are fully transparent and the alpha channel are not touched.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {number} cx dab center in pixels of the image
 * @param {number} cy
 * @param {number} radius
 * @param {number} hardness 0-100
 * @param {number} opacity 0-100
 * @param {number[]} paint [r, g, b]
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function recolor_dab(image, cx, cy, radius, hardness, opacity, paint) {
	if (!(radius > 0) || !Array.isArray(paint)) {
		return image;
	}
	const inner = Math.min(100, Math.max(0, Number(hardness) || 0)) / 100;
	const strength = Math.min(100, Math.max(0, Number(opacity) || 0)) / 100;
	const w = image.width;
	const h = image.height;
	const x0 = Math.max(0, Math.floor(cx - radius));
	const x1 = Math.min(w - 1, Math.ceil(cx + radius));
	const y0 = Math.max(0, Math.floor(cy - radius));
	const y1 = Math.min(h - 1, Math.ceil(cy + radius));
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
			if (distance >= 1) {
				continue;
			}
			const fall = distance <= inner ? 1 : (1 - distance) / (1 - inner);
			const weight = fall * strength;
			const i = (y * w + x) * 4;
			if (weight <= 0 || image.data[i + 3] == 0) {
				continue;
			}
			const blended = color_blend([image.data[i], image.data[i + 1], image.data[i + 2]], paint);
			for (let c = 0; c < 3; c++) {
				image.data[i + c] = Math.round(image.data[i + c] * (1 - weight) + blended[c] * weight);
			}
		}
	}
	return image;
}
