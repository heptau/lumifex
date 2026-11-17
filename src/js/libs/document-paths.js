/**
 * Paths of the document (the Paths panel), the path selection tools and vector masks. A path is a list of anchors in the
 * format of the Pen tool (libs/pen-path.js): {x, y, in, out}, the handles are absolute points (null = a corner).
 * Document paths are in document pixels; a vector mask is in the coordinates of its layer (see below). Pure functions,
 * no DOM (a canvas context is only passed in).
 *
 * @typedef {{x: number, y: number}} Point
 * @typedef {{x: number, y: number, in: Point|null, out: Point|null}} Anchor
 * @typedef {{id: number, name: string, closed: boolean, anchors: Anchor[]}} Document_path
 * @typedef {{closed: boolean, anchors: Anchor[], width: number, height: number, invert: boolean}} Vector_mask
 *   anchors relative to the top left corner of the layer box when its size was width x height; the mask is stretched with
 *   the layer and turned with it (around the center of the layer), like a layer mask
 */
import { flatten_path, bounds_of } from './pen-path.js';

export const MAX_PATHS = 200;
export const MAX_PATH_ANCHORS = 10000;
const MAX_NAME = 100;
const LIMIT = 1e7; //coordinates beyond this are nonsense from a damaged file

/**
 * @param {any} value
 * @returns {Point|null}
 */
function clean_point(value) {
	if (value && typeof value == 'object' && isFinite(value.x) && isFinite(value.y)
		&& Math.abs(value.x) < LIMIT && Math.abs(value.y) < LIMIT) {
		return {x: Number(value.x), y: Number(value.y)};
	}
	return null;
}

/**
 * Anchors from a file can be anything: only valid points are kept, at most MAX_PATH_ANCHORS
 *
 * @param {any} data
 * @returns {Anchor[]}
 */
export function clean_path_anchors(data) {
	if (!Array.isArray(data)) {
		return [];
	}
	/** @type {Anchor[]} */
	const result = [];
	for (let i = 0; i < data.length && result.length < MAX_PATH_ANCHORS; i++) {
		const point = clean_point(data[i]);
		if (point) {
			result.push({x: point.x, y: point.y, in: clean_point(data[i].in), out: clean_point(data[i].out)});
		}
	}
	return result;
}

/**
 * @param {any} name
 * @returns {string}
 */
function clean_name(name) {
	const text = typeof name == 'string' ? Array.from(name).filter((c) => c.charCodeAt(0) >= 32).join('').trim() : '';
	return text.slice(0, MAX_NAME) || 'Path';
}

/**
 * The paths of a project file (info.paths): at most MAX_PATHS, unique positive ids, valid anchors
 *
 * @param {any} data
 * @returns {Document_path[]}
 */
export function clean_paths(data) {
	if (!Array.isArray(data)) {
		return [];
	}
	/** @type {Document_path[]} */
	const result = [];
	const used = new Set();
	for (let i = 0; i < data.length && result.length < MAX_PATHS; i++) {
		const item = data[i];
		if (!item || typeof item != 'object') {
			continue;
		}
		let id = parseInt(item.id, 10);
		if (!(id > 0) || used.has(id)) {
			id = 1;
			while (used.has(id)) {
				id++;
			}
		}
		used.add(id);
		result.push({id, name: clean_name(item.name), closed: item.closed === true, anchors: clean_path_anchors(item.anchors)});
	}
	return result;
}

/**
 * @param {Document_path[]} paths
 * @returns {number}
 */
export function next_path_id(paths) {
	return paths.reduce((max, path) => Math.max(max, path.id), 0) + 1;
}

/**
 * "Path 1", "Path 2"... the first number that is not used yet
 *
 * @param {Document_path[]} paths
 * @param {string} base the translated word
 * @returns {string}
 */
export function next_path_name(paths, base) {
	const names = new Set(paths.map((path) => path.name));
	let n = 1;
	while (names.has(`${base} ${n}`)) {
		n++;
	}
	return `${base} ${n}`;
}

/**
 * @param {Anchor[]} anchors
 * @param {function(Point): Point} transform
 * @returns {Anchor[]} a new list
 */
export function map_anchors(anchors, transform) {
	return anchors.map((a) => {
		const p = transform({x: a.x, y: a.y});
		return {
			x: p.x, y: p.y,
			in: a.in ? transform({x: a.in.x, y: a.in.y}) : null,
			out: a.out ? transform({x: a.out.x, y: a.out.y}) : null,
		};
	});
}

