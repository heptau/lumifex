/**
 * Photoshop-like neighborhood filters working on ImageData-like objects ({data, width, height}).
 * Alpha channel is preserved. Data is modified in place and the same object is returned.
 *
 * @typedef {{data: Uint8ClampedArray, width: number, height: number}} Image_data
 */

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/**
 * Diffuse (Photoshop, Stylize) - every pixel is replaced by a pixel from a random place nearby, like frosted glass.
 * The randomness comes from a hash of the position and the seed, so the same input always gives the same result
 * (the dialog preview and the final result match).
 *
 * @param {Image_data} image
 * @param {object} params amount (0-100 pixels, how far a pixel can come from), seed (any integer)
 * @returns {Image_data}
 */
export function diffuse(image, params) {
	const amount = clamp(Math.round(parseFloat(params.amount) || 0), 0, 100);
	if (amount == 0) {
		return image;
	}
	const seed = parseInt(params.seed) || 0;
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const span = amount * 2 + 1;
	const hash = (x, y, salt) => {
		let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed + salt, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const sx = clamp(x + Math.floor(hash(x, y, 1) * span) - amount, 0, w - 1);
			const sy = clamp(y + Math.floor(hash(x, y, 2) * span) - amount, 0, h - 1);
			const i = (y * w + x) * 4;
			const j = (sy * w + sx) * 4;
			data[i] = src[j];
			data[i + 1] = src[j + 1];
			data[i + 2] = src[j + 2];
			data[i + 3] = src[j + 3];
		}
	}
	return image;
}

/**
 * Glowing Edges (Photoshop, simplified) - the edges of every color channel glow on a black background: the Sobel
 * gradient of each channel, multiplied by the brightness. Edges repeat the border pixels. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params brightness (0-100, default 20; 20 = the gradient as it is), threshold (0-255, gradients
 *  below it are dropped, default 0)
 * @returns {Image_data}
 */
export function glowingEdges(image, params) {
	const gain = clamp(parseFloat(params.brightness ?? 20) || 0, 0, 100) / 20;
	const threshold = clamp(parseFloat(params.threshold) || 0, 0, 255);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const at = (x, y, c) => src[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4 + c];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
				const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
				//the Sobel sum of a unit step is 4, so divide by 4 to get the size of the step itself
				const magnitude = Math.sqrt(gx * gx + gy * gy) / 4;
				data[i + c] = magnitude < threshold ? 0 : clamp(Math.round(magnitude * gain), 0, 255);
			}
		}
	}
	return image;
}

/**
 * Mezzotint (Photoshop, simplified) - random threshold dither: every pixel becomes black or white (per channel
 * in Color mode, by brightness in Black and White mode), the chance of white follows the original value, so the
 * average tone is kept. Deterministic by the seed and the position. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params mode ('Color' | 'Black and White'), seed
 * @returns {Image_data}
 */
export function mezzotint(image, params) {
	const mono = params.mode == 'Black and White';
	const seed = parseInt(params.seed) || 0;
	const w = image.width;
	const data = image.data;
	const hash = (x, y, salt) => {
		let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed + salt, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	for (let p = 0, i = 0; p < data.length / 4; p++, i += 4) {
		const x = p % w;
		const y = Math.floor(p / w);
		if (mono) {
			const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
			const v = luma > hash(x, y, 0) * 255 ? 255 : 0;
			data[i] = data[i + 1] = data[i + 2] = v;
		}
		else {
			for (let c = 0; c < 3; c++) {
				data[i + c] = data[i + c] > hash(x, y, c + 1) * 255 ? 255 : 0;
			}
		}
	}
	return image;
}

/**
 * Fragment (Photoshop) - the mean of four copies of the image shifted diagonally by the distance, which gives a
 * blurry double-vision look. Edges repeat the border pixels, alpha is averaged the same way (premultiplied).
 *
 * @param {Image_data} image
 * @param {object} params distance (0-50 pixels, default 4)
 * @returns {Image_data}
 */
export function fragment(image, params) {
	const d = clamp(Math.round(parseFloat(params.distance ?? 4)) || 0, 0, 50);
	if (d == 0) {
		return image;
	}
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const shifts = [[-d, -d], [d, -d], [-d, d], [d, d]];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let r = 0, g = 0, b = 0, a = 0;
			for (const [sx, sy] of shifts) {
				const j = (clamp(y + sy, 0, h - 1) * w + clamp(x + sx, 0, w - 1)) * 4;
				const alpha = src[j + 3];
				r += src[j] * alpha;
				g += src[j + 1] * alpha;
				b += src[j + 2] * alpha;
				a += alpha;
			}
			const i = (y * w + x) * 4;
			if (a > 0) {
				data[i] = Math.round(r / a);
				data[i + 1] = Math.round(g / a);
				data[i + 2] = Math.round(b / a);
			}
			data[i + 3] = Math.round(a / 4);
		}
	}
	return image;
}

/**
 * Despeckle (Photoshop) - blurs the image except along edges, so noise (speckles) disappears and outlines stay
 * sharp. An edge is a pixel whose Sobel gradient of brightness reaches the threshold; the rest is replaced by the
 * mean of its 3x3 neighbourhood. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params threshold (0-1000, default 100; higher keeps fewer edges), passes (1-5, repeats the blur)
 * @returns {Image_data}
 */
export function despeckle(image, params) {
	const threshold = clamp(parseFloat(params.threshold ?? 100), 0, 1000);
	const passes = clamp(Math.round(parseFloat(params.passes ?? 1)) || 1, 1, 5);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const luma = new Float32Array(w * h);
	for (let pass = 0; pass < passes; pass++) {
		const src = new Uint8ClampedArray(data);
		for (let p = 0; p < w * h; p++) {
			luma[p] = src[p * 4] * 0.299 + src[p * 4 + 1] * 0.587 + src[p * 4 + 2] * 0.114;
		}
		const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
				const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
				if (Math.sqrt(gx * gx + gy * gy) >= threshold) {
					continue;
				}
				const i = (y * w + x) * 4;
				for (let c = 0; c < 3; c++) {
					let sum = 0;
					for (let ky = -1; ky <= 1; ky++) {
						const yy = clamp(y + ky, 0, h - 1);
						for (let kx = -1; kx <= 1; kx++) {
							sum += src[(yy * w + clamp(x + kx, 0, w - 1)) * 4 + c];
						}
					}
					data[i + c] = Math.round(sum / 9);
				}
			}
		}
	}
	return image;
}

/**
 * Custom (Photoshop, 3x3 kernel) - every pixel becomes the weighted sum of its neighbourhood divided by the scale
 * plus the offset. Edges repeat the border pixels, alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params k0..k8 (weights, row by row, -999..999), scale (not 0, default 1), offset (-255..255)
 * @returns {Image_data}
 */
export function customKernel(image, params) {
	const kernel = [];
	for (let n = 0; n < 9; n++) {
		kernel.push(clamp(parseFloat(params[`k${n}`]) || 0, -999, 999));
	}
	const scale = parseFloat(params.scale) || 1;
	const shift = clamp(parseFloat(params.offset) || 0, -255, 255);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				let sum = 0;
				for (let ky = -1; ky <= 1; ky++) {
					const yy = clamp(y + ky, 0, h - 1);
					for (let kx = -1; kx <= 1; kx++) {
						const xx = clamp(x + kx, 0, w - 1);
						sum += kernel[(ky + 1) * 3 + kx + 1] * src[(yy * w + xx) * 4 + c];
					}
				}
				data[i + c] = clamp(Math.round(sum / scale + shift), 0, 255);
			}
		}
	}
	return image;
}

/**
 * Photocopy (Photoshop, simplified) - a black and white photocopy: pixels that are dark or lie on an edge become
 * black, the rest white. The brightness is smoothed by a 3x3 mean first (more passes = less detail).
 *
 * @param {Image_data} image
 * @param {object} params detail (1-5, smoothing passes are 6 - detail), edge (0-255, the gradient from which a
 *  pixel counts as an edge, default 40), darkness (0-255, brightness below which a pixel is black, default 60)
 * @returns {Image_data}
 */
export function photocopy(image, params) {
	const detail = clamp(Math.round(parseFloat(params.detail ?? 3)) || 1, 1, 5);
	const edge_level = clamp(parseFloat(params.edge ?? 40), 0, 255);
	const dark_level = clamp(parseFloat(params.darkness ?? 60), 0, 255);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	let luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;
	}
	for (let pass = 0; pass < 6 - detail; pass++) {
		const next = new Float32Array(w * h);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0;
				for (let ky = -1; ky <= 1; ky++) {
					for (let kx = -1; kx <= 1; kx++) {
						sum += luma[clamp(y + ky, 0, h - 1) * w + clamp(x + kx, 0, w - 1)];
					}
				}
				next[y * w + x] = sum / 9;
			}
		}
		luma = next;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			const black = at(x, y) < dark_level || Math.sqrt(gx * gx + gy * gy) / 4 >= edge_level;
			const i = (y * w + x) * 4;
			data[i] = data[i + 1] = data[i + 2] = black ? 0 : 255;
		}
	}
	return image;
}

