/**
 * Alpha channels of a document (Photoshop: Channels panel > Save Selection as Channel) - pure helpers.
 * A channel is `{id, name, width, height, values, counts}`: a selection mask of the document size, run-length
 * encoded like a layer mask (255 = selected). The list lives in `config.alpha_channels`, is saved in the project
 * JSON (`info.alpha_channels`) and every change goes through `Set_alpha_channels_action`.
 */
import { rle_encode, rle_decode } from './selection-store.js';

/**
 * @typedef {{id: number, name: string, width: number, height: number, values: number[], counts: number[]}} AlphaChannel
 */

export const MAX_ALPHA_CHANNELS = 50;
const MAX_PIXELS = 64 * 1000 * 1000;
const MAX_NAME = 100;

/**
 * @param {*} name
 * @param {string} fallback
 * @returns {string}
 */
function clean_name(name, fallback) {
	// eslint-disable-next-line no-control-regex
	const text = (typeof name == 'string' ? name : '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	return text.slice(0, MAX_NAME).trim() || fallback;
}

/**
 * The next default name "Alpha N" (one more than the highest number used by such a name)
 *
 * @param {{name: string}[]|null|undefined} list
 * @param {string} word the translated word "Alpha"
 */
export function next_channel_name(list, word = 'Alpha') {
	let highest = 0;
	const prefix = `${word} `;
	for (const item of list || []) {
		if (item && typeof item.name == 'string' && item.name.startsWith(prefix)) {
			const number = Number(item.name.slice(prefix.length));
			if (Number.isInteger(number) && number > highest) {
				highest = number;
			}
		}
	}
	return `${word} ${highest + 1}`;
}

/**
 * Validates a list from a project file (a file can contain anything): unique positive integer ids, a name,
 * a size up to 64 Mpx and run-length data that decodes to exactly width x height bytes; invalid entries are left out
 *
 * @param {*} list
 * @returns {AlphaChannel[]}
 */
export function clean_alpha_channels(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	const ids = new Set();
	const result = [];
	for (const item of list) {
		if (result.length >= MAX_ALPHA_CHANNELS) {
			break;
		}
		if (!item || typeof item != 'object' || !Number.isInteger(item.id) || item.id < 1 || ids.has(item.id)) {
			continue;
		}
		const width = item.width;
		const height = item.height;
		if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
			continue;
		}
		if (!Array.isArray(item.values) || !Array.isArray(item.counts) || item.values.length != item.counts.length) {
			continue;
		}
		let total = 0;
		let valid = true;
		for (let i = 0; i < item.values.length; i++) {
			const value = item.values[i];
			const count = item.counts[i];
			if (!Number.isInteger(value) || value < 0 || value > 255 || !Number.isInteger(count) || count < 1) {
				valid = false;
				break;
			}
			total += count;
		}
		if (!valid || total != width * height) {
			continue;
		}
		ids.add(item.id);
		result.push({
			id: item.id,
			name: clean_name(item.name, `Alpha ${item.id}`),
			width,
			height,
			values: item.values.slice(),
			counts: item.counts.slice(),
		});
	}
	return result;
}

/**
 * @param {AlphaChannel[]|null|undefined} list
 * @param {{width: number, height: number, data: Uint8ClampedArray}} mask
 * @param {string} name
 * @returns {{list: AlphaChannel[], channel: AlphaChannel}|null} a new list with the channel at the end; null when full
 */
export function add_channel(list, mask, name) {
	const current = list || [];
	if (current.length >= MAX_ALPHA_CHANNELS || !mask || !(mask.width > 0) || !(mask.height > 0)) {
		return null;
	}
	const id = current.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
	const rle = rle_encode(mask.data);
	const channel = {
		id,
		name: clean_name(name, `Alpha ${id}`),
		width: mask.width,
		height: mask.height,
		values: Array.from(rle.values),
		counts: Array.from(rle.counts),
	};
	return {list: current.concat([channel]), channel};
}

/**
 * @param {AlphaChannel[]} list
 * @param {number} id
 * @param {{width: number, height: number, data: Uint8ClampedArray}} mask
 * @returns {AlphaChannel[]} a new list where the channel of the id holds the new mask (name and id are kept)
 */
export function replace_channel(list, id, mask) {
	const rle = rle_encode(mask.data);
	return (list || []).map((item) => (item.id === id ? Object.assign({}, item, {
		width: mask.width,
		height: mask.height,
		values: Array.from(rle.values),
		counts: Array.from(rle.counts),
	}) : item));
}

/**
 * @param {AlphaChannel[]} list
 * @param {number} id
 * @returns {AlphaChannel[]}
 */
export function remove_channel(list, id) {
	return (list || []).filter((item) => item.id !== id);
}

/**
 * @param {AlphaChannel[]} list
 * @param {number} id
 * @param {string} name
 * @returns {AlphaChannel[]}
 */
export function rename_channel(list, id, name) {
	return (list || []).map((item) => (item.id === id ? Object.assign({}, item, {name: clean_name(name, item.name)}) : item));
}

/**
 * The mask of a channel at the size of the document: a channel saved before the document was resized is
 * stretched (nearest pixel), like the masks of groups
 *
 * @param {AlphaChannel|null|undefined} channel
 * @param {number} width
 * @param {number} height
 * @returns {{width: number, height: number, data: Uint8ClampedArray}|null}
 */
export function channel_to_mask(channel, width, height) {
	if (!channel) {
		return null;
	}
	const data = rle_decode(Uint8Array.from(channel.values), Uint32Array.from(channel.counts), channel.width * channel.height);
	if (!data) {
		return null;
	}
	if (channel.width == width && channel.height == height) {
		return {width, height, data};
	}
	const out = new Uint8ClampedArray(width * height);
	for (let y = 0; y < height; y++) {
		const source_y = Math.min(channel.height - 1, Math.floor((y + 0.5) * channel.height / height));
		for (let x = 0; x < width; x++) {
			const source_x = Math.min(channel.width - 1, Math.floor((x + 0.5) * channel.width / width));
			out[y * width + x] = data[source_y * channel.width + source_x];
		}
	}
	return {width, height, data: out};
}
