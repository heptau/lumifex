import { fill_region } from '../src/js/libs/flood-fill.js';

function picture(w: number, h: number, color: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			data.set(color(x, y), (y * w + x) * 4);
		}
	}
	return data;
}

const count = (mask: Uint8Array) => mask.reduce((a, b) => a + b, 0);

describe('fill_region', () => {
	//white with a black vertical wall in column 3 and a white area behind it
	const walled = () => picture(7, 5, (x) => (x == 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]));

	it('contiguous: only the area connected with the click', () => {
		const mask = fill_region(walled(), 7, 5, 1, 2, 0, true);
		expect(count(mask)).toBe(3 * 5);
		expect(mask[2 * 7 + 5]).toBe(0);
	});

	it('everywhere: the same color on the other side of the wall too', () => {
		const mask = fill_region(walled(), 7, 5, 1, 2, 0, false);
		expect(count(mask)).toBe(6 * 5);
		expect(mask[2 * 7 + 5]).toBe(1);
		expect(mask[2 * 7 + 3]).toBe(0);
	});

	it('the tolerance lets similar colors in, 0 only the same one', () => {
		const data = picture(4, 1, (x) => [100 + x * 10, 100, 100, 255]);
		expect(count(fill_region(data, 4, 1, 0, 0, 0, true))).toBe(1);
		expect(count(fill_region(data, 4, 1, 0, 0, 8, true))).toBe(3);
		expect(count(fill_region(data, 4, 1, 0, 0, 100, true))).toBe(4);
	});

	it('transparent areas can be filled too, and alpha counts', () => {
		const data = picture(4, 1, (x) => (x < 2 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
		expect(count(fill_region(data, 4, 1, 0, 0, 0, false))).toBe(2);
		expect(count(fill_region(data, 4, 1, 3, 0, 0, false))).toBe(2);
	});

	it('every channel is compared on its own (no shifted matches)', () => {
		//the second pixel is (0, 255, 0, 255) shifted by one channel against (255, 0, 0, 255)
		const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255]);
		const mask = fill_region(data, 3, 1, 0, 0, 0, false);
		expect(Array.from(mask)).toEqual([1, 0, 1]);
	});

	it('a click outside or bad numbers give an empty result', () => {
		expect(count(fill_region(walled(), 7, 5, -1, 2, 0, true))).toBe(0);
		expect(count(fill_region(walled(), 7, 5, 9, 2, 0, true))).toBe(0);
		expect(count(fill_region(walled(), 7, 5, NaN, 2, 0, true))).toBe(0);
		expect(count(fill_region(walled(), 7, 5, 1, 2, NaN, false))).toBe(6 * 5);
	});
});
