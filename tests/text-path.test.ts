import {
	clean_offset, clean_text_path, measure_path, point_at, layout_on_path, path_glyphs, pen_layer_anchors, text_path_bounds,
	MAX_PATH_GLYPHS,
} from '../src/js/libs/text-path.js';

const line = (length: number) => [
	{x: 0, y: 0, in: null, out: null},
	{x: length, y: 0, in: null, out: null},
];

describe('clean_offset', () => {
	it('clamps to 0-100 and rejects junk', () => {
		expect(clean_offset(50)).toBe(50);
		expect(clean_offset('25.5')).toBe(25.5);
		expect(clean_offset(-5)).toBe(0);
		expect(clean_offset(500)).toBe(100);
		expect(clean_offset('abc')).toBe(0);
		expect(clean_offset(undefined)).toBe(0);
	});
});

describe('clean_text_path', () => {
	it('returns null without a usable path', () => {
		expect(clean_text_path(null)).toBeNull();
		expect(clean_text_path({})).toBeNull();
		expect(clean_text_path({path: 'x'})).toBeNull();
		expect(clean_text_path({path: [{x: 1, y: 1}]})).toBeNull();
		expect(clean_text_path({path: [{x: 'a', y: 1}, {x: 2, y: 2}]})).toBeNull();
	});
	it('keeps valid anchors and cleans the other values', () => {
		const result = clean_text_path({path: [{x: 0, y: 0}, {x: 10, y: 5, in: {x: 8, y: 5}}, {x: NaN, y: 1}], path_offset: 300, path_closed: 'yes', path_origin: {x: 'q', y: 4}})!;
		expect(result.anchors.length).toBe(2);
		expect(result.anchors[1].in).toEqual({x: 8, y: 5});
		expect(result.offset).toBe(100);
		expect(result.closed).toBe(false);
		expect(result.origin).toEqual({x: 0, y: 4});
	});
	it('drops anchors with huge coordinates', () => {
		expect(clean_text_path({path: [{x: 0, y: 0}, {x: 1e9, y: 0}]})).toBeNull();
	});
});

describe('measure_path and point_at', () => {
	it('measures a straight line', () => {
		const path = measure_path(line(100), false);
		expect(path.total).toBeCloseTo(100);
		const p = point_at(path, 25)!;
		expect(p.x).toBeCloseTo(25);
		expect(p.y).toBeCloseTo(0);
		expect(p.angle).toBeCloseTo(0);
	});
	it('clamps an open path and wraps a closed one', () => {
		const square = [
			{x: 0, y: 0, in: null, out: null},
			{x: 10, y: 0, in: null, out: null},
			{x: 10, y: 10, in: null, out: null},
			{x: 0, y: 10, in: null, out: null},
		];
		const closed = measure_path(square, true);
		expect(closed.total).toBeCloseTo(40);
		const wrapped = point_at(closed, 45)!;
		expect(wrapped.x).toBeCloseTo(5);
		expect(wrapped.y).toBeCloseTo(0);
		const down = point_at(closed, 15)!;
		expect(down.angle).toBeCloseTo(Math.PI / 2);
		const open = measure_path(square, false);
		expect(open.total).toBeCloseTo(30);
		expect(point_at(open, 100)!.y).toBeCloseTo(10);
	});
	it('follows a curve by its length', () => {
		//a quarter of a circle-like curve: the length is about r * pi / 2
		const k = 0.5523 * 100;
		const curve = [
			{x: 100, y: 0, in: null, out: {x: 100, y: k}},
			{x: 0, y: 100, in: {x: k, y: 100}, out: null},
		];
		const path = measure_path(curve, false);
		expect(path.total).toBeGreaterThan(156);
		expect(path.total).toBeLessThan(158);
		const middle = point_at(path, path.total / 2)!;
		expect(Math.hypot(middle.x, middle.y)).toBeCloseTo(100, 0);
		expect(middle.angle).toBeCloseTo(3 * Math.PI / 4, 1);
	});
	it('returns null for a path without length', () => {
		expect(point_at(measure_path([{x: 1, y: 1, in: null, out: null}, {x: 1, y: 1, in: null, out: null}], false), 0)).toBeNull();
	});
});

describe('layout_on_path', () => {
	it('places the centers of letters one after another', () => {
		const placed = layout_on_path([10, 20, 10], measure_path(line(100), false), 0);
		expect(placed.map((g) => Math.round(g.x))).toEqual([5, 20, 35]);
		expect(placed.every((g) => Math.abs(g.angle) < 1e-9)).toBe(true);
	});
	it('starts at the offset and leaves out letters past the end', () => {
		const placed = layout_on_path([10, 10, 10, 10], measure_path(line(100), false), 76);
		expect(placed.map((g) => g.index)).toEqual([0, 1]);
		expect(placed[0].x).toBeCloseTo(81);
	});
	it('goes round a closed path once at most', () => {
		const square = [
			{x: 0, y: 0, in: null, out: null},
			{x: 10, y: 0, in: null, out: null},
			{x: 10, y: 10, in: null, out: null},
			{x: 0, y: 10, in: null, out: null},
		];
		const placed = layout_on_path(new Array(10).fill(5), measure_path(square, true), 50);
		expect(placed.length).toBe(8);
		expect(placed[0].x).toBeCloseTo(10 - 2.5);
		expect(placed[0].y).toBeCloseTo(10);
	});
	it('handles an empty path', () => {
		expect(layout_on_path([10], {points: [], lengths: [0], total: 0, closed: false}, 0)).toEqual([]);
	});
});

describe('path_glyphs', () => {
	it('lists the letters with their style and joins lines by a space', () => {
		const glyphs = path_glyphs([[{text: 'ab', meta: {bold: true}}, {text: 'c', meta: {}}], [{text: 'd', meta: {size: 9}}]]);
		expect(glyphs.map((g) => g.char).join('')).toBe('abc d');
		expect(glyphs[0].meta).toEqual({bold: true});
		expect(glyphs[4].meta).toEqual({size: 9});
	});
	it('survives junk and limits the length', () => {
		expect(path_glyphs(null)).toEqual([]);
		expect(path_glyphs([null, [{text: 5}]] as any).map((g) => g.char)).toEqual(['5']);
		expect(path_glyphs([[{text: 'x'.repeat(MAX_PATH_GLYPHS + 10), meta: {}}]]).length).toBe(MAX_PATH_GLYPHS);
	});
});

describe('pen_layer_anchors and text_path_bounds', () => {
	it('moves and stretches the anchors of a Pen layer into the document', () => {
		const anchors = pen_layer_anchors({x: 10, y: 20, width: 200, height: 100, width_original: 100, height_original: 100, data: [{x: 5, y: 5, in: null, out: {x: 10, y: 5}}, {x: 50, y: 0}]});
		expect(anchors[0]).toEqual({x: 20, y: 25, in: null, out: {x: 30, y: 25}});
		expect(anchors[1]).toEqual({x: 110, y: 20, in: null, out: null});
	});
	it('grows the bounds of the path by the font size', () => {
		expect(text_path_bounds(line(100), false, 20)).toEqual({x: -20, y: -20, width: 140, height: 40});
	});
});
