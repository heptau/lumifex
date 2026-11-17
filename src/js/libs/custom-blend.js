/**
 * Blend modes of Photoshop that the canvas can not do (`globalCompositeOperation` has no Linear Burn, Vivid Light…).
 * The layer and the picture below it are blended here pixel by pixel. Pure functions over ImageData-like objects
 * ({data, width, height}, RGBA not premultiplied, as getImageData gives them), no DOM.
 *
 * The result is composed like the canvas composes its own blend modes (W3C Compositing, source-over):
 *   Cs' = (1 - ab) · Cs + ab · B(Cb, Cs)
 *   co  = as · Cs' + (1 - as) · ab · Cb,  ao = as + ab · (1 - as),  C = co / ao
 * so a layer over a transparent place keeps its own color and a half transparent layer mixes with what is below.
 */

/** The ids of the modes as the layers keep them in `composition` (they never collide with a canvas operation) */
export const CUSTOM_BLEND = {
	dissolve: 'lf-dissolve',
	linear_burn: 'lf-linear-burn',
	darker_color: 'lf-darker-color',
	lighter_color: 'lf-lighter-color',
	vivid_light: 'lf-vivid-light',
	linear_light: 'lf-linear-light',
	pin_light: 'lf-pin-light',
	hard_mix: 'lf-hard-mix',
	subtract: 'lf-subtract',
	divide: 'lf-divide',
};

const CUSTOM_IDS = Object.values(CUSTOM_BLEND);

/**
 * @param {*} mode `composition` of a layer or a group
 * @returns {boolean} the mode is blended here, not by the canvas
 */
export function is_custom_blend(mode) {
	return typeof mode === 'string' && CUSTOM_IDS.indexOf(mode) >= 0;
}

/**
 * The composite operation to give the canvas: a custom mode would be ignored silently by the canvas (it keeps the
 * previous operation), so it becomes Normal where the custom path is not used
 *
 * @param {*} mode
 * @returns {string}
 */
export function canvas_operation(mode) {
	if (typeof mode !== 'string' || mode === '' || is_custom_blend(mode)) {
		return 'source-over';
	}
	return mode;
}

/**
 * One channel of a separable mode, 0-255 integers
 *
 * @param {string} mode
 * @param {number} b backdrop
 * @param {number} s source (the layer)
 * @returns {number} 0-255
 */
export function blend_channel(mode, b, s) {
	switch (mode) {
		case CUSTOM_BLEND.linear_burn:
			return Math.max(0, b + s - 255);
		case CUSTOM_BLEND.vivid_light:
			if (s <= 127.5) {
				//Color Burn with 2s
				if (b >= 255) {
					return 255;
				}
				if (s <= 0) {
					return 0;
				}
				return Math.max(0, 255 - (255 - b) * 255 / (2 * s));
			}
			//Color Dodge with 2s - 1
			if (b <= 0) {
				return 0;
			}
			if (s >= 255) {
				return 255;
			}
			return Math.min(255, b * 255 / (2 * (255 - s)));
		case CUSTOM_BLEND.linear_light:
			return Math.min(255, Math.max(0, b + 2 * s - 255));
		case CUSTOM_BLEND.pin_light:
			return s <= 127.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 255);
		case CUSTOM_BLEND.hard_mix:
			return b + s >= 255 ? 255 : 0;
		case CUSTOM_BLEND.subtract:
			return Math.max(0, b - s);
		case CUSTOM_BLEND.divide:
			if (s <= 0) {
				return b <= 0 ? 0 : 255;
			}
			return Math.min(255, b * 255 / s);
		default:
			return s;
	}
}

const lut_cache = new Map();

/**
 * @param {string} mode separable mode
 * @returns {Uint8ClampedArray} 256 × 256, index = backdrop · 256 + source
 */
function channel_table(mode) {
	let table = lut_cache.get(mode);
	if (!table) {
		table = new Uint8ClampedArray(65536);
		for (let b = 0; b < 256; b++) {
			for (let s = 0; s < 256; s++) {
				table[b * 256 + s] = Math.round(blend_channel(mode, b, s));
			}
		}
		lut_cache.set(mode, table);
	}
	return table;
}

