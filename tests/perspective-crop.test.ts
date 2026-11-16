import { crop_size, rectify_quad, start_quad, MAX_CROP_SIDE } from '../src/js/libs/perspective-crop.js';

function picture(w: number, h: number, color: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			data.set(color(x, y), (y * w + x) * 4);
		}
	}
	return {data, width: w, height: h};
}

describe('crop_size', () => {
	it('is the mean of the opposite sides', () => {
		expect(crop_size([[0, 0], [100, 0], [100, 50], [0, 50]])).toEqual({width: 100, height: 50});
		//a trapezoid: the top side is 60, the bottom 100
		expect(crop_size([[20, 0], [80, 0], [100, 40], [0, 40]]).width).toBe(80);
	});

	it('is limited to at least 1 and at most the maximum', () => {
		expect(crop_size([[0, 0], [0, 0], [0, 0], [0, 0]])).toEqual({width: 1, height: 1});
		expect(crop_size([[0, 0], [1e6, 0], [1e6, 5], [0, 5]]).width).toBe(MAX_CROP_SIDE);
		expect(crop_size([[NaN, 0], [1, 0], [1, 1], [0, 1]]).width).toBeGreaterThanOrEqual(1);
	});
});

describe('rectify_quad', () => {
	it('an axis-aligned rectangle is cut out unchanged', () => {
		const img = picture(20, 20, (x, y) => [x * 10, y * 10, 5, 255]);
		const out = rectify_quad(img, [[5, 5], [15, 5], [15, 15], [5, 15]])!;
		expect([out.width, out.height]).toEqual([10, 10]);
		expect(Array.from(out.data.slice(0, 4))).toEqual([50, 50, 5, 255]);
		const last = (9 * 10 + 9) * 4;
		expect(Array.from(out.data.slice(last, last + 4))).toEqual([140, 140, 5, 255]);
	});

	it('straightens a trapezoid: a vertical stripe of the real thing is vertical in the result', () => {
		//the picture is a trapezoid seen from an angle: its left half is black and its right half white,
		//the dividing line goes through the middle of both parallel sides
		const quad = [[20, 0], [80, 0], [100, 40], [0, 40]];
		const img = picture(100, 40, (x, y) => {
			const half = 50;
			return [x < half ? 0 : 255, x < half ? 0 : 255, x < half ? 0 : 255, 255];
		});
		const out = rectify_quad(img, quad, {width: 40, height: 10})!;
		const row = (y: number) => Array.from({length: 40}, (_, x) => out.data[(y * 40 + x) * 4]);
		for (const y of [0, 5, 9]) {
			expect(row(y).slice(0, 18).every((v) => v == 0)).toBe(true);
			expect(row(y).slice(22).every((v) => v == 255)).toBe(true);
		}
	});

	it('refuses a shape that folds over itself, keeps alpha and leaves outside parts transparent', () => {
		const img = picture(10, 10, () => [1, 2, 3, 90]);
		expect(rectify_quad(img, [[0, 0], [10, 10], [10, 0], [0, 10]])).toBeNull();
		expect(rectify_quad(img, null as any)).toBeNull();
		const inside = rectify_quad(img, [[2, 2], [8, 2], [8, 8], [2, 8]])!;
		expect(inside.data[3]).toBe(90);
		const outside = rectify_quad(img, [[-10, 0], [0, 0], [0, 10], [-10, 10]])!;
		expect(outside.data[3]).toBe(0);
	});
});

describe('start_quad', () => {
	it('is a rectangle inset from the edges', () => {
		expect(start_quad(100, 50)).toEqual([[10, 5], [90, 5], [90, 45], [10, 45]]);
	});
});