/**
 * Charcoal (Photoshop, simplified) - a charcoal drawing: dark smudged tones plus bold edges, drawn on paper. The
 * brightness is smoothed by a 3x3 mean first (the more detail, the less smoothing is repeated), then the result
 * is the paper color darkened by (edges * edge_weight + darkness of the tone * tone_weight). Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params detail (1-5, smoothing passes are 6 - detail), edge (0-100, weight of the edges, default 60),
 *  tone (0-100, weight of the dark tones, default 40), charcoal and paper (#rrggbb, default black and white)
 * @returns {Image_data}
 */
export function charcoal(image, params) {
	const detail = clamp(Math.round(parseFloat(params.detail ?? 3)) || 1, 1, 5);
	const edge_weight = clamp(parseFloat(params.edge ?? 60), 0, 100) / 100 * 4;
	const tone_weight = clamp(parseFloat(params.tone ?? 40), 0, 100) / 100;
	const hex = (value, fallback) => {
		const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '');
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
	};
	const ink = hex(params.charcoal, [0, 0, 0]);
	const paper = hex(params.paper, [255, 255, 255]);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	let luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;
	}
	for (let pass = 0; pass < 6 - detail; pass++) {
		const next = new Float32Array(w * h);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0;
				for (let ky = -1; ky <= 1; ky++) {
					for (let kx = -1; kx <= 1; kx++) {
						sum += luma[clamp(y + ky, 0, h - 1) * w + clamp(x + kx, 0, w - 1)];
					}
				}
				next[y * w + x] = sum / 9;
			}
		}
		luma = next;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			const edge = Math.sqrt(gx * gx + gy * gy) / 4 / 255;
			const dark = (255 - at(x, y)) / 255;
			const amount = clamp(edge * edge_weight + dark * tone_weight, 0, 1);
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				data[i + c] = Math.round(paper[c] + (ink[c] - paper[c]) * amount);
			}
		}
	}
	return image;
}

/**
 * Blur More (Photoshop) - a 3x3 mean applied twice (stronger than one pass); alpha is kept
 *
 * @param {Image_data} image
 * @returns {Image_data}
 */
export function blurMore(image) {
	const box = {k0: 1, k1: 1, k2: 1, k3: 1, k4: 1, k5: 1, k6: 1, k7: 1, k8: 1, scale: 9, offset: 0};
	return customKernel(customKernel(image, box), box);
}

/**
 * Sharpen More (Photoshop) - the 8-neighbour sharpening kernel (centre 9, neighbours -1); alpha is kept
 *
 * @param {Image_data} image
 * @returns {Image_data}
 */
export function sharpenMore(image) {
	return customKernel(image, {k0: -1, k1: -1, k2: -1, k3: -1, k4: 9, k5: -1, k6: -1, k7: -1, k8: -1, scale: 1, offset: 0});
}

/**
 * Trace Contour (Photoshop) - thin colored lines along the places where a channel crosses the chosen level,
 * on a white (or transparent-kept) background. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params level (0-255, the brightness the contour follows), edge ('Lower' | 'Upper': which side of
 *  the level the line is drawn on)
 * @returns {Image_data}
 */
export function traceContour(image, params) {
	const level = clamp(Math.round(parseFloat(params.level)), 0, 255) || 0;
	const upper = params.edge == 'Upper';
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const above = (i, c) => src[i + c] >= level;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				const here = above(i, c);
				//a pixel is on the contour when it is on the chosen side and a neighbour is on the other side
				let edge = false;
				if (here == upper) {
					const right = x + 1 < w ? above(i + 4, c) : here;
					const down = y + 1 < h ? above(i + w * 4, c) : here;
					const left = x > 0 ? above(i - 4, c) : here;
					const up = y > 0 ? above(i - w * 4, c) : here;
					edge = right != here || down != here || left != here || up != here;
				}
				data[i + c] = edge ? src[i + c] : 255;
			}
		}
	}
	return image;
}

/** Wind (Photoshop): the methods and how long their streaks are (pixels) */
export const WIND_METHODS = {Wind: 12, Blast: 30, Stagger: 12};

/**
 * Wind - streaks that start at every brightness edge and trail away from it, like wind blowing the picture.
 * Deterministic (a hash of the position), so the preview and the result match. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params method (key of WIND_METHODS), direction ('From the Left' | 'From the Right'),
 *  strength (0-100, how big a brightness step starts a streak: higher = fewer streaks), seed
 * @returns {Image_data}
 */
export function wind(image, params) {
	const method = Object.prototype.hasOwnProperty.call(WIND_METHODS, params.method) ? params.method : 'Wind';
	const step = params.direction == 'From the Right' ? -1 : 1;
	const threshold = 4 + clamp(Math.round(parseFloat(params.strength) || 0), 0, 100) * 1.2;
	const seed = parseInt(params.seed) || 0;
	const base = WIND_METHODS[method];
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const hash = (x, y, salt) => {
		let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed + salt, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	const luma = (i) => src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
	for (let y = 0; y < h; y++) {
		for (let k = 0; k < w; k++) {
			//walk against the wind so that nearer streaks are painted last
			const x = step == 1 ? k : w - 1 - k;
			const px = x - step;
			if (px < 0 || px >= w) {
				continue;
			}
			const i = (y * w + x) * 4;
			const j = (y * w + px) * 4;
			if (Math.abs(luma(i) - luma(j)) < threshold) {
				continue;
			}
			//the streak carries the brighter of the two pixels' side; it starts behind the edge
			const from = luma(i) > luma(j) ? i : j;
			let length = Math.round(base * (0.3 + hash(x, y, 3) * 1.4));
			if (method == 'Blast') {
				length = Math.round(length * (0.5 + hash(x, y, 4)));
			}
			const start = method == 'Stagger' ? Math.round((hash(x, y, 5) - 0.5) * base) : 0;
			for (let n = 1; n <= length; n++) {
				const tx = x + step * (n + start);
				if (tx < 0 || tx >= w) {
					break;
				}
				const t = (y * w + tx) * 4;
				data[t] = src[from];
				data[t + 1] = src[from + 1];
				data[t + 2] = src[from + 2];
			}
		}
	}
	return image;
}

/**
 * Oil Paint (Kuwahara filter) - flat painted areas with sharp edges. Every pixel takes the mean color of the
 * calmest (lowest variance of brightness) of the four square quadrants around it. Summed area tables make it
 * cost the same for any radius. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params radius (1-20 pixels)
 * @returns {Image_data}
 */
export function oilPaint(image, params) {
	const radius = clamp(Math.round(parseFloat(params.radius) || 0), 1, 20);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const stride = w + 1;
	//summed area tables of R, G, B, luminance and luminance squared
	const tables = [0, 1, 2, 3, 4].map(() => new Float64Array(stride * (h + 1)));
	for (let y = 0; y < h; y++) {
		const row = [0, 0, 0, 0, 0];
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
			const values = [data[i], data[i + 1], data[i + 2], l, l * l];
			const at = (y + 1) * stride + x + 1;
			for (let t = 0; t < 5; t++) {
				row[t] += values[t];
				tables[t][at] = tables[t][at - stride] + row[t];
			}
		}
	}
	const box = (t, x0, y0, x1, y1) => {
		const table = tables[t];
		return table[(y1 + 1) * stride + x1 + 1] - table[y0 * stride + x1 + 1] - table[(y1 + 1) * stride + x0] + table[y0 * stride + x0];
	};
	const out = new Uint8ClampedArray(data.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let best = Infinity;
			let best_box = null;
			for (let q = 0; q < 4; q++) {
				const x0 = Math.max(0, (q & 1) ? x : x - radius);
				const x1 = Math.min(w - 1, (q & 1) ? x + radius : x);
				const y0 = Math.max(0, (q & 2) ? y : y - radius);
				const y1 = Math.min(h - 1, (q & 2) ? y + radius : y);
				const n = (x1 - x0 + 1) * (y1 - y0 + 1);
				const mean = box(3, x0, y0, x1, y1) / n;
				const variance = box(4, x0, y0, x1, y1) / n - mean * mean;
				if (variance < best) {
					best = variance;
					best_box = [x0, y0, x1, y1, n];
				}
			}
			const i = (y * w + x) * 4;
			const [x0, y0, x1, y1, n] = best_box;
			out[i] = box(0, x0, y0, x1, y1) / n;
			out[i + 1] = box(1, x0, y0, x1, y1) / n;
			out[i + 2] = box(2, x0, y0, x1, y1) / n;
			out[i + 3] = data[i + 3];
		}
	}
	data.set(out);
	return image;
}

