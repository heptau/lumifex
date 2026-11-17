/**
 * Free Transform (Edit > Free Transform, Ctrl+T): a frame lies around the active layer (or around the selected
 * pixels). Its handles scale it, the inside moves it, the outside turns it; Ctrl / Cmd on a corner makes the frame a
 * free four-cornered shape (distort). Pure functions, no DOM.
 *
 * The frame is the box of the picture: its center, its size, its angle (degrees, clockwise, like `layer.rotate`) and
 * whether the picture is mirrored inside of it. Once a corner was dragged freely, the frame is a quad instead: the four
 * places where the corners of the picture go (top left, top right, bottom right, bottom left of the picture).
 *
 * @typedef {{cx: number, cy: number, width: number, height: number, angle: number, flip_x: boolean, flip_y: boolean}} Frame
 * @typedef {number[][]} Quad
 * @typedef {{x: number, y: number}} Point
 * @typedef {{x: number, y: number, width: number, height: number}} Rect
 */
import { handle_position, drag_handle, CORNER_HANDLES, EDGE_HANDLES } from './perspective.js';
import { normalize_angle, update_from_field } from './transform-bar.js';

export const FRAME_HANDLES = ['tl', 'tr', 'br', 'bl', 'top', 'right', 'bottom', 'left'];

/** Modes of the session (the context menu): free = Photoshop's default, the others limit what a drag does */
export const MODES = ['free', 'scale', 'rotate', 'skew', 'distort', 'perspective'];

/** Modes that make the frame a quad */
export const QUAD_MODES = ['skew', 'distort', 'perspective'];

export const ROTATE_STEP = 15;
export const MIN_SIZE = 1;

//which sides a handle moves: -1 = the left / top one, 1 = the right / bottom one, 0 = this direction stays
const SIGNS = {
	tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1],
	top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0],
};

const CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * @param {{x: number, y: number, width: number, height: number, rotate?: number|null}} box a layer or a rectangle
 * @returns {Frame}
 */
export function frame_from_box(box) {
	const width = Math.max(MIN_SIZE, Math.abs(Number(box.width)) || MIN_SIZE);
	const height = Math.max(MIN_SIZE, Math.abs(Number(box.height)) || MIN_SIZE);
	return {
		cx: Number(box.x) + width / 2,
		cy: Number(box.y) + height / 2,
		width,
		height,
		angle: normalize_angle(Number(box.rotate) || 0),
		flip_x: false,
		flip_y: false,
	};
}

/**
 * @param {Frame} frame
 * @returns {{x: number, y: number, width: number, height: number, rotate: number}} the layer box of the frame
 */
export function frame_to_box(frame) {
	return {
		x: frame.cx - frame.width / 2,
		y: frame.cy - frame.height / 2,
		width: frame.width,
		height: frame.height,
		rotate: frame.angle,
	};
}

/**
 * @param {Point} point in the picture
 * @param {Frame} frame
 * @returns {Point} the point measured from the center of the frame, along its sides
 */
export function to_local(point, frame) {
	const a = frame.angle * Math.PI / 180;
	const dx = point.x - frame.cx;
	const dy = point.y - frame.cy;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	return {x: dx * cos + dy * sin, y: -dx * sin + dy * cos};
}

/**
 * @param {Point} local
 * @param {Frame} frame
 * @returns {Point} the point in the picture
 */
export function from_local(local, frame) {
	const a = frame.angle * Math.PI / 180;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	return {x: frame.cx + local.x * cos - local.y * sin, y: frame.cy + local.x * sin + local.y * cos};
}

/**
 * @param {Frame} frame
 * @returns {Object<string, Point>} places of the eight handles (as they are seen, mirroring does not move them)
 */
export function frame_handles(frame) {
	const result = {};
	FRAME_HANDLES.forEach((name) => {
		result[name] = from_local({x: SIGNS[name][0] * frame.width / 2, y: SIGNS[name][1] * frame.height / 2}, frame);
	});
	return result;
}

/**
 * @param {Frame} frame
 * @returns {Quad} where the corners of the picture go (top left, top right, bottom right, bottom left of the picture)
 */
export function frame_quad(frame) {
	const fx = frame.flip_x ? -1 : 1;
	const fy = frame.flip_y ? -1 : 1;
	return CORNER_SIGNS.map((s) => {
		const p = from_local({x: s[0] * fx * frame.width / 2, y: s[1] * fy * frame.height / 2}, frame);
		return [p.x, p.y];
	});
}

