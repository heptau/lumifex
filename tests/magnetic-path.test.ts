import { edge_strength, build_path_tree, trace_path, take_back_anchor } from '../src/js/libs/magnetic-path.js';

function picture(w: number, h: number, value: (x: number, y: number) => number) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const v = value(x, y);
			data.set([v, v, v, 255], (y * w + x) * 4);
		}
	}
	return {data, width: w, height: h};
}

describe('edge_strength', () => {
	it('is 0 on flat areas, 1 on the edge, and 0 for a flat picture', () => {
		const s = edge_strength(picture(10, 4, (x) => (x < 5 ? 0 : 255)));
		expect(s[1 * 10 + 1]).toBe(0);
		expect(s[1 * 10 + 4]).toBe(1);
		expect(s[1 * 10 + 5]).toBe(1);
		expect(Array.from(edge_strength(picture(5, 5, () => 90))).every((v) => v == 0)).toBe(true);
	});
});

describe('magnetic path', () => {
	//a vertical edge between the columns 9 and 10
	const edge = () => edge_strength(picture(20, 30, (x) => (x < 10 ? 0 : 255)));

	it('runs along an edge instead of straight across the flat area', () => {
		const strength = edge();
		const tree = build_path_tree(strength, 20, 30, 7, 0, 40);
		const path = trace_path(tree, 7, 29);
		expect(path[0]).toEqual({x: 7, y: 0});
		expect(path[path.length - 1]).toEqual({x: 7, y: 29});
		//the middle of the path hugs the edge at x = 9 or 10
		const middle = path.filter((p) => p.y > 6 && p.y < 23);
		expect(middle.length).toBeGreaterThan(10);
		expect(middle.every((p) => Math.abs(p.x - 9.5) <= 1)).toBe(true);
	});

	it('on a flat picture the path is about straight', () => {
		const flat = new Float32Array(20 * 30);
		const tree = build_path_tree(flat, 20, 30, 2, 2, 25);
		const path = trace_path(tree, 12, 2);
		expect(path.every((p) => p.y == 2)).toBe(true);
		expect(path.length).toBe(11);
	});

	it('every step moves to a neighboring pixel', () => {
		const tree = build_path_tree(edge(), 20, 30, 3, 3, 25);
		const path = trace_path(tree, 15, 25);
		for (let i = 1; i < path.length; i++) {
			expect(Math.max(Math.abs(path[i].x - path[i - 1].x), Math.abs(path[i].y - path[i - 1].y))).toBe(1);
		}
	});

	it('a target outside the window is joined with a straight line and bad input is limited', () => {
		const tree = build_path_tree(edge(), 20, 30, 5, 5, 3);
		expect(trace_path(tree, 19, 29)).toEqual([{x: 5, y: 5}, {x: 19, y: 29}]);
		const clamped = build_path_tree(edge(), 20, 30, -50, 999, NaN);
		expect(clamped.ax).toBe(0);
		expect(clamped.ay).toBe(29);
	});
});

describe('take_back_anchor', () => {
	it('returns to the path as it was after the previous anchor', () => {
		expect(take_back_anchor([1, 12, 30])).toEqual({marks: [1, 12], length: 12});
		expect(take_back_anchor([1, 12])).toEqual({marks: [1], length: 1});
	});

	it('does nothing when only the start is left or the input is bad', () => {
		expect(take_back_anchor([1])).toBeNull();
		expect(take_back_anchor([])).toBeNull();
		expect(take_back_anchor(null as any)).toBeNull();
	});

	it('does not change the list it gets', () => {
		const marks = [1, 5, 9];
		take_back_anchor(marks);
		expect(marks).toEqual([1, 5, 9]);
	});
});
