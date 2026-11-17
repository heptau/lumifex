/**
 * Type on a Path: the letters of a text layer are placed one by one along the path of a Pen layer. Pure functions,
 * no DOM; the drawing is done by the Text tool (tools/text.js).
 *
 * The text layer keeps a copy of the path in `params.path` (anchors of libs/pen-path.js in document pixels at the time
 * it was made), `params.path_closed`, `params.path_offset` (where the text starts, % of the length of the path) and
 * `params.path_origin` (the position of the layer at that time - moving the layer moves the path with it).
 *
 * @typedef {{x: number, y: number}} Point
 * @typedef {{points: Point[], lengths: number[], total: number, closed: boolean}} Measured_path
 * @typedef {{index: number, x: number, y: number, angle: number}} Placed_glyph
 */
import { clean_anchors, flatten_path } from './pen-path.js';

//letters of a text on a path (longer texts are cut)
export const MAX_PATH_GLYPHS = 5000;
//coordinates far outside any document are not accepted from a file
const MAX_COORDINATE = 1000000;

/**
 * @param {any} value
 * @param {number} fallback
 * @returns {number} a finite number within the limits
 */
function finite(value, fallback) {
	const number = Number(value);
	if (!isFinite(number) || Math.abs(number) > MAX_COORDINATE) {
		return fallback;
	}
	return number;
}

/**
 * @param {any} value
 * @returns {number} the start offset in % (0-100), 0 for anything else
 */
export function clean_offset(value) {
	const number = parseFloat(value);
	if (!isFinite(number)) {
		return 0;
	}
	return Math.min(100, Math.max(0, number));
}

/**
 * The path of a text layer from its params; the params can come from a saved project, so everything is checked.
 *
 * @param {any} params layer.params
 * @returns {{anchors: import('./pen-path.js').Anchor[], closed: boolean, offset: number, origin: Point}|null}
 *   null when the layer has no (usable) path
 */
export function clean_text_path(params) {
	if (!params || !Array.isArray(params.path)) {
		return null;
	}
	const in_range = (p) => p == null || (Math.abs(p.x) <= MAX_COORDINATE && Math.abs(p.y) <= MAX_COORDINATE);
	const anchors = clean_anchors(params.path).filter((a) => in_range(a) && in_range(a.in) && in_range(a.out));
	if (anchors.length < 2) {
		return null;
	}
	const origin = params.path_origin || {};
	return {
		anchors,
		closed: params.path_closed === true,
		offset: clean_offset(params.path_offset),
		origin: {x: finite(origin.x, 0), y: finite(origin.y, 0)},
	};
}

/**
 * The path cut into short straight pieces with the length along it at every point.
 *
 * @param {import('./pen-path.js').Anchor[]} anchors
 * @param {boolean} closed
 * @returns {Measured_path}
 */
export function measure_path(anchors, closed) {
	const points = flatten_path(anchors, closed, 32);
	if (closed && points.length > 1) {
		points.push({x: points[0].x, y: points[0].y});
	}
	const lengths = [0];
	for (let i = 1; i < points.length; i++) {
		lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
	}
	return {points, lengths, total: lengths[lengths.length - 1] || 0, closed: closed === true};
}

/**
 * The point at a distance along the path and the direction of the path there (radians, 0 = to the right).
 * A closed path goes round, an open one stops at its ends.
 *
 * @param {Measured_path} path
 * @param {number} distance
 * @returns {{x: number, y: number, angle: number}|null}
 */
export function point_at(path, distance) {
	const {points, lengths, total} = path;
	if (points.length < 2 || !(total > 0)) {
		return null;
	}
	let d = distance;
	if (path.closed) {
		d = ((d % total) + total) % total;
	}
	d = Math.min(total, Math.max(0, d));
	//the piece that holds the distance (binary search)
	let low = 0;
	let high = lengths.length - 1;
	while (high - low > 1) {
		const middle = (low + high) >> 1;
		if (lengths[middle] <= d) {
			low = middle;
		}
		else {
			high = middle;
		}
	}
	//pieces of zero length (two equal points) have no direction: the nearest real piece is taken
	let a = low;
	let b = high;
	while (b < points.length - 1 && lengths[b] - lengths[a] <= 0) {
		b++;
	}
	while (a > 0 && lengths[b] - lengths[a] <= 0) {
		a--;
	}
	const piece = lengths[b] - lengths[a];
	const t = piece > 0 ? Math.min(1, Math.max(0, (d - lengths[a]) / piece)) : 0;
	const p = points[a];
	const q = points[b];
	return {
		x: p.x + (q.x - p.x) * t,
		y: p.y + (q.y - p.y) * t,
		angle: Math.atan2(q.y - p.y, q.x - p.x),
	};
}

