/**
 * Image > Apply Image and Image > Calculations (Photoshop) - pure functions over ImageData-like objects
 * ({data, width, height}, RGBA not premultiplied) and gray channels (Uint8ClampedArray, one byte per pixel), no DOM.
 */
import { blend_channel, CUSTOM_BLEND } from './custom-blend.js';

/** The blending modes of Apply Image / Calculations (separable ones only, as in Photoshop): id -> label */
export const APPLY_MODES = [
	['normal', 'Normal'],
	['darken', 'Darken'],
	['multiply', 'Multiply'],
	['color-burn', 'Color Burn'],
	['linear-burn', 'Linear Burn'],
	['lighten', 'Lighten'],
	['screen', 'Screen'],
	['color-dodge', 'Color Dodge'],
	['add', 'Add'],
	['overlay', 'Overlay'],
	['soft-light', 'Soft Light'],
	['hard-light', 'Hard Light'],
	['vivid-light', 'Vivid Light'],
	['linear-light', 'Linear Light'],
	['pin-light', 'Pin Light'],
	['hard-mix', 'Hard Mix'],
	['difference', 'Difference'],
	['exclusion', 'Exclusion'],
	['subtract', 'Subtract'],
	['divide', 'Divide'],
];

/** The channels a source can give: id -> label */
export const APPLY_CHANNELS = [
	['rgb', 'RGB'],
	['red', 'Red'],
	['green', 'Green'],
	['blue', 'Blue'],
	['gray', 'Gray'],
	['alpha', 'Transparency'],
];

const CUSTOM_OF = {
	'linear-burn': CUSTOM_BLEND.linear_burn,
	'vivid-light': CUSTOM_BLEND.vivid_light,
	'linear-light': CUSTOM_BLEND.linear_light,
	'pin-light': CUSTOM_BLEND.pin_light,
	'hard-mix': CUSTOM_BLEND.hard_mix,
	'subtract': CUSTOM_BLEND.subtract,
	'divide': CUSTOM_BLEND.divide,
};

/**
 * @param {*} mode
 * @returns {string} a known mode, otherwise 'normal'
 */
export function clean_apply_mode(mode) {
	return APPLY_MODES.some((item) => item[0] === mode) ? mode : 'normal';
}

/**
 * @param {*} channel
 * @returns {string} a known channel, otherwise 'rgb'
 */
export function clean_apply_channel(channel) {
	return APPLY_CHANNELS.some((item) => item[0] === channel) ? channel : 'rgb';
}

function soft_light(b, s) {
	//W3C soft-light, values 0-1
	if (s <= 0.5) {
		return b - (1 - 2 * s) * b * (1 - b);
	}
	const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
	return b + (2 * s - 1) * (d - b);
}

function hard_light(b, s) {
	return s <= 127.5 ? 2 * b * s / 255 : 255 - 2 * (255 - b) * (255 - s) / 255;
}

/**
 * One channel of a blend, 0-255 integers
 *
 * @param {string} mode an id of APPLY_MODES
 * @param {number} b the target (backdrop)
 * @param {number} s the source
 * @returns {number} 0-255
 */
export function blend_value(mode, b, s) {
	switch (mode) {
		case 'darken':
			return Math.min(b, s);
		case 'multiply':
			return b * s / 255;
		case 'color-burn':
			if (b >= 255) {
				return 255;
			}
			return s <= 0 ? 0 : Math.max(0, 255 - (255 - b) * 255 / s);
		case 'lighten':
			return Math.max(b, s);
		case 'screen':
			return 255 - (255 - b) * (255 - s) / 255;
		case 'color-dodge':
			if (b <= 0) {
				return 0;
			}
			return s >= 255 ? 255 : Math.min(255, b * 255 / (255 - s));
		case 'add':
			return Math.min(255, b + s);
		case 'overlay':
			return hard_light(s, b);
		case 'soft-light':
			return 255 * soft_light(b / 255, s / 255);
		case 'hard-light':
			return hard_light(b, s);
		case 'difference':
			return Math.abs(b - s);
		case 'exclusion':
			return b + s - 2 * b * s / 255;
		default:
			if (CUSTOM_OF[mode]) {
				return blend_channel(CUSTOM_OF[mode], b, s);
			}
			return s;
	}
}