/**
 * Tiles (Photoshop, Stylize) - the image is cut into tiles and every tile is shifted by a random distance.
 * Tiles are drawn over a copy of the original, so the gaps show the unshifted image underneath.
 * The shifts come from a hash of the tile index and the seed (the same input gives the same result).
 *
 * @param {Image_data} image
 * @param {object} params count (tiles along the longer side, 2-100), offset (1-99 % of a tile), seed (integer)
 * @returns {Image_data}
 */
export function tiles(image, params) {
	const count = clamp(Math.round(parseFloat(params.count) || 0), 2, 100);
	const offset_share = clamp(parseFloat(params.offset) || 0, 0, 99) / 100;
	const seed = parseInt(params.seed) || 0;
	const w = image.width;
	const h = image.height;
	const size = Math.max(1, Math.ceil(Math.max(w, h) / count));
	const max_shift = Math.round(size * offset_share);
	if (max_shift == 0) {
		return image;
	}
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const hash = (a, b, salt) => {
		let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed + salt, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	for (let ty = 0; ty * size < h; ty++) {
		for (let tx = 0; tx * size < w; tx++) {
			const dx = Math.floor(hash(tx, ty, 1) * (max_shift * 2 + 1)) - max_shift;
			const dy = Math.floor(hash(tx, ty, 2) * (max_shift * 2 + 1)) - max_shift;
			const x_end = Math.min(w, (tx + 1) * size);
			const y_end = Math.min(h, (ty + 1) * size);
			for (let y = ty * size; y < y_end; y++) {
				const ny = y + dy;
				if (ny < 0 || ny >= h) {
					continue;
				}
				for (let x = tx * size; x < x_end; x++) {
					const nx = x + dx;
					if (nx < 0 || nx >= w) {
						continue;
					}
					const i = (y * w + x) * 4;
					const j = (ny * w + nx) * 4;
					data[j] = src[i];
					data[j + 1] = src[i + 1];
					data[j + 2] = src[i + 2];
					data[j + 3] = src[i + 3];
				}
			}
		}
	}
	return image;
}

/**
 * Average (Photoshop, Blur) - fills the image with its average color. Transparent pixels count less
 * (the mean is weighted by alpha); alpha itself is kept. A fully transparent image does not change.
 *
 * @param {Image_data} image
 * @param {Uint8Array|Uint8ClampedArray|null} [weights] optional strength of every pixel 0-255 (a selection mask);
 *   only the weighted pixels contribute to the mean, but all pixels are filled
 * @returns {Image_data}
 */
export function average(image, weights = null) {
	const data = image.data;
	let r = 0, g = 0, b = 0, total = 0;
	for (let i = 0; i < data.length; i += 4) {
		const a = weights ? data[i + 3] * weights[i / 4] / 255 : data[i + 3];
		r += data[i] * a;
		g += data[i + 1] * a;
		b += data[i + 2] * a;
		total += a;
	}
	if (total == 0) {
		return image;
	}
	r = Math.round(r / total);
	g = Math.round(g / total);
	b = Math.round(b / total);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
	}
	return image;
}

/**
 * Pixelate (Mosaic) - replaces each block with its average color
 *
 * @param {Image_data} image
 * @param {number|string} size block size in pixels, 2-200
 * @returns {Image_data}
 */
export function pixelate(image, size) {
	let y, x, p;
	size = clamp(parseInt(size) || 8, 2, 200);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	for (let by = 0; by < h; by += size) {
		for (let bx = 0; bx < w; bx += size) {
			const x_end = Math.min(bx + size, w);
			const y_end = Math.min(by + size, h);
			let r = 0, g = 0, b = 0, count = 0;
			for (y = by; y < y_end; y++) {
				for (x = bx; x < x_end; x++) {
					p = (y * w + x) * 4;
					r += data[p];
					g += data[p + 1];
					b += data[p + 2];
					count++;
				}
			}
			r = Math.round(r / count);
			g = Math.round(g / count);
			b = Math.round(b / count);
			for (y = by; y < y_end; y++) {
				for (x = bx; x < x_end; x++) {
					p = (y * w + x) * 4;
					data[p] = r;
					data[p + 1] = g;
					data[p + 2] = b;
				}
			}
		}
	}
	return image;
}

/**
 * Separable box blur of RGB channels (edge pixels are clamped). Returns new Float32Array (RGBA layout, alpha untouched/zero).
 *
 * @param {Image_data} image
 * @param {number} radius
 * @returns {Float32Array}
 */
function box_blur(image, radius) {
	const w = image.width;
	const h = image.height;
	const src = image.data;
	const tmp = new Float32Array(src.length);
	const out = new Float32Array(src.length);
	const span = radius * 2 + 1;

	//horizontal
	for (let y = 0; y < h; y++) {
		for (let c = 0; c < 3; c++) {
			let sum = 0;
			for (let k = -radius; k <= radius; k++) {
				sum += src[(y * w + clamp(k, 0, w - 1)) * 4 + c];
			}
			for (let x = 0; x < w; x++) {
				tmp[(y * w + x) * 4 + c] = sum / span;
				sum += src[(y * w + clamp(x + radius + 1, 0, w - 1)) * 4 + c];
				sum -= src[(y * w + clamp(x - radius, 0, w - 1)) * 4 + c];
			}
		}
	}
	//vertical
	for (let x2 = 0; x2 < w; x2++) {
		for (let c2 = 0; c2 < 3; c2++) {
			let sum2 = 0;
			for (let k2 = -radius; k2 <= radius; k2++) {
				sum2 += tmp[(clamp(k2, 0, h - 1) * w + x2) * 4 + c2];
			}
			for (let y2 = 0; y2 < h; y2++) {
				out[(y2 * w + x2) * 4 + c2] = sum2 / span;
				sum2 += tmp[(clamp(y2 + radius + 1, 0, h - 1) * w + x2) * 4 + c2];
				sum2 -= tmp[(clamp(y2 - radius, 0, h - 1) * w + x2) * 4 + c2];
			}
		}
	}
	return out;
}

/**
 * Cutout (Photoshop, simplified) - the picture is cut from a few flat layers of color: it is smoothed by a box blur
 * (the simplicity is its radius) and every color channel is then reduced to a few levels. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params levels (2-8, default 4), simplicity (0-10 px blur radius, default 4)
 * @returns {Image_data}
 */
export function cutout(image, params) {
	const levels = clamp(Math.round(parseFloat(params.levels ?? 4)) || 2, 2, 8);
	const radius = clamp(Math.round(parseFloat(params.simplicity ?? 4)) || 0, 0, 10);
	const data = image.data;
	const source = radius > 0 ? box_blur(image, radius) : data;
	const step = 255 / (levels - 1);
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			data[i + c] = Math.round(Math.round(source[i + c] / step) * step);
		}
	}
	return image;
}

/**
 * Poster Edges (Photoshop, simplified) - posterized colors (as Cutout) with dark lines drawn where the smoothed
 * brightness changes sharply. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params levels (2-8, default 4), simplicity (0-10 px blur radius, default 2), edge (0-255, the
 *  gradient from which a pixel is a line, default 30), intensity (0-100 %, how dark the lines are, default 80)
 * @returns {Image_data}
 */
export function posterEdges(image, params) {
	const radius = clamp(Math.round(parseFloat(params.simplicity ?? 2)) || 0, 0, 10);
	const edge_level = clamp(parseFloat(params.edge ?? 30), 0, 255);
	const strength = clamp(parseFloat(params.intensity ?? 80), 0, 100) / 100;
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const smooth = radius > 0 ? box_blur(image, radius) : data;
	const luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = smooth[p * 4] * 0.299 + smooth[p * 4 + 1] * 0.587 + smooth[p * 4 + 2] * 0.114;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	const line = new Float32Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			line[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 4 >= edge_level ? 1 : 0;
		}
	}
	cutout(image, params);
	for (let p = 0; p < w * h; p++) {
		if (line[p]) {
			for (let c = 0; c < 3; c++) {
				data[p * 4 + c] = Math.round(data[p * 4 + c] * (1 - strength));
			}
		}
	}
	return image;
}

/**
 * Stamp (Photoshop, Sketch) - a two-color stamp: the picture is smoothed by a box blur and every pixel becomes ink
 * where its brightness is below the balance and paper elsewhere. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params balance (0-100 %, the share of the brightness range that turns into ink, default 50),
 *  smoothness (0-20 px blur radius, default 5), ink and paper (#rrggbb, default black and white)
 * @returns {Image_data}
 */
export function stamp(image, params) {
	const balance = clamp(parseFloat(params.balance ?? 50), 0, 100) / 100 * 255;
	const radius = clamp(Math.round(parseFloat(params.smoothness ?? 5)) || 0, 0, 20);
	const hex = (value, fallback) => {
		const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '');
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
	};
	const ink = hex(params.ink, [0, 0, 0]);
	const paper = hex(params.paper, [255, 255, 255]);
	const data = image.data;
	const source = radius > 0 ? box_blur(image, radius) : data;
	for (let i = 0; i < data.length; i += 4) {
		const luma = source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114;
		const color = luma < balance ? ink : paper;
		data[i] = color[0];
		data[i + 1] = color[1];
		data[i + 2] = color[2];
	}
	return image;
}