/**
 * A number 0-254 that is the same for the same pixel every time (Dissolve must not flicker when the picture is drawn
 * again)
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function dissolve_noise(x, y) {
	let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) % 255;
}

/**
 * Brightness as the W3C non-separable modes use it, 0-255
 */
function lum(r, g, b) {
	return 0.3 * r + 0.59 * g + 0.11 * b;
}

/**
 * Blends a layer over the picture below it with a custom mode; the result is written into `backdrop`.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} backdrop the picture below, changed in place
 * @param {{data: Uint8ClampedArray, width: number, height: number}} source the layer drawn alone (its opacity and fill
 *   already in its alpha) at the same size
 * @param {string} mode one of CUSTOM_BLEND
 * @param {number} [opacity] 0-1, multiplies the alpha of the source (the opacity of a group)
 * @param {number} [offset_x] position of the first pixel in the document (Dissolve)
 * @param {number} [offset_y]
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} backdrop
 */
export function blend_custom(backdrop, source, mode, opacity, offset_x, offset_y) {
	const width = Math.min(backdrop.width, source.width);
	const height = Math.min(backdrop.height, source.height);
	const out = backdrop.data;
	const src = source.data;
	let strength = Number(opacity);
	if (!isFinite(strength)) {
		strength = 1;
	}
	strength = Math.min(1, Math.max(0, strength));
	const ox = Math.round(Number(offset_x) || 0);
	const oy = Math.round(Number(offset_y) || 0);
	const known = is_custom_blend(mode);
	const separable = known && mode !== CUSTOM_BLEND.dissolve && mode !== CUSTOM_BLEND.darker_color && mode !== CUSTOM_BLEND.lighter_color;
	const table = separable ? channel_table(mode) : null;

	for (let y = 0; y < height; y++) {
		let i = y * backdrop.width * 4;
		let j = y * source.width * 4;
		for (let x = 0; x < width; x++, i += 4, j += 4) {
			let as = src[j + 3] * strength / 255;
			if (as <= 0) {
				continue;
			}
			const sr = src[j];
			const sg = src[j + 1];
			const sb = src[j + 2];
			const ab = out[i + 3] / 255;
			const br = out[i];
			const bg = out[i + 1];
			const bb = out[i + 2];

			//the blended color B(Cb, Cs)
			let mr = sr;
			let mg = sg;
			let mb = sb;
			if (mode === CUSTOM_BLEND.dissolve) {
				//a pixel is either fully there or not at all; the alpha is the chance it is there
				as = dissolve_noise(x + ox, y + oy) < Math.round(as * 255) ? 1 : 0;
				if (as === 0) {
					continue;
				}
			}
			else if (mode === CUSTOM_BLEND.darker_color || mode === CUSTOM_BLEND.lighter_color) {
				const darker = lum(sr, sg, sb) < lum(br, bg, bb);
				const take_source = mode === CUSTOM_BLEND.darker_color ? darker : lum(sr, sg, sb) > lum(br, bg, bb);
				if (!take_source) {
					mr = br;
					mg = bg;
					mb = bb;
				}
			}
			else if (table) {
				mr = table[br * 256 + sr];
				mg = table[bg * 256 + sg];
				mb = table[bb * 256 + sb];
			}

			//where the backdrop is transparent the layer keeps its own color
			const cr = (1 - ab) * sr + ab * mr;
			const cg = (1 - ab) * sg + ab * mg;
			const cb = (1 - ab) * sb + ab * mb;
			const below = (1 - as) * ab;
			const ao = as + below;
			out[i] = (as * cr + below * br) / ao;
			out[i + 1] = (as * cg + below * bg) / ao;
			out[i + 2] = (as * cb + below * bb) / ao;
			out[i + 3] = ao * 255;
		}
	}
	return backdrop;
}