const tables = new Map();

/**
 * @param {string} mode
 * @returns {Uint8ClampedArray} 256 x 256, index = target * 256 + source
 */
function blend_table(mode) {
	let table = tables.get(mode);
	if (!table) {
		table = new Uint8ClampedArray(65536);
		for (let b = 0; b < 256; b++) {
			for (let s = 0; s < 256; s++) {
				table[b * 256 + s] = Math.round(blend_value(mode, b, s));
			}
		}
		tables.set(mode, table);
	}
	return table;
}

/**
 * A gray channel of a picture: red / green / blue / gray (luminosity) multiplied by the alpha (a transparent
 * place is black, as in a channel of Photoshop), or the alpha itself
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {string} channel an id of APPLY_CHANNELS except 'rgb' (which gives gray)
 * @returns {Uint8ClampedArray}
 */
export function extract_channel(img, channel) {
	const count = img.width * img.height;
	const out = new Uint8ClampedArray(count);
	const data = img.data;
	for (let p = 0, i = 0; p < count; p++, i += 4) {
		const alpha = data[i + 3];
		let value;
		if (channel == 'alpha') {
			value = alpha;
		}
		else {
			if (channel == 'red') {
				value = data[i];
			}
			else if (channel == 'green') {
				value = data[i + 1];
			}
			else if (channel == 'blue') {
				value = data[i + 2];
			}
			else {
				value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
			}
			value = value * alpha / 255;
		}
		out[p] = Math.round(value);
	}
	return out;
}

/**
 * Image > Apply Image: blends a source picture of the same size into the target. The source gives its colors
 * (RGB) or one channel used for all three colors; it counts with its own alpha (a transparent place of the source
 * changes nothing), except the Transparency channel. The alpha of the target is kept. The target is changed in place.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} target
 * @param {{data: Uint8ClampedArray, width: number, height: number}} source
 * @param {{channel?: string, invert?: boolean, mode?: string, opacity?: number}} options
 * @returns {object} target
 */
export function apply_image(target, source, options = {}) {
	if (!source || source.width != target.width || source.height != target.height) {
		return target;
	}
	const channel = clean_apply_channel(options.channel);
	const table = blend_table(clean_apply_mode(options.mode));
	const opacity = Math.min(100, Math.max(0, Number(options.opacity) || 0)) / 100;
	const invert = options.invert === true;
	const gray = channel == 'rgb' ? null : extract_channel(source, channel);
	const t = target.data;
	const s = source.data;
	for (let p = 0, i = 0; i < t.length; p++, i += 4) {
		const weight = opacity * (gray ? (channel == 'alpha' ? 1 : (s[i + 3] > 0 ? 1 : 0)) : s[i + 3] / 255);
		if (weight <= 0) {
			continue;
		}
		for (let c = 0; c < 3; c++) {
			let value = gray ? gray[p] : s[i + c];
			if (invert) {
				value = 255 - value;
			}
			const b = t[i + c];
			const blended = table[b * 256 + value];
			t[i + c] = Math.round(b + (blended - b) * weight);
		}
	}
	return target;
}

/**
 * Image > Calculations: source 1 blended over source 2 (both gray channels of the same length)
 *
 * @param {Uint8ClampedArray} first
 * @param {Uint8ClampedArray} second the backdrop
 * @param {{mode?: string, opacity?: number, invert_first?: boolean, invert_second?: boolean}} options
 * @returns {Uint8ClampedArray} a new channel
 */
export function calculations(first, second, options = {}) {
	const length = Math.min(first.length, second.length);
	const out = new Uint8ClampedArray(length);
	const table = blend_table(clean_apply_mode(options.mode));
	const opacity = Math.min(100, Math.max(0, Number(options.opacity) || 0)) / 100;
	for (let p = 0; p < length; p++) {
		const s = options.invert_first === true ? 255 - first[p] : first[p];
		const b = options.invert_second === true ? 255 - second[p] : second[p];
		out[p] = Math.round(b + (table[b * 256 + s] - b) * opacity);
	}
	return out;
}