/**
 * Crosshatch (pen and ink) - the picture is redrawn with lines on paper: light areas get one family of diagonal lines,
 * darker ones add the second diagonal, the horizontal and the vertical family. Which families are used depends on the
 * (optionally smoothed) brightness. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params spacing (3-30 px between lines, default 6), thickness (1-6 px, default 1), smoothness (0-10,
 *  default 2), ink and paper (#rrggbb, default black on white)
 * @returns {Image_data}
 */
export function crosshatch(image, params) {
	const spacing = clamp(Math.round(parseFloat(params.spacing ?? 6)) || 6, 3, 30);
	const thickness = clamp(Math.round(parseFloat(params.thickness ?? 1)) || 1, 1, Math.min(6, spacing - 1));
	const radius = clamp(Math.round(parseFloat(params.smoothness ?? 2)) || 0, 0, 10);
	const hex = (value, fallback) => {
		const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '');
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
	};
	const ink = hex(params.ink, [0, 0, 0]);
	const paper = hex(params.paper, [255, 255, 255]);
	const w = image.width;
	const data = image.data;
	const source = radius > 0 ? box_blur(image, radius) : data;
	const mod = (n) => ((n % spacing) + spacing) % spacing;
	for (let p = 0, i = 0; p < data.length / 4; p++, i += 4) {
		const x = p % w;
		const y = (p - x) / w;
		const luma = source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114;
		const on = (luma < 200 && mod(x + y) < thickness)
			|| (luma < 150 && mod(x - y) < thickness)
			|| (luma < 100 && mod(y) < thickness)
			|| (luma < 50 && mod(x) < thickness);
		const color = on ? ink : paper;
		data[i] = color[0];
		data[i + 1] = color[1];
		data[i + 2] = color[2];
	}
	return image;
}

/**
 * Spatter (Photoshop, simplified) - the picture looks sprayed: every pixel is taken from a randomly shifted place. The
 * shift is a value noise (a hash of the grid point + the seed, interpolated), so a higher smoothness gives larger,
 * softer splashes and the result is the same for the same input. Alpha is shifted with the colors.
 *
 * @param {Image_data} image
 * @param {object} params radius (0-30 px, how far a pixel can come from, default 10), smoothness (1-15, size of the
 *  splashes, default 5), seed
 * @returns {Image_data}
 */
export function spatter(image, params) {
	const radius = clamp(parseFloat(params.radius ?? 10) || 0, 0, 30);
	const cell = clamp(Math.round(parseFloat(params.smoothness ?? 5)) || 1, 1, 15);
	const seed = parseInt(params.seed) || 0;
	if (radius == 0) {
		return image;
	}
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const source = new Uint8ClampedArray(data);
	const hash = (x, y, salt) => {
		let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed + salt, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1;
	};
	const noise = (x, y, salt) => {
		const gx = Math.floor(x / cell);
		const gy = Math.floor(y / cell);
		const fx = x / cell - gx;
		const fy = y / cell - gy;
		const a = hash(gx, gy, salt) * (1 - fx) + hash(gx + 1, gy, salt) * fx;
		const b = hash(gx, gy + 1, salt) * (1 - fx) + hash(gx + 1, gy + 1, salt) * fx;
		return a * (1 - fy) + b * fy;
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			// a fine hash on top of the smooth noise gives the sprayed grain
			const sx = clamp(Math.round(x + (noise(x, y, 1) * 0.7 + hash(x, y, 5) * 0.3) * radius), 0, w - 1);
			const sy = clamp(Math.round(y + (noise(x, y, 2) * 0.7 + hash(x, y, 6) * 0.3) * radius), 0, h - 1);
			const from = (sy * w + sx) * 4;
			const to = (y * w + x) * 4;
			data[to] = source[from];
			data[to + 1] = source[from + 1];
			data[to + 2] = source[from + 2];
			data[to + 3] = source[from + 3];
		}
	}
	return image;
}

/**
 * Angled Strokes (Photoshop, simplified) - diagonal brush strokes: every pixel becomes the mean of a short line of
 * pixels. Light areas (brightness above the middle) are stroked in one direction, dark ones in the perpendicular one.
 * Alpha is averaged with the colors (premultiplied).
 *
 * @param {Image_data} image
 * @param {object} params angle (-180..180 degrees of the light strokes, default 45), length (1-50 px, default 10)
 * @returns {Image_data}
 */
export function angledStrokes(image, params) {
	const angle = (parseFloat(params.angle ?? 45) || 0) * Math.PI / 180;
	const length = clamp(Math.round(parseFloat(params.length ?? 10)) || 1, 1, 50);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const source = new Uint8ClampedArray(data);
	const dirs = [[Math.cos(angle), Math.sin(angle)], [-Math.sin(angle), Math.cos(angle)]];
	const half = (length - 1) / 2;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const luma = source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114;
			const dir = dirs[luma >= 128 ? 0 : 1];
			let r = 0, g = 0, b = 0, a = 0;
			for (let k = 0; k < length; k++) {
				const t = k - half;
				const sx = clamp(Math.round(x + dir[0] * t), 0, w - 1);
				const sy = clamp(Math.round(y + dir[1] * t), 0, h - 1);
				const j = (sy * w + sx) * 4;
				const alpha = source[j + 3];
				r += source[j] * alpha;
				g += source[j + 1] * alpha;
				b += source[j + 2] * alpha;
				a += alpha;
			}
			if (a > 0) {
				data[i] = r / a;
				data[i + 1] = g / a;
				data[i + 2] = b / a;
			}
			data[i + 3] = a / length;
		}
	}
	return image;
}

/**
 * Ink Outlines (Photoshop, simplified) - the picture is smoothed and its edges are drawn over it as ink lines: the
 * Sobel gradient of the brightness, above the threshold, mixes the pixel with the ink color. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params smoothness (0-10 px of box blur, default 2), threshold (0-255 gradient where the ink starts,
 *  default 40), intensity (0-100 %, how much ink the strongest edge gets, default 100), ink (#rrggbb, default black)
 * @returns {Image_data}
 */
export function inkOutlines(image, params) {
	const radius = clamp(Math.round(parseFloat(params.smoothness ?? 2)) || 0, 0, 10);
	const threshold = clamp(parseFloat(params.threshold ?? 40) || 0, 0, 254);
	const strength = clamp(parseFloat(params.intensity ?? 100), 0, 100) / 100;
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(params.ink || '');
	const ink = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const soft = radius > 0 ? box_blur(image, radius) : new Uint8ClampedArray(data);
	const luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = soft[p * 4] * 0.299 + soft[p * 4 + 1] * 0.587 + soft[p * 4 + 2] * 0.114;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			const edge = Math.min(1, Math.max(0, (Math.hypot(gx, gy) / 4 - threshold) / (255 - threshold)) * 4);
			const k = edge * strength;
			const i = (y * w + x) * 4;
			data[i] = soft[i] + (ink[0] - soft[i]) * k;
			data[i + 1] = soft[i + 1] + (ink[1] - soft[i + 1]) * k;
			data[i + 2] = soft[i + 2] + (ink[2] - soft[i + 2]) * k;
		}
	}
	return image;
}

/**
 * Sprayed Strokes (Photoshop, simplified) - like Spatter, but the pixels are thrown along one direction only: every
 * pixel is taken from a random place on a line through it (a hash of the position + the seed, so the result is
 * deterministic). Alpha moves with the colors.
 *
 * @param {Image_data} image
 * @param {object} params angle (-180..180 degrees, default 45), length (0-40 px, the farthest place, default 12), seed
 * @returns {Image_data}
 */
export function sprayedStrokes(image, params) {
	const angle = (parseFloat(params.angle ?? 45) || 0) * Math.PI / 180;
	const length = clamp(parseFloat(params.length ?? 12) || 0, 0, 40);
	const seed = parseInt(params.seed) || 0;
	if (length == 0) {
		return image;
	}
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const source = new Uint8ClampedArray(data);
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed + 7, 1274126177)) | 0;
			n = Math.imul(n ^ (n >>> 13), 1274126177);
			const t = (((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1) * length;
			const sx = clamp(Math.round(x + dx * t), 0, w - 1);
			const sy = clamp(Math.round(y + dy * t), 0, h - 1);
			const from = (sy * w + sx) * 4;
			const to = (y * w + x) * 4;
			data[to] = source[from];
			data[to + 1] = source[from + 1];
			data[to + 2] = source[from + 2];
			data[to + 3] = source[from + 3];
		}
	}
	return image;
}

/**
 * Chrome (Photoshop, simplified) - a shiny metal surface: the smoothed brightness is treated as a height and mapped
 * through a sine, so it rises and falls like a reflection (detail = how many times). The result is gray. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params detail (1-10 reflections, default 3), smoothness (0-20 px of box blur, default 4)
 * @returns {Image_data}
 */