/**
 * @param {Quad} quad a convex shape in either direction
 * @param {Point} point
 * @returns {boolean} the point is inside of the shape
 */
export function point_in_quad(quad, point) {
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = quad[i];
		const b = quad[(i + 1) % 4];
		const cross = (b[0] - a[0]) * (point.y - a[1]) - (b[1] - a[1]) * (point.x - a[0]);
		if (cross == 0) {
			continue;
		}
		const s = cross > 0 ? 1 : -1;
		if (sign == 0) {
			sign = s;
		}
		else if (s != sign) {
			return false;
		}
	}
	return true;
}

/**
 * What a press on a point does with the frame
 *
 * @param {Frame} frame
 * @param {Point} point
 * @param {number} reach how near a handle the point has to be (pixels of the picture)
 * @returns {string} a handle ('tl'... 'left'), 'move' (inside) or 'rotate' (anywhere outside)
 */
export function hit_test(frame, point, reach) {
	const handles = frame_handles(frame);
	//corners first, they are small and edges are long
	for (let i = 0; i < FRAME_HANDLES.length; i++) {
		const name = FRAME_HANDLES[i];
		if (Math.hypot(handles[name].x - point.x, handles[name].y - point.y) <= reach) {
			return name;
		}
	}
	const local = to_local(point, frame);
	if (Math.abs(local.x) <= frame.width / 2 && Math.abs(local.y) <= frame.height / 2) {
		return 'move';
	}
	return 'rotate';
}

/**
 * The same for a quad: its corners and the middles of its edges are the handles
 *
 * @param {Quad} quad
 * @param {Point} point
 * @param {number} reach
 * @returns {string} 'tl'... 'bl' (corners of the picture), 'top'... 'left' (edges), 'move' or 'rotate'
 */
export function quad_hit_test(quad, point, reach) {
	const names = CORNER_HANDLES.concat(EDGE_HANDLES);
	for (let i = 0; i < names.length; i++) {
		const p = handle_position(quad, names[i]);
		if (Math.hypot(p.x - point.x, p.y - point.y) <= reach) {
			return names[i];
		}
	}
	return point_in_quad(quad, point) ? 'move' : 'rotate';
}

/**
 * @param {number} angle degrees
 * @param {number} [step]
 * @returns {number} the angle rounded to the step, -180..180
 */
export function snap_angle(angle, step = ROTATE_STEP) {
	return normalize_angle(Math.round(angle / step) * step);
}

/**
 * Photoshop CC: a corner of a picture keeps the proportions and Shift frees them; a vector layer is the other way
 * round. The edges always stretch one direction.
 *
 * @param {string} handle
 * @param {boolean} shift
 * @param {boolean} ratio_default the proportions are kept without Shift
 * @returns {boolean}
 */
export function keeps_ratio(handle, shift, ratio_default) {
	if (!CORNER_HANDLES.includes(handle)) {
		return false;
	}
	return ratio_default ? !shift : Boolean(shift);
}

function angle_between(center, from, to) {
	const before = Math.atan2(from.y - center.y, from.x - center.x);
	const now = Math.atan2(to.y - center.y, to.x - center.x);
	return (now - before) * 180 / Math.PI;
}

/**
 * The frame after a drag
 *
 * @param {Frame} start the frame when the button went down
 * @param {string} kind a handle, 'move' or 'rotate'
 * @param {Point} from where the button went down
 * @param {Point} to where the pointer is now
 * @param {{shift?: boolean, alt?: boolean, ratio_default?: boolean}} [options] Shift toggles the proportions of a
 *   corner (and turns by 15 degrees), Alt scales around the center
 * @returns {Frame} a new frame
 */