/**
 * @param {Anchor[]} anchors
 * @param {number} dx
 * @param {number} dy
 * @returns {Anchor[]} a moved copy
 */
export function translate_anchors(anchors, dx, dy) {
	return map_anchors(anchors, (p) => ({x: p.x + dx, y: p.y + dy}));
}

/**
 * @param {Anchor[]} anchors
 * @returns {Anchor[]} a deep copy
 */
export function copy_anchors(anchors) {
	return translate_anchors(anchors, 0, 0);
}

/**
 * The box of the drawn path (the curves, not their handles)
 *
 * @param {Anchor[]} anchors
 * @param {boolean} closed
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function path_bounds(anchors, closed) {
	return bounds_of(flatten_path(anchors, closed));
}

/**
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 * @returns {number}
 */
function distance_to_segment(p, a, b) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = dx * dx + dy * dy;
	let t = length == 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Even-odd test, the same rule as the selection from a path
 *
 * @param {Point[]} polygon
 * @param {Point} p
 * @returns {boolean}
 */
export function point_in_polygon(polygon, p) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Is the point on the line of the path (within the tolerance) or inside of a closed path?
 *
 * @param {Anchor[]} anchors
 * @param {boolean} closed
 * @param {Point} point
 * @param {number} tolerance
 * @returns {boolean}
 */
export function hit_outline(anchors, closed, point, tolerance) {
	if (anchors.length == 0) {
		return false;
	}
	const points = flatten_path(anchors, closed);
	if (points.length == 1) {
		return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= tolerance;
	}
	const count = closed ? points.length : points.length - 1;
	for (let i = 0; i < count; i++) {
		if (distance_to_segment(point, points[i], points[(i + 1) % points.length]) <= tolerance) {
			return true;
		}
	}
	return closed && points.length >= 3 && point_in_polygon(points, point);
}

/**
 * The path under the pointer: the last one in the list wins (it is drawn last)
 *
 * @param {Document_path[]} paths
 * @param {Point} point
 * @param {number} tolerance
 * @returns {number|null} the id
 */
export function pick_path(paths, point, tolerance) {
	for (let i = paths.length - 1; i >= 0; i--) {
		if (hit_outline(paths[i].anchors, paths[i].closed, point, tolerance)) {
			return paths[i].id;
		}
	}
	return null;
}

/**
 * Adds the path to the current path of a canvas context, with real Bezier curves (no flattening)
 *
 * @param {{moveTo: Function, lineTo: Function, bezierCurveTo: Function, closePath: Function}} ctx
 * @param {Anchor[]} anchors
 * @param {boolean} closed
 */
export function trace_path(ctx, anchors, closed) {
	if (anchors.length == 0) {
		return;
	}
	ctx.moveTo(anchors[0].x, anchors[0].y);
	const count = closed ? anchors.length : anchors.length - 1;
	for (let i = 0; i < count; i++) {
		const a = anchors[i];
		const b = anchors[(i + 1) % anchors.length];
		if (a.out == null && b.in == null) {
			ctx.lineTo(b.x, b.y);
		}
		else {
			const p1 = a.out || a;
			const p2 = b.in || b;
			ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, b.x, b.y);
		}
	}
	if (closed) {
		ctx.closePath();
	}
}

/**
 * The path of a Pen layer (`type: 'pen'`) in document pixels (the layer may be stretched by its handles)
 *
 * @param {{x: number, y: number, width: number, height: number, width_original?: number, height_original?: number, data: any}} layer
 * @returns {Anchor[]}
 */
export function pen_layer_anchors(layer) {
	const scale_x = layer.width_original ? layer.width / layer.width_original : 1;
	const scale_y = layer.height_original ? layer.height / layer.height_original : 1;
	return map_anchors(clean_path_anchors(layer.data), (p) => ({x: layer.x + p.x * scale_x, y: layer.y + p.y * scale_y}));
}

/**
 * The settings of a Pen layer for a path in document pixels: the box is fitted around the path and its stroke
 * (the same as the Pen tool does when it makes the layer)
 *
 * @param {Anchor[]} anchors document pixels
 * @param {boolean} closed
 * @param {number} size the width of the stroke
 * @returns {{x: number, y: number, width: number, height: number, width_original: number, height_original: number, data: Anchor[]}}
 */