export function chrome(image, params) {
	const detail = clamp(Math.round(parseFloat(params.detail ?? 3)) || 1, 1, 10);
	const radius = clamp(Math.round(parseFloat(params.smoothness ?? 4)) || 0, 0, 20);
	const data = image.data;
	const soft = radius > 0 ? box_blur(image, radius) : new Uint8ClampedArray(data);
	for (let i = 0; i < data.length; i += 4) {
		const luma = (soft[i] * 0.299 + soft[i + 1] * 0.587 + soft[i + 2] * 0.114) / 255;
		const v = 127.5 + 127.5 * Math.sin((luma - 0.5) * Math.PI * detail);
		data[i] = data[i + 1] = data[i + 2] = v;
	}
	return image;
}

/**
 * Texturizer (Photoshop, simplified) - a woven canvas: a height map of crossing threads is lit from one direction
 * and the shading is added to the picture. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params scaling (2-40 px, the distance between threads, default 8), relief (0-100, depth of the
 *  weave, default 40), light (angle of the light in degrees, default 135 = from the top left)
 * @returns {Image_data}
 */
export function texturizer(image, params) {
	const period = clamp(parseFloat(params.scaling ?? 8) || 8, 2, 40);
	const relief = clamp(parseFloat(params.relief ?? 40), 0, 100) / 100 * 90;
	const light = (parseFloat(params.light ?? 135) || 0) * Math.PI / 180;
	const lx = Math.cos(light);
	const ly = Math.sin(light);
	const w = image.width;
	const data = image.data;
	const k = Math.PI * 2 / period;
	// over-under weave: threads of one direction rise where the other sinks
	const height = (x, y) => Math.sin(x * k) * Math.max(0, Math.sin(y * k * 0.5 + 0.5)) + Math.sin(y * k) * Math.max(0, Math.sin(x * k * 0.5 + 0.5));
	for (let p = 0, i = 0; p < data.length / 4; p++, i += 4) {
		const x = p % w;
		const y = (p - x) / w;
		const dx = height(x + 0.5, y) - height(x - 0.5, y);
		const dy = height(x, y + 0.5) - height(x, y - 0.5);
		const shade = (dx * lx + dy * ly) * relief;
		data[i] += shade;
		data[i + 1] += shade;
		data[i + 2] += shade;
	}
	return image;
}

/**
 * Neon Glow (Photoshop, simplified) - the picture is darkened and its edges glow in a color: the Sobel edges of the
 * brightness are blurred into a halo and added (screen) over the darkened image. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params size (1-20 px, radius of the glow, default 5), brightness (0-100 %, strength of the glow,
 *  default 60), darken (0-100 %, how much the original is darkened, default 50), color (#rrggbb, default cyan)
 * @returns {Image_data}
 */
export function neonGlow(image, params) {
	const radius = clamp(Math.round(parseFloat(params.size ?? 5)) || 1, 1, 20);
	const strength = clamp(parseFloat(params.brightness ?? 60), 0, 100) / 100 * 3;
	const keep = 1 - clamp(parseFloat(params.darken ?? 50), 0, 100) / 100;
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(params.color || '');
	const glow = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 255, 255];
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	const edges = {width: w, height: h, data: new Uint8ClampedArray(w * h * 4)};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			const e = clamp(Math.sqrt(gx * gx + gy * gy) / 4, 0, 255);
			const i = (y * w + x) * 4;
			edges.data[i] = edges.data[i + 1] = edges.data[i + 2] = e;
		}
	}
	const halo = box_blur(edges, radius);
	for (let p = 0; p < w * h; p++) {
		const amount = clamp(halo[p * 4] / 255 * strength, 0, 1);
		for (let c = 0; c < 3; c++) {
			const base = data[p * 4 + c] * keep;
			const light = glow[c] * amount;
			data[p * 4 + c] = Math.round(255 - (255 - base) * (255 - light) / 255);
		}
	}
	return image;
}

/**
 * Bas Relief (Photoshop, Sketch, simplified) - the brightness of the picture is carved into a low relief lit from a
 * direction: the slope of the smoothed brightness along the light decides how much of the light and the dark color
 * is mixed (flat areas are the middle between them). Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params detail (1-15, how much the slope is amplified, default 5), smoothness (0-10 px blur radius,
 *  default 2), light (angle in degrees the light comes from, 0 = from the right, 90 = from the top, default 135),
 *  dark and light_color (#rrggbb, default black and white)
 * @returns {Image_data}
 */
export function basRelief(image, params) {
	const detail = clamp(parseFloat(params.detail ?? 5) || 1, 1, 15);
	const radius = clamp(Math.round(parseFloat(params.smoothness ?? 2)) || 0, 0, 10);
	const angle = (parseFloat(params.light ?? 135) || 0) * Math.PI / 180;
	const hex = (value, fallback) => {
		const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '');
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
	};
	const dark = hex(params.dark, [0, 0, 0]);
	const bright = hex(params.light_color, [255, 255, 255]);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const smooth = radius > 0 ? box_blur(image, radius) : data;
	const luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = smooth[p * 4] * 0.299 + smooth[p * 4 + 1] * 0.587 + smooth[p * 4 + 2] * 0.114;
	}
	const at = (x, y) => luma[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
	//the light comes from (cos, -sin) in screen coordinates (y points down)
	const dx = Math.round(Math.cos(angle));
	const dy = Math.round(-Math.sin(angle));
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			//a slope facing the light is bright: the brightness drops away from the light
			const slope = at(x - dx, y - dy) - at(x + dx, y + dy);
			const t = clamp(0.5 + slope * detail / 255 / 2, 0, 1);
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				data[i + c] = Math.round(dark[c] + (bright[c] - dark[c]) * t);
			}
		}
	}
	return image;
}

/**
 * Facet (Photoshop, Pixelate, simplified) - clumps similar colors into flat, slightly angular patches by applying a
 * median filter repeatedly. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params radius (1-5 px of every pass, default 1), passes (1-5, default 3)
 * @returns {Image_data}
 */
export function facet(image, params) {
	const passes = clamp(Math.round(parseFloat(params.passes ?? 3)) || 1, 1, 5);
	for (let pass = 0; pass < passes; pass++) {
		median(image, params.radius ?? 1);
	}
	return image;
}

/**
 * Patchwork (Photoshop, Texture, simplified) - the picture is made of colored squares: each square takes the mean
 * color of its area and gets a random relief, so its top and left edge are lighter and its bottom and right edge
 * darker by that amount (the randomness comes from a hash of the square and the seed). Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params size (2-64 px, side of a square, default 8), relief (0-25, the largest shading in levels,
 *  default 8), seed (any integer)
 * @returns {Image_data}
 */
export function patchwork(image, params) {
	const size = clamp(Math.round(parseFloat(params.size ?? 8)) || 2, 2, 64);
	const relief = clamp(parseFloat(params.relief ?? 8) || 0, 0, 25);
	const seed = parseInt(params.seed) || 0;
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const hash = (a, b) => {
		let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	for (let ty = 0; ty * size < h; ty++) {
		for (let tx = 0; tx * size < w; tx++) {
			const x0 = tx * size;
			const y0 = ty * size;
			const x1 = Math.min(w, x0 + size);
			const y1 = Math.min(h, y0 + size);
			const mean = [0, 0, 0];
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					for (let c = 0; c < 3; c++) {
						mean[c] += data[(y * w + x) * 4 + c];
					}
				}
			}
			const count = (x1 - x0) * (y1 - y0);
			const height = hash(tx, ty) * relief;
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					let shade = 0;
					if (x == x0 || y == y0) {
						shade += height;
					}
					if (x == x1 - 1 || y == y1 - 1) {
						shade -= height;
					}
					for (let c = 0; c < 3; c++) {
						data[(y * w + x) * 4 + c] = clamp(Math.round(mean[c] / count + shade), 0, 255);
					}
				}
			}
		}
	}
	return image;
}

/**
 * Dry Brush (Photoshop, Artistic, simplified) - a painting made with a dry brush: Oil Paint flattens the areas and
 * the colors are then reduced to a limited palette, so the strokes stay flat with sharp edges. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params size (1-10 px, the brush radius, default 3), levels (2-16 levels per channel, default 8)
 * @returns {Image_data}
 */
export function dryBrush(image, params) {
	const size = clamp(Math.round(parseFloat(params.size ?? 3)) || 1, 1, 10);
	const levels = clamp(Math.round(parseFloat(params.levels ?? 8)) || 2, 2, 16);
	oilPaint(image, {radius: size});
	const data = image.data;
	const step = 255 / (levels - 1);
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			data[i + c] = Math.round(Math.round(data[i + c] / step) * step);
		}
	}
	return image;
}