export function drag_frame(start, kind, from, to, options) {
	options = options || {};
	const result = Object.assign({}, start);
	if (kind == 'move') {
		//whole pixels, so a moved picture stays sharp
		result.cx = start.cx + Math.round(to.x - from.x);
		result.cy = start.cy + Math.round(to.y - from.y);
		return result;
	}
	if (kind == 'rotate') {
		const angle = start.angle + angle_between({x: start.cx, y: start.cy}, from, to);
		result.angle = options.shift ? snap_angle(angle) : normalize_angle(angle);
		return result;
	}
	const signs = SIGNS[kind];
	if (!signs) {
		return result;
	}
	const q = to_local(to, start);
	const half = [start.width / 2, start.height / 2];
	const size = [half[0], half[1]]; //new half sizes
	const center = [0, 0]; //new center, in the frame
	for (let axis = 0; axis < 2; axis++) {
		const s = signs[axis];
		if (s == 0) {
			continue;
		}
		const pointer = axis == 0 ? q.x : q.y;
		if (options.alt) {
			size[axis] = Math.max(MIN_SIZE / 2, Math.abs(pointer));
		}
		else {
			const fixed = -s * half[axis]; //the opposite side stays where it is
			const moved = s * (pointer - fixed) >= MIN_SIZE ? pointer : fixed + s * MIN_SIZE;
			size[axis] = Math.abs(moved - fixed) / 2;
			center[axis] = (moved + fixed) / 2;
		}
	}
	if (keeps_ratio(kind, options.shift, options.ratio_default)) {
		//the bigger of the two changes counts
		const factor = Math.max(size[0] / half[0], size[1] / half[1]);
		for (let axis = 0; axis < 2; axis++) {
			size[axis] = Math.max(MIN_SIZE / 2, half[axis] * factor);
			center[axis] = options.alt ? 0 : -signs[axis] * half[axis] + signs[axis] * size[axis];
		}
	}
	const moved_center = from_local({x: center[0], y: center[1]}, start);
	result.cx = moved_center.x;
	result.cy = moved_center.y;
	result.width = size[0] * 2;
	result.height = size[1] * 2;
	return result;
}

/**
 * @param {Quad} quad
 * @returns {Point} the mean of the corners
 */