/**
 * Places letters along the path: the center of every letter lies on the path and the letter is turned along it.
 * Letters that do not fit (past the end of an open path, or once round a closed one) are left out, like in Photoshop.
 *
 * @param {number[]} advances the width of every letter including the extra spacing (kerning)
 * @param {Measured_path} path
 * @param {number} offset where the first letter starts, % of the length of the path
 * @returns {Placed_glyph[]}
 */
export function layout_on_path(advances, path, offset) {
	/** @type {Placed_glyph[]} */
	const result = [];
	if (!(path.total > 0)) {
		return result;
	}
	const start = clean_offset(offset) / 100 * path.total;
	let position = start;
	const count = Math.min(advances.length, MAX_PATH_GLYPHS);
	for (let i = 0; i < count; i++) {
		const advance = Math.max(0, Number(advances[i]) || 0);
		const center = position + advance / 2;
		if (path.closed ? center - start > path.total : center > path.total) {
			break;
		}
		const point = point_at(path, center);
		if (point) {
			result.push({index: i, x: point.x, y: point.y, angle: point.angle});
		}
		position += advance;
	}
	return result;
}

/**
 * The letters of the text with their style: lines are joined by a space (a text on a path has one line).
 *
 * @param {Array<Array<{text: string, meta: object}>>|null} data layer.data
 * @returns {{char: string, meta: object}[]}
 */
export function path_glyphs(data) {
	/** @type {{char: string, meta: object}[]} */
	const result = [];
	if (!Array.isArray(data)) {
		return result;
	}
	let last_meta = {};
	data.forEach((line, line_index) => {
		if (!Array.isArray(line)) {
			return;
		}
		if (line_index > 0 && result.length > 0) {
			result.push({char: ' ', meta: last_meta});
		}
		line.forEach((span) => {
			const meta = span && span.meta && typeof span.meta == 'object' ? span.meta : {};
			Array.from(String(span && span.text != null ? span.text : '')).forEach((char) => {
				if (result.length < MAX_PATH_GLYPHS) {
					result.push({char, meta});
				}
			});
			last_meta = meta;
		});
	});
	return result.slice(0, MAX_PATH_GLYPHS);
}

/**
 * The anchors of a Pen layer in document pixels (the layer may have been stretched by its handles).
 *
 * @param {{x: number, y: number, width: number, height: number, width_original?: number, height_original?: number, data: any}} layer
 * @returns {import('./pen-path.js').Anchor[]}
 */
export function pen_layer_anchors(layer) {
	const scale_x = layer.width_original ? layer.width / layer.width_original : 1;
	const scale_y = layer.height_original ? layer.height / layer.height_original : 1;
	const point = (p) => (p ? {x: layer.x + p.x * scale_x, y: layer.y + p.y * scale_y} : null);
	return clean_anchors(layer.data).map((a) => ({x: layer.x + a.x * scale_x, y: layer.y + a.y * scale_y, in: point(a.in), out: point(a.out)}));
}

/**
 * The frame of a text on a path: the bounds of the path grown by the size of the letters.
 *
 * @param {import('./pen-path.js').Anchor[]} anchors
 * @param {boolean} closed
 * @param {number} size the largest font size
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function text_path_bounds(anchors, closed, size) {
	const points = flatten_path(anchors, closed, 32);
	let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
	points.forEach((p) => {
		min_x = Math.min(min_x, p.x);
		min_y = Math.min(min_y, p.y);
		max_x = Math.max(max_x, p.x);
		max_y = Math.max(max_y, p.y);
	});
	if (points.length == 0) {
		return {x: 0, y: 0, width: 1, height: 1};
	}
	const margin = Math.max(1, Math.ceil(Number(size) || 0));
	const x = Math.floor(min_x - margin);
	const y = Math.floor(min_y - margin);
	return {x, y, width: Math.max(1, Math.ceil(max_x + margin) - x), height: Math.max(1, Math.ceil(max_y + margin) - y)};
}