/**
 * Diffuse Glow (Photoshop, Distort, simplified) - the picture glows as if seen through a soft screen: grain is added
 * to its smoothed brightness and the result is screened over the picture in a glow color, brighter areas glowing
 * more. The grain comes from a hash of the position and the seed, so the same input gives the same result. Alpha is
 * kept.
 *
 * @param {Image_data} image
 * @param {object} params graininess (0-10, default 6), glow (0-20, strength of the glow, default 10), size (1-20 px,
 *  radius of the spread, default 6), color (#rrggbb, default white), seed (any integer)
 * @returns {Image_data}
 */
export function diffuseGlow(image, params) {
	const grain = clamp(parseFloat(params.graininess ?? 6) || 0, 0, 10) / 10;
	const strength = clamp(parseFloat(params.glow ?? 10) || 0, 0, 20) / 20;
	const radius = clamp(Math.round(parseFloat(params.size ?? 6)) || 1, 1, 20);
	const seed = parseInt(params.seed) || 0;
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(params.color || '');
	const glow = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const hash = (x, y) => {
		let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	const smooth = box_blur(image, radius);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const luma = (smooth[i] * 0.299 + smooth[i + 1] * 0.587 + smooth[i + 2] * 0.114) / 255;
			const amount = clamp((luma + (hash(x, y) - 0.5) * grain * 2) * strength, 0, 1);
			for (let c = 0; c < 3; c++) {
				const light = glow[c] * amount;
				data[i + c] = Math.round(255 - (255 - data[i + c]) * (255 - light) / 255);
			}
		}
	}
	return image;
}

/**
 * Smart Sharpen (Photoshop, simplified) - Unsharp Mask that can leave noise alone and spare shadows and highlights:
 * a difference to the blurred copy smaller than the noise limit is not sharpened, and the sharpening fades out in
 * the darkest and the brightest tones. Alpha is kept.
 *
 * @param {Image_data} image
 * @param {object} params amount (0-500 %, default 100), radius (1-50 px, default 2), reduce_noise (0-100 %, how large
 *  a difference counts as noise: up to 25 levels, default 0), fade_shadows and fade_highlights (0-100 %, how far the
 *  sharpening fades towards black / white, default 0)
 * @returns {Image_data}
 */
export function smartSharpen(image, params) {
	const amount = clamp(parseFloat(params.amount ?? 100) || 0, 0, 500) / 100;
	const radius = clamp(parseInt(params.radius ?? 2) || 1, 1, 50);
	const noise = clamp(parseFloat(params.reduce_noise ?? 0) || 0, 0, 100) / 100 * 25;
	const shadows = clamp(parseFloat(params.fade_shadows ?? 0) || 0, 0, 100) / 100 * 128;
	const highlights = clamp(parseFloat(params.fade_highlights ?? 0) || 0, 0, 100) / 100 * 128;
	const blurred = box_blur(image, radius);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
		//1 in the middle tones, falling to 0 at black / white over the faded range
		const dark = shadows > 0 ? clamp(luma / shadows, 0, 1) : 1;
		const bright = highlights > 0 ? clamp((255 - luma) / highlights, 0, 1) : 1;
		const weight = amount * dark * bright;
		for (let c = 0; c < 3; c++) {
			const diff = data[i + c] - blurred[i + c];
			if (Math.abs(diff) > noise) {
				data[i + c] += diff * weight;
			}
		}
	}
	return image;
}

/** Up to this radius the Gaussian blur uses the exact kernel, above it three box blurs (about 3 % off, far faster) */
export const GAUSSIAN_EXACT_LIMIT = 12;

/**
 * The exact Gaussian blur of four interleaved float channels: a kernel of three standard deviations, two passes
 *
 * @param {Float32Array} source RGBA, premultiplied
 * @param {number} w
 * @param {number} h
 * @param {number} sigma
 * @returns {Float32Array}
 */
function gaussian_exact(source, w, h, sigma) {
	const reach = Math.max(1, Math.ceil(sigma * 3));
	const kernel = new Float32Array(reach * 2 + 1);
	let total = 0;
	for (let k = -reach; k <= reach; k++) {
		kernel[k + reach] = Math.exp(-(k * k) / (2 * sigma * sigma));
		total += kernel[k + reach];
	}
	for (let k = 0; k < kernel.length; k++) {
		kernel[k] /= total;
	}
	const pass = (from, horizontal) => {
		const out = new Float32Array(from.length);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let r = 0, g = 0, b = 0, a = 0;
				for (let k = -reach; k <= reach; k++) {
					const xx = horizontal ? clamp(x + k, 0, w - 1) : x;
					const yy = horizontal ? y : clamp(y + k, 0, h - 1);
					const weight = kernel[k + reach];
					const j = (yy * w + xx) * 4;
					r += from[j] * weight;
					g += from[j + 1] * weight;
					b += from[j + 2] * weight;
					a += from[j + 3] * weight;
				}
				const o = (y * w + x) * 4;
				out[o] = r;
				out[o + 1] = g;
				out[o + 2] = b;
				out[o + 3] = a;
			}
		}
		return out;
	};
	return pass(pass(source, true), false);
}

/**
 * The sizes of three box blurs whose sum is close to a Gaussian of the given standard deviation
 *
 * @param {number} sigma
 * @returns {number[]} three odd widths
 */
export function box_sizes_for_gaussian(sigma) {
	const passes = 3;
	const ideal = Math.sqrt(12 * sigma * sigma / passes + 1);
	let lower = Math.floor(ideal);
	if (lower % 2 == 0) {
		lower--;
	}
	const upper = lower + 2;
	const mean = Math.round((12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4));
	const sizes = [];
	for (let i = 0; i < passes; i++) {
		sizes.push(i < mean ? lower : upper);
	}
	return sizes;
}

/**
 * A Gaussian blur made of three box blurs (running sums, so the cost does not depend on the radius)
 *
 * @param {Float32Array} source RGBA, premultiplied
 * @param {number} w
 * @param {number} h
 * @param {number} sigma
 * @returns {Float32Array}
 */
function gaussian_boxes(source, w, h, sigma) {
	let current = source;
	for (const size of box_sizes_for_gaussian(sigma)) {
		const radius = (size - 1) / 2;
		for (const horizontal of [true, false]) {
			const out = new Float32Array(current.length);
			const lines = horizontal ? h : w;
			const length = horizontal ? w : h;
			const step = horizontal ? 4 : w * 4; //between two pixels of a line
			for (let line = 0; line < lines; line++) {
				const base = horizontal ? line * w * 4 : line * 4;
				for (let c = 0; c < 4; c++) {
					//the window runs over the pixels line - radius .. line + radius, the edge pixel repeats beyond the edge
					let sum = 0;
					for (let k = -radius; k <= radius; k++) {
						sum += current[base + clamp(k, 0, length - 1) * step + c];
					}
					for (let i = 0; i < length; i++) {
						out[base + i * step + c] = sum / size;
						sum += current[base + clamp(i + radius + 1, 0, length - 1) * step + c];
						sum -= current[base + clamp(i - radius, 0, length - 1) * step + c];
					}
				}
			}
			current = out;
		}
	}
	return current;
}

/**
 * Gaussian Blur (Photoshop) - a true Gaussian blur: two passes (horizontal, vertical) with a kernel whose standard
 * deviation is the radius (above GAUSSIAN_EXACT_LIMIT three box blurs stand in for it, about 3 % off). The color is blurred premultiplied by alpha, so a transparent area does not bleed its
 * (invisible) color into the edge, and alpha is blurred too. The kernel reaches three radii; edge pixels are clamped.
 *
 * @param {Image_data} image
 * @param {object} params radius (0-100 px, fractions allowed; 0 changes nothing)
 * @returns {Image_data}
 */
export function gaussianBlur(image, params) {
	const sigma = clamp(parseFloat(params.radius) || 0, 0, 100);
	if (sigma < 0.1) {
		return image;
	}
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const premultiplied = new Float32Array(w * h * 4);
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3] / 255;
		premultiplied[i] = data[i] * a;
		premultiplied[i + 1] = data[i + 1] * a;
		premultiplied[i + 2] = data[i + 2] * a;
		premultiplied[i + 3] = data[i + 3];
	}
	const blurred = sigma <= GAUSSIAN_EXACT_LIMIT
		? gaussian_exact(premultiplied, w, h, sigma)
		: gaussian_boxes(premultiplied, w, h, sigma);
	for (let i = 0; i < data.length; i += 4) {
		const alpha = blurred[i + 3];
		const a = alpha / 255;
		if (a > 0) {
			data[i] = clamp(Math.round(blurred[i] / a), 0, 255);
			data[i + 1] = clamp(Math.round(blurred[i + 1] / a), 0, 255);
			data[i + 2] = clamp(Math.round(blurred[i + 2] / a), 0, 255);
		}
		data[i + 3] = clamp(Math.round(alpha), 0, 255);
	}
	return image;
}

/**
 * Lens Blur (Photoshop, simplified) - the blur of a camera lens: every pixel is the average of a disc of pixels, so
 * a point of light spreads into a round bokeh instead of a soft blob. The bright pixels count more in the average
 * (specular highlights), so they stay round and bright. The color is averaged premultiplied by alpha. The cost grows
 * with the area of the disc.
 *
 * @param {Image_data} image
 * @param {object} params radius (1-20 px, default 6), highlights (0-100 %, how much more the pixels brighter than the
 *  threshold weigh, default 0), threshold (0-255, brightness from which a pixel counts as a highlight, default 200)
 * @returns {Image_data}
 */