export function quad_center(quad) {
	return {
		x: (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4,
		y: (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4,
	};
}

/**
 * @param {Quad} quad
 * @param {Point} center
 * @param {number} degrees clockwise
 * @returns {Quad} a new quad
 */
export function rotate_quad(quad, center, degrees) {
	const a = degrees * Math.PI / 180;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	return quad.map((c) => {
		const dx = c[0] - center.x;
		const dy = c[1] - center.y;
		return [center.x + dx * cos - dy * sin, center.y + dx * sin + dy * cos];
	});
}

/**
 * The quad after a drag
 *
 * - corners: Perspective moves the neighbors the opposite way (perspective.js), the other modes move only the corner
 * - edges: Distort moves the whole edge, the other modes slide it along itself (skew)
 * - inside: moves, outside: turns around the center (Shift: by 15 degrees)
 *
 * @param {Quad} start
 * @param {string} mode one of MODES
 * @param {string} kind from quad_hit_test
 * @param {Point} from
 * @param {Point} to
 * @param {{shift?: boolean}} [options]
 * @returns {Quad} a new quad
 */
export function drag_quad(start, mode, kind, from, to, options) {
	options = options || {};
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (kind == 'move') {
		return start.map((c) => [c[0] + Math.round(dx), c[1] + Math.round(dy)]);
	}
	if (kind == 'rotate') {
		const center = quad_center(start);
		let degrees = angle_between(center, from, to);
		if (options.shift) {
			degrees = Math.round(degrees / ROTATE_STEP) * ROTATE_STEP;
		}
		return rotate_quad(start, center, degrees);
	}
	if (CORNER_HANDLES.includes(kind)) {
		return drag_handle(start, mode == 'perspective' ? 'perspective' : 'distort', kind, dx, dy);
	}
	const edge = EDGE_HANDLES.indexOf(kind);
	if (edge >= 0) {
		if (mode == 'distort') {
			return start.map((c, i) => (i == edge || i == (edge + 1) % 4 ? [c[0] + dx, c[1] + dy] : [c[0], c[1]]));
		}
		return drag_handle(start, 'skew', kind, dx, dy);
	}
	return start.map((c) => [c[0], c[1]]);
}

/**
 * @param {Frame} frame
 * @param {number} degrees
 * @returns {Frame} the frame turned around its center (Rotate 180°, 90° clockwise / counter clockwise)
 */
export function turn_frame(frame, degrees) {
	return Object.assign({}, frame, {angle: normalize_angle(frame.angle + degrees)});
}

/**
 * @param {Frame} frame
 * @param {boolean} horizontal true = mirror left and right, false = top and bottom (in the frame's own directions)
 * @returns {Frame}
 */
export function flip_frame(frame, horizontal) {
	return Object.assign({}, frame, horizontal ? {flip_x: !frame.flip_x} : {flip_y: !frame.flip_y});
}

/**
 * @param {Quad} quad
 * @param {boolean} horizontal
 * @returns {Quad} the quad mirrored around its center
 */
export function flip_quad(quad, horizontal) {
	const c = quad_center(quad);
	return quad.map((p) => (horizontal ? [2 * c.x - p[0], p[1]] : [p[0], 2 * c.y - p[1]]));
}

/**
 * @param {Frame} a
 * @param {Frame} b
 * @returns {boolean} the two frames are the same (within a tiny error)
 */
export function same_frame(a, b) {
	const near = (x, y) => Math.abs(x - y) < 1e-6;
	return near(a.cx, b.cx) && near(a.cy, b.cy) && near(a.width, b.width) && near(a.height, b.height)
		&& near(normalize_angle(a.angle - b.angle), 0) && a.flip_x == b.flip_x && a.flip_y == b.flip_y;
}

/**
 * The values of the numbers in the bar: X, Y = the center (as the transform bar of the Move tool)
 *
 * @param {Frame} frame
 * @returns {{x: number, y: number, width: number, height: number, rotate: number}}
 */
export function frame_fields(frame) {
	return {x: frame.cx, y: frame.cy, width: frame.width, height: frame.height, rotate: frame.angle};
}

/**
 * The frame after one number of the bar was typed
 *
 * @param {Frame} frame
 * @param {'x'|'y'|'width'|'height'|'rotate'} field
 * @param {number|string} value
 * @param {boolean} keep_ratio a new width changes the height too (and the other way round)
 * @returns {Frame|null} null when nothing changes or the value is not a number
 */
export function frame_from_field(frame, field, value, keep_ratio) {
	const box = frame_to_box(frame);
	const settings = update_from_field(box, field, value, keep_ratio);
	if (settings == null) {
		return null;
	}
	const next = frame_from_box(Object.assign(box, settings));
	next.flip_x = frame.flip_x;
	next.flip_y = frame.flip_y;
	return next;
}

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {Rect} the smallest whole-pixel rectangle around both
 */
export function union_rect(a, b) {
	const x = Math.floor(Math.min(a.x, b.x));
	const y = Math.floor(Math.min(a.y, b.y));
	return {
		x,
		y,
		width: Math.ceil(Math.max(a.x + a.width, b.x + b.width)) - x,
		height: Math.ceil(Math.max(a.y + a.height, b.y + b.height)) - y,
	};
}

/**
 * A mask (or one channel picture) mirrored
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray|Uint8Array}} mask one value per pixel
 * @param {boolean} horizontal
 * @param {boolean} vertical
 * @returns {{width: number, height: number, data: Uint8ClampedArray}} a new mask
 */
export function flip_mask(mask, horizontal, vertical) {
	const w = mask.width;
	const h = mask.height;
	const data = new Uint8ClampedArray(w * h);
	for (let y = 0; y < h; y++) {
		const sy = vertical ? h - 1 - y : y;
		for (let x = 0; x < w; x++) {
			const sx = horizontal ? w - 1 - x : x;
			data[y * w + x] = mask.data[sy * w + sx];
		}
	}
	return {width: w, height: h, data};
}

/**
 * The rectangle of a selection mask that lies on a layer
 *
 * @param {Rect} bounds the bounds of the selection (pixels of the document)
 * @param {Rect} layer the place of the layer
 * @returns {Rect|null} the whole-pixel part of the selection over the layer, null when they do not meet
 */
export function selection_on_layer(bounds, layer) {
	const x = Math.max(Math.round(bounds.x), Math.round(layer.x));
	const y = Math.max(Math.round(bounds.y), Math.round(layer.y));
	const right = Math.min(Math.round(bounds.x + bounds.width), Math.round(layer.x + layer.width));
	const bottom = Math.min(Math.round(bounds.y + bounds.height), Math.round(layer.y + layer.height));
	if (right <= x || bottom <= y) {
		return null;
	}
	return {x, y, width: right - x, height: bottom - y};
}
