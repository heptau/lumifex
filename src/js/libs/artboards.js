/**
 * Artboards (Photoshop, simplified): named rectangles inside the document, drawn as frames with their names and exported
 * each to its own file. They do not own layers - an artboard shows whatever lies inside its rectangle. Pure functions.
 *
 * @typedef {{id: number, name: string, x: number, y: number, width: number, height: number}} Artboard
 */
import { safe_layer_name } from './export-names.js';

export const MAX_ARTBOARDS = 100;

//sizes offered for a new artboard (Photoshop presets, pixels)
export const ARTBOARD_PRESETS = {
	'Custom': null,
	'iPhone 15 (393 x 852)': [393, 852],
	'iPad (820 x 1180)': [820, 1180],
	'Web 1280 x 800': [1280, 800],
	'Web 1920 x 1080': [1920, 1080],
	'Instagram Post (1080 x 1080)': [1080, 1080],
	'Instagram Story (1080 x 1920)': [1080, 1920],
	'A4 at 72 dpi (595 x 842)': [595, 842],
};

function finite(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {*} list from a project file
 * @returns {Artboard[]}
 */
export function clean_artboards(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	const ids = new Set();
	const result = [];
	for (const item of list.slice(0, MAX_ARTBOARDS)) {
		if (!item || !Number.isInteger(item.id) || item.id < 1 || ids.has(item.id)) {
			continue;
		}
		if (![item.x, item.y, item.width, item.height].every(finite) || item.width < 1 || item.height < 1) {
			continue;
		}
		ids.add(item.id);
		result.push({
			id: item.id,
			name: String(item.name || `Artboard ${item.id}`).slice(0, 100),
			x: Math.round(item.x),
			y: Math.round(item.y),
			width: Math.round(Math.min(30000, item.width)),
			height: Math.round(Math.min(30000, item.height)),
		});
	}
	return result;
}

/**
 * @param {Artboard[]} list
 * @param {object} rect {x, y, width, height}
 * @param {string} [name]
 * @returns {Artboard[]} a new list with the new artboard at the end
 */
export function add_artboard(list, rect, name) {
	const id = list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
	return list.concat(clean_artboards([{id, name: name || `Artboard ${id}`, x: rect.x, y: rect.y, width: rect.width, height: rect.height}]));
}

/**
 * @returns {{x: number, y: number}} where the next artboard goes: right of the others with a gap (Photoshop)
 */
export function next_artboard_place(list, gap = 100) {
	if (!list.length) {
		return {x: 0, y: 0};
	}
	const right = Math.max(...list.map((item) => item.x + item.width));
	const top = Math.min(...list.map((item) => item.y));
	return {x: right + gap, y: top};
}

/**
 * @returns {{width: number, height: number}} the document size that holds all artboards (never smaller than now)
 */
export function canvas_for_artboards(list, width, height) {
	let w = width;
	let h = height;
	for (const item of list) {
		w = Math.max(w, item.x + item.width);
		h = Math.max(h, item.y + item.height);
	}
	return {width: Math.ceil(w), height: Math.ceil(h)};
}

/**
 * @returns {string[]} file names for the export: the names made safe, repeated names numbered
 */
export function artboard_file_names(list) {
	const used = {};
	return list.map((item) => {
		const base = safe_layer_name(item.name) || `artboard-${item.id}`;
		used[base] = (used[base] || 0) + 1;
		return `${used[base] > 1 ? `${base}-${used[base]}` : base}.png`;
	});
}

/**
 * Frames and names of the artboards (document coordinates, called from the overlay)
 */
export function draw_artboards(ctx, list, zoom) {
	const scale = 1 / (zoom || 1);
	ctx.save();
	ctx.font = `${11 * scale}px -apple-system, "Segoe UI", sans-serif`;
	ctx.textBaseline = 'top';
	for (const item of list) {
		ctx.lineWidth = scale;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.strokeRect(item.x, item.y, item.width, item.height);
		//the name in the top left corner inside the frame (outside it would be cut off by the canvas)
		const pad = 3 * scale;
		const width = ctx.measureText(item.name).width + pad * 2;
		ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.fillRect(item.x, item.y, width, 11 * scale + pad * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(item.name, item.x + pad, item.y + pad);
	}
	ctx.restore();
}