export function lensBlur(image, params) {
	const radius = clamp(Math.round(parseFloat(params.radius ?? 6)) || 0, 0, 20);
	if (radius < 1) {
		return image;
	}
	const boost = clamp(parseFloat(params.highlights ?? 0) || 0, 0, 100) / 100 * 9;
	const threshold = clamp(parseFloat(params.threshold ?? 200), 0, 254);
	const w = image.width;
	const h = image.height;
	const data = image.data;
	//the disc as horizontal spans: for every row above and below the center, how far the disc reaches to the sides
	const spans = [];
	for (let dy = -radius; dy <= radius; dy++) {
		const reach = Math.floor(Math.sqrt(radius * radius + radius * 0.5 - dy * dy));
		if (reach >= 0 && dy * dy <= radius * radius + radius * 0.5) {
			spans.push([dy, reach]);
		}
	}
	//the weight of every pixel: 1, more for the highlights
	const weight = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		const luma = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;
		const t = clamp((luma - threshold) / (255 - threshold), 0, 1);
		weight[p] = 1 + boost * t * t * (3 - 2 * t);
	}
	//running sums along a row (premultiplied color times weight, alpha times weight, weight), made when the row is first
	//needed and dropped when the disc has moved past it
	const rows = new Map();
	const sums_of = (row) => {
		let sums = rows.get(row);
		if (sums == null) {
			sums = new Float64Array((w + 1) * 5);
			for (let x = 0; x < w; x++) {
				const p = row * w + x;
				const wt = weight[p];
				const alpha = data[p * 4 + 3] / 255;
				const o = x * 5;
				sums[o + 5] = sums[o] + data[p * 4] * alpha * wt;
				sums[o + 6] = sums[o + 1] + data[p * 4 + 1] * alpha * wt;
				sums[o + 7] = sums[o + 2] + data[p * 4 + 2] * alpha * wt;
				sums[o + 8] = sums[o + 3] + alpha * wt;
				sums[o + 9] = sums[o + 4] + wt;
			}
			rows.set(row, sums);
		}
		return sums;
	};
	const out = new Uint8ClampedArray(data.length);
	const total = new Float64Array(5);
	for (let y = 0; y < h; y++) {
		if (y > 0) {
			rows.delete(y - 1 - radius);
		}
		for (let x = 0; x < w; x++) {
			total.fill(0);
			for (let k = 0; k < spans.length; k++) {
				const sums = sums_of(clamp(y + spans[k][0], 0, h - 1));
				const reach = spans[k][1];
				const left = Math.max(0, x - reach);
				const right = Math.min(w - 1, x + reach);
				//the pixels of the span that lie outside the picture are the edge pixel again and again
				const before = Math.max(0, reach - x);
				const after = Math.max(0, x + reach - (w - 1));
				for (let c = 0; c < 5; c++) {
					total[c] += sums[(right + 1) * 5 + c] - sums[left * 5 + c]
						+ before * (sums[5 + c] - sums[c])
						+ after * (sums[w * 5 + c] - sums[(w - 1) * 5 + c]);
				}
			}
			const i = (y * w + x) * 4;
			if (total[3] > 0) {
				out[i] = Math.round(total[0] / total[3]);
				out[i + 1] = Math.round(total[1] / total[3]);
				out[i + 2] = Math.round(total[2] / total[3]);
			}
			out[i + 3] = Math.round(total[3] / total[4] * 255);
		}
	}
	data.set(out);
	return image;
}

/**
 * Unsharp Mask - sharpens by adding the difference between the image and its blurred copy
 *
 * @param {Image_data} image
 * @param {object} params keys: amount (0-500 %), radius (1-50 px), threshold (0-255)
 * @returns {Image_data}
 */
export function unsharpMask(image, params) {
	const amount = clamp(parseFloat(params.amount ?? 100) || 0, 0, 500) / 100;
	const radius = clamp(parseInt(params.radius ?? 2) || 1, 1, 50);
	const threshold = clamp(parseInt(params.threshold) || 0, 0, 255);

	const blurred = box_blur(image, radius);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			const diff = data[i + c] - blurred[i + c];
			if (Math.abs(diff) >= threshold) {
				data[i + c] += diff * amount;
			}
		}
	}
	return image;
}

/**
 * High Pass - keeps edges and details, everything else becomes mid gray
 *
 * @param {Image_data} image
 * @param {number|string} radius 1-100
 * @returns {Image_data}
 */
export function highPass(image, radius) {
	radius = clamp(parseInt(radius) || 5, 1, 100);
	const blurred = box_blur(image, radius);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			data[i + c] = data[i + c] - blurred[i + c] + 128;
		}
	}
	return image;
}

/**
 * Median - reduces noise by replacing each channel with the median of its neighborhood
 *
 * @param {Image_data} image
 * @param {number|string} radius 1-5
 * @returns {Image_data}
 */
export function median(image, radius) {
	radius = clamp(parseInt(radius) || 1, 1, 5);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const size = radius * 2 + 1;
	const half = (size * size) >> 1; //the median is the value with this many smaller values before it
	const hist = new Uint32Array(256);
	//the columns that are in the window of a pixel, clamped at the edges of the picture like the pixels themselves
	const column = (x) => clamp(x, 0, w - 1);
	for (let y = 0; y < h; y++) {
		for (let c = 0; c < 3; c++) {
			//the histogram of the window of the first pixel of the row
			hist.fill(0);
			for (let dy = -radius; dy <= radius; dy++) {
				const row = clamp(y + dy, 0, h - 1) * w;
				for (let dx = -radius; dx <= radius; dx++) {
					hist[src[(row + column(dx)) * 4 + c]]++;
				}
			}
			//the median found from the histogram, moved along as the window moves
			let med = 0;
			let less = 0;
			while (less + hist[med] <= half) {
				less += hist[med];
				med++;
			}
			data[(y * w) * 4 + c] = med;
			for (let x = 1; x < w; x++) {
				const out_column = column(x - 1 - radius);
				const in_column = column(x + radius);
				for (let dy = -radius; dy <= radius; dy++) {
					const row = clamp(y + dy, 0, h - 1) * w;
					const leaving = src[(row + out_column) * 4 + c];
					const arriving = src[(row + in_column) * 4 + c];
					hist[leaving]--;
					if (leaving < med) {
						less--;
					}
					hist[arriving]++;
					if (arriving < med) {
						less++;
					}
				}
				while (less > half) {
					med--;
					less -= hist[med];
				}
				while (less + hist[med] <= half) {
					less += hist[med];
					med++;
				}
				data[(y * w + x) * 4 + c] = med;
			}
		}
	}
	return image;
}

/**
 * Maximum (dilate lightest values) / Minimum (erode, spreads darkest values)
 *
 * @param {Image_data} image
 * @param {number|string} radius 1-10
 * @param {'maximum'|'minimum'} mode
 * @returns {Image_data}
 */
export function maxMin(image, radius, mode) {
	radius = clamp(parseInt(radius) || 1, 1, 10);
	const is_max = mode == 'maximum';
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const tmp = new Uint8ClampedArray(image.data.length);
	const data = image.data;
	const pick = is_max ? Math.max : Math.min;

	//separable: horizontal then vertical
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			for (let c = 0; c < 3; c++) {
				let v = is_max ? 0 : 255;
				for (let d = -radius; d <= radius; d++) {
					v = pick(v, src[(y * w + clamp(x + d, 0, w - 1)) * 4 + c]);
				}
				tmp[(y * w + x) * 4 + c] = v;
			}
		}
	}
	for (let y2 = 0; y2 < h; y2++) {
		for (let x2 = 0; x2 < w; x2++) {
			for (let c2 = 0; c2 < 3; c2++) {
				let v2 = is_max ? 0 : 255;
				for (let d2 = -radius; d2 <= radius; d2++) {
					v2 = pick(v2, tmp[(clamp(y2 + d2, 0, h - 1) * w + x2) * 4 + c2]);
				}
				data[(y2 * w + x2) * 4 + c2] = v2;
			}
		}
	}
	return image;
}

/**
 * Offset - shifts the image, content leaving one side re-enters on the opposite side (wrap around)
 *
 * @param {Image_data} image
 * @param {number|string} dx horizontal shift in pixels (positive = right)
 * @param {number|string} dy vertical shift in pixels (positive = down)
 * @returns {Image_data}
 */
