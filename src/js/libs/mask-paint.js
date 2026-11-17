/**
 * Painting into a layer mask with the ordinary tools (Photoshop: the mask thumbnail is the target). Black hides,
 * white reveals, gray is partly visible. Pure functions over masks {data: Uint8ClampedArray, width, height}
 * (one byte per pixel, 255 = visible).
 */

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/**
 * @param {string} color '#rrggbb' or '#rgb'
 * @returns {number} 0-255, the brightness of the color (black = 0 hides, white = 255 reveals)
 */
export function mask_value_of_color(color) {
	let hex = String(color || '').trim().replace(/^#/, '');
	if (/^[0-9a-f]{3}$/i.test(hex)) {
		hex = hex.split('').map((c) => c + c).join('');
	}
	if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
		return 0;
	}
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * One round dab that moves the mask towards `value`.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask modified in place
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} softness 0-1 (0 = hard edge)
 * @param {number} value 0-255 target value
 * @param {number} [opacity] 0-1
 * @returns {{x: number, y: number, width: number, height: number}|null} changed area
 */
export function paint_value_stamp(mask, cx, cy, radius, softness, value, opacity = 1) {
	radius = Math.max(0.5, Number(radius) || 0.5);
	softness = clamp(Number(softness) || 0, 0, 1);
	opacity = clamp(Number.isFinite(Number(opacity)) ? Number(opacity) : 1, 0, 1);
	value = clamp(Number(value) || 0, 0, 255);
	if (cx + radius < 0 || cy + radius < 0 || cx - radius > mask.width || cy - radius > mask.height) {
		return null;
	}
	const inner = radius * (1 - softness);
	const left = clamp(Math.floor(cx - radius), 0, mask.width - 1);
	const right = clamp(Math.ceil(cx + radius), 0, mask.width - 1);
	const top = clamp(Math.floor(cy - radius), 0, mask.height - 1);
	const bottom = clamp(Math.ceil(cy + radius), 0, mask.height - 1);
	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
			if (d > radius) {
				continue;
			}
			const a = (d <= inner || radius <= inner ? 1 : (radius - d) / (radius - inner)) * opacity;
			const i = y * mask.width + x;
			mask.data[i] = mask.data[i] + (value - mask.data[i]) * a;
		}
	}
	return {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

/**
 * Dabs along a line (spacing a third of the radius).
 *
 * @returns {{x: number, y: number, width: number, height: number}|null} union of the changed areas
 */
export function paint_value_line(mask, from, to, radius, softness, value, opacity = 1) {
	const distance = Math.hypot(to.x - from.x, to.y - from.y);
	const spacing = Math.max(1, radius / 3);
	const steps = Math.max(1, Math.ceil(distance / spacing));
	let dirty = null;
	//the first dab of a line was already made by the previous line, except for the very first one
	for (let s = 0; s <= steps; s++) {
		const t = s / steps;
		const rect = paint_value_stamp(mask, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, softness, value, opacity);
		if (rect == null) {
			continue;
		}
		dirty = dirty == null ? rect : union_rect(dirty, rect);
	}
	return dirty;
}

function union_rect(a, b) {
	const x0 = Math.min(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const x1 = Math.max(a.x + a.width, b.x + b.width);
	const y1 = Math.max(a.y + a.height, b.y + b.height);
	return {x: x0, y: y0, width: x1 - x0, height: y1 - y0};
}

/**
 * Fills the mask with a value, optionally only where `weights` (0-255 per mask pixel, e.g. the selection) allow.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask modified in place
 * @param {number} value 0-255
 * @param {Uint8ClampedArray|Uint8Array|null} [weights] the same size as the mask
 * @param {number} [opacity] 0-1
 */
export function fill_mask_value(mask, value, weights, opacity = 1) {
	value = clamp(Number(value) || 0, 0, 255);
	opacity = clamp(Number.isFinite(Number(opacity)) ? Number(opacity) : 1, 0, 1);
	for (let i = 0; i < mask.data.length; i++) {
		const a = (weights ? weights[i] / 255 : 1) * opacity;
		if (a > 0) {
			mask.data[i] = mask.data[i] + (value - mask.data[i]) * a;
		}
	}
	return mask;
}

/**
 * A gradient from `from` (value `start`) to `to` (value `end`) painted into the mask.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask modified in place
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} start 0-255
 * @param {number} end 0-255
 * @param {'linear'|'radial'|'reflected'} [shape]
 * @param {Uint8ClampedArray|Uint8Array|null} [weights] the selection, 0-255 per mask pixel
 */
export function gradient_mask(mask, from, to, start, end, shape = 'linear', weights = null) {
	start = clamp(Number(start) || 0, 0, 255);
	end = clamp(Number(end) || 0, 0, 255);
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length2 = dx * dx + dy * dy;
	const length = Math.sqrt(length2);
	for (let y = 0; y < mask.height; y++) {
		for (let x = 0; x < mask.width; x++) {
			const px = x + 0.5 - from.x;
			const py = y + 0.5 - from.y;
			let t;
			if (length2 === 0) {
				t = 1;
			}
			else if (shape === 'radial') {
				t = Math.hypot(px, py) / length;
			}
			else {
				t = (px * dx + py * dy) / length2;
				if (shape === 'reflected') {
					t = Math.abs(t);
				}
			}
			t = clamp(t, 0, 1);
			const value = start + (end - start) * t;
			const i = y * mask.width + x;
			const a = weights ? weights[i] / 255 : 1;
			mask.data[i] = mask.data[i] + (value - mask.data[i]) * a;
		}
	}
	return mask;
}

/**
 * The size of a thumbnail that keeps the aspect ratio of the document inside a box.
 *
 * @returns {{width: number, height: number}} whole pixels, at least 1
 */
export function thumbnail_size(width, height, box_width, box_height) {
	width = Math.max(1, Number(width) || 1);
	height = Math.max(1, Number(height) || 1);
	const scale = Math.min(box_width / width, box_height / height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/**
 * RGBA pixels showing the mask: gray (view the mask alone) or a translucent red overlay over hidden parts
 * (Photoshop "\" - the rubylith).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask
 * @param {'gray'|'overlay'} kind
 * @returns {Uint8ClampedArray} width * height * 4
 */
export function mask_to_rgba(mask, kind) {
	const out = new Uint8ClampedArray(mask.width * mask.height * 4);
	for (let p = 0, i = 0; p < mask.data.length; p++, i += 4) {
		const v = mask.data[p];
		if (kind === 'overlay') {
			out[i] = 255;
			out[i + 3] = Math.round((255 - v) * 0.5);
		}
		else {
			out[i] = out[i + 1] = out[i + 2] = v;
			out[i + 3] = 255;
		}
	}
	return out;
}

/**
 * The selection (a document-sized mask) resampled into the pixels of a layer mask, as weights for fills.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} selection document-sized, 255 = selected
 * @param {{x: number, y: number, width: number, height: number}} layer unrotated layer rectangle in the document
 * @param {number} width of the layer mask
 * @param {number} height of the layer mask
 * @returns {Uint8ClampedArray}
 */
export function selection_weights(selection, layer, width, height) {
	const out = new Uint8ClampedArray(width * height);
	const sx = layer.width / width;
	const sy = layer.height / height;
	for (let y = 0; y < height; y++) {
		const dy = Math.floor(layer.y + (y + 0.5) * sy);
		if (dy < 0 || dy >= selection.height) {
			continue;
		}
		for (let x = 0; x < width; x++) {
			const dx = Math.floor(layer.x + (x + 0.5) * sx);
			if (dx < 0 || dx >= selection.width) {
				continue;
			}
			out[y * width + x] = selection.data[dy * selection.width + dx];
		}
	}
	return out;
}