export function pen_layer_geometry(anchors, closed, size) {
	const box = path_bounds(anchors, closed) || {x: 0, y: 0, width: 0, height: 0};
	const margin = Math.ceil((Number(size) || 1) / 2) + 2;
	const x = Math.floor(box.x - margin);
	const y = Math.floor(box.y - margin);
	const width = Math.max(1, Math.ceil(box.width + margin * 2));
	const height = Math.max(1, Math.ceil(box.height + margin * 2));
	return {
		x, y, width, height, width_original: width, height_original: height,
		data: translate_anchors(anchors, -x, -y),
	};
}

/**
 * @param {{x: number, y: number, width: number, height: number, rotate?: number}} layer
 * @returns {{center: Point, cos: number, sin: number}}
 */
function layer_frame(layer) {
	const angle = ((Number(layer.rotate) || 0) * Math.PI) / 180;
	return {
		center: {x: layer.x + layer.width / 2, y: layer.y + layer.height / 2},
		cos: Math.cos(angle),
		sin: Math.sin(angle),
	};
}

/**
 * @param {any} value layer.vector_mask from a file
 * @returns {Vector_mask|null}
 */
export function clean_vector_mask(value) {
	if (!value || typeof value != 'object' || !(value.width > 0) || !(value.height > 0)
		|| !isFinite(value.width) || !isFinite(value.height)) {
		return null;
	}
	return {
		closed: true,
		anchors: clean_path_anchors(value.anchors),
		width: Number(value.width),
		height: Number(value.height),
		invert: value.invert === true,
	};
}

/**
 * A vector mask from a path in document pixels: the path is put into the coordinates of the layer
 *
 * @param {Anchor[]} anchors document pixels
 * @param {{x: number, y: number, width: number, height: number, rotate?: number}} layer
 * @param {boolean} [invert] hide the inside instead of the outside
 * @returns {Vector_mask}
 */
export function vector_mask_from_path(anchors, layer, invert) {
	const frame = layer_frame(layer);
	const width = Math.max(1, Number(layer.width) || 1);
	const height = Math.max(1, Number(layer.height) || 1);
	const local = map_anchors(anchors, (p) => {
		//turn back around the center, then from the corner of the box
		const dx = p.x - frame.center.x;
		const dy = p.y - frame.center.y;
		return {x: dx * frame.cos + dy * frame.sin + width / 2, y: -dx * frame.sin + dy * frame.cos + height / 2};
	});
	return {closed: true, anchors: local, width, height, invert: invert === true};
}

/**
 * The path of a vector mask in document pixels (stretched and turned with the layer)
 *
 * @param {Vector_mask} mask
 * @param {{x: number, y: number, width: number, height: number, rotate?: number}} layer
 * @returns {Anchor[]}
 */
export function vector_mask_to_document(mask, layer) {
	const frame = layer_frame(layer);
	const scale_x = layer.width / mask.width;
	const scale_y = layer.height / mask.height;
	return map_anchors(mask.anchors, (p) => {
		const dx = p.x * scale_x - layer.width / 2;
		const dy = p.y * scale_y - layer.height / 2;
		return {x: frame.center.x + dx * frame.cos - dy * frame.sin, y: frame.center.y + dx * frame.sin + dy * frame.cos};
	});
}

/**
 * The anchors of a vector mask scaled to a picture of the given size (the layer box), for rasterizing
 *
 * @param {Vector_mask} mask
 * @param {number} width
 * @param {number} height
 * @returns {Anchor[]}
 */
export function vector_mask_anchors_for_size(mask, width, height) {
	const scale_x = width / mask.width;
	const scale_y = height / mask.height;
	return map_anchors(mask.anchors, (p) => ({x: p.x * scale_x, y: p.y * scale_y}));
}

/**
 * Multiplies two 8 bit masks of the same size (both must let a pixel through)
 *
 * @param {Uint8ClampedArray|Uint8Array} a
 * @param {Uint8ClampedArray|Uint8Array} b
 * @returns {Uint8ClampedArray}
 */
export function multiply_masks(a, b) {
	const result = new Uint8ClampedArray(a.length);
	for (let i = 0; i < a.length; i++) {
		result[i] = Math.round(a[i] * b[i] / 255);
	}
	return result;
}