export function offset(image, dx, dy) {
	const w = image.width;
	const h = image.height;
	if (w == 0 || h == 0) {
		return image;
	}
	dx = ((parseInt(dx) || 0) % w + w) % w;
	dy = ((parseInt(dy) || 0) % h + h) % h;
	if (dx == 0 && dy == 0) {
		return image;
	}
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	for (let y = 0; y < h; y++) {
		const ny = (y + dy) % h;
		for (let x = 0; x < w; x++) {
			const from = (y * w + x) * 4;
			const to = (ny * w + (x + dx) % w) * 4;
			data[to] = src[from];
			data[to + 1] = src[from + 1];
			data[to + 2] = src[from + 2];
			data[to + 3] = src[from + 3];
		}
	}
	return image;
}

/**
 * Motion Blur - averages pixels along a line
 *
 * @param {Image_data} image
 * @param {object} params keys: angle (-180..180 degrees), distance (1-200 px)
 * @returns {Image_data}
 */
export function motionBlur(image, params) {
	const angle = (parseFloat(params.angle) || 0) * Math.PI / 180;
	const distance = clamp(parseInt(params.distance ?? 10) || 1, 1, 200);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	const dx = Math.cos(angle);
	const dy = -Math.sin(angle);
	const samples = distance * 2 + 1;

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let r = 0, g = 0, b = 0;
			for (let s = -distance; s <= distance; s++) {
				const sx = clamp(Math.round(x + dx * s), 0, w - 1);
				const sy = clamp(Math.round(y + dy * s), 0, h - 1);
				const p = (sy * w + sx) * 4;
				r += src[p];
				g += src[p + 1];
				b += src[p + 2];
			}
			const q = (y * w + x) * 4;
			data[q] = r / samples;
			data[q + 1] = g / samples;
			data[q + 2] = b / samples;
		}
	}
	return image;
}

/**
 * Clarity - local contrast: large-radius unsharp mask weighted towards midtones
 *
 * @param {Image_data} image
 * @param {number|string} amount -100..100 (negative softens)
 * @param {number|string} [radius] default 20
 * @returns {Image_data}
 */
export function clarity(image, amount, radius) {
	amount = clamp(parseFloat(amount) || 0, -100, 100) / 100;
	radius = clamp(parseInt(radius ?? 20) || 20, 1, 100);
	if (amount == 0) {
		return image;
	}
	const blurred = box_blur(image, radius);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			const value = data[i + c];
			const weight = 1 - Math.pow(Math.abs(value / 127.5 - 1), 2); //0 at black/white, 1 at mid gray
			data[i + c] = value + (value - blurred[i + c]) * amount * weight * 1.5;
		}
	}
	return image;
}

/**
 * Mirror - copies one half of the image mirrored onto the other half (symmetry)
 *
 * @param {Image_data} image
 * @param {'left'|'right'|'top'|'bottom'} source half that is kept and mirrored
 * @returns {Image_data}
 */
export function mirror(image, source) {
	const w = image.width;
	const h = image.height;
	const data = image.data;
	const horizontal = source == 'left' || source == 'right';
	if (!horizontal && source != 'top' && source != 'bottom') {
		return image;
	}
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let sx = x, sy = y;
			if (source == 'left' && x >= w / 2) sx = w - 1 - x;
			else if (source == 'right' && x < w / 2) sx = w - 1 - x;
			else if (source == 'top' && y >= h / 2) sy = h - 1 - y;
			else if (source == 'bottom' && y < h / 2) sy = h - 1 - y;
			if (sx != x || sy != y) {
				const from = (sy * w + sx) * 4;
				const to = (y * w + x) * 4;
				data[to] = data[from];
				data[to + 1] = data[from + 1];
				data[to + 2] = data[from + 2];
				data[to + 3] = data[from + 3];
			}
		}
	}
	return image;
}

/**
 * Smart Blur - blurs only between pixels of similar luminance, so edges stay sharp
 *
 * @param {Image_data} image
 * @param {object} params keys: radius (1-10), threshold (1-255)
 * @returns {Image_data}
 */
export function smartBlur(image, params) {
	const radius = clamp(parseInt(params.radius ?? 3) || 1, 1, 10);
	const threshold = clamp(parseInt(params.threshold ?? 25) || 1, 1, 255);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;

	function lum(p) {
		return 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
	}

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const center = (y * w + x) * 4;
			const center_lum = lum(center);
			let r = 0, g = 0, b = 0, count = 0;
			for (let dy = -radius; dy <= radius; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= h) continue;
				for (let dx = -radius; dx <= radius; dx++) {
					const xx = x + dx;
					if (xx < 0 || xx >= w) continue;
					const p = (yy * w + xx) * 4;
					if (Math.abs(lum(p) - center_lum) <= threshold) {
						r += src[p];
						g += src[p + 1];
						b += src[p + 2];
						count++;
					}
				}
			}
			data[center] = r / count;
			data[center + 1] = g / count;
			data[center + 2] = b / count;
		}
	}
	return image;
}

/**
 * Convolution of the color channels with a 3x3 kernel (edges are clamped), alpha is preserved.
 *
 * @param {Image_data} image
 * @param {number[]} kernel 9 values, row by row
 * @param {number} offset added to every result (128 gives the gray base of the emboss)
 * @returns {Image_data}
 */
function convolve3(image, kernel, offset) {
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			for (let c = 0; c < 3; c++) {
				let sum = 0;
				for (let ky = -1; ky <= 1; ky++) {
					const yy = clamp(y + ky, 0, h - 1);
					for (let kx = -1; kx <= 1; kx++) {
						sum += kernel[(ky + 1) * 3 + kx + 1] * src[(yy * w + clamp(x + kx, 0, w - 1)) * 4 + c];
					}
				}
				data[(y * w + x) * 4 + c] = clamp(Math.round(sum + offset), 0, 255);
			}
		}
	}
	return image;
}

/**
 * Emboss - the image turns into a gray relief lit from the given direction
 *
 * @param {Image_data} image
 * @param {object} params keys: angle (0-360 degrees, where the light comes from), amount (1-500 %)
 * @returns {Image_data}
 */
export function emboss(image, params) {
	const angle = (parseFloat(params.angle) || 0) * Math.PI / 180;
	const amount = clamp(parseFloat(params.amount ?? 100) || 0, 1, 500) / 100;
	//the gradient along the direction of the light (y goes down)
	const dx = Math.cos(angle) * amount;
	const dy = -Math.sin(angle) * amount;
	const kernel = [
		-dx - dy, -dy, dx - dy,
		-dx, 0, dx,
		-dx + dy, dy, dx + dy,
	].map((value) => { return value / 2; });
	desaturate_in_place(image);
	return convolve3(image, kernel, 128);
}

/**
 * Find Edges - bright lines on a white background where the colors change (Sobel operator)
 *
 * @param {Image_data} image
 * @returns {Image_data}
 */
export function findEdges(image) {
	let y, x, c;
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	for (y = 0; y < h; y++) {
		for (x = 0; x < w; x++) {
			const index = (y * w + x) * 4;
			for (c = 0; c < 3; c++) {
				const p = function (dx, dy) {
					return src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c];
				};
				const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
				const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
				data[index + c] = clamp(Math.round(255 - Math.hypot(gx, gy)), 0, 255);
			}
		}
	}
	return image;
}

function desaturate_in_place(image) {
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
		data[i] = data[i + 1] = data[i + 2] = gray;
	}
}

/**
 * Surface Blur - smooths the flat areas but keeps the edges: a neighbor counts only as much as its color is close
 * to the color of the pixel (bilateral filter).
 *
 * @param {Image_data} image
 * @param {object} params radius (1-10 pixels), threshold (1-255, how different colors still get mixed)
 * @returns {Image_data}
 */
export function surfaceBlur(image, params) {
	const radius = clamp(parseInt(params.radius ?? 3) || 3, 1, 10);
	const threshold = clamp(parseFloat(params.threshold ?? 30) || 30, 1, 255);
	const w = image.width;
	const h = image.height;
	const src = new Uint8ClampedArray(image.data);
	const data = image.data;
	//big radii look at every second neighbor, it is enough for a blur
	const step = radius > 5 ? 2 : 1;
	const limit = threshold * 3;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
			let sum_r = 0, sum_g = 0, sum_b = 0, total = 0;
			for (let dy = -radius; dy <= radius; dy++) {
				if (dy % step != 0) {
					continue;
				}
				const yy = clamp(y + dy, 0, h - 1);
				for (let dx = -radius; dx <= radius; dx++) {
					if (dx % step != 0) {
						continue;
					}
					const j = (yy * w + clamp(x + dx, 0, w - 1)) * 4;
					const difference = Math.abs(src[j] - r0) + Math.abs(src[j + 1] - g0) + Math.abs(src[j + 2] - b0);
					if (difference >= limit) {
						continue;
					}
					const weight = 1 - difference / limit;
					sum_r += src[j] * weight;
					sum_g += src[j + 1] * weight;
					sum_b += src[j + 2] * weight;
					total += weight;
				}
			}
			//the pixel itself always has weight 1, so total is never 0
			data[i] = sum_r / total;
			data[i + 1] = sum_g / total;
			data[i + 2] = sum_b / total;
		}
	}
	return image;
}
