import { content_aware_move, fill_source_offset } from '../src/js/libs/content-move.js';

function picture(width: number, height: number, fill: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data.set(fill(x, y), (y * width + x) * 4);
		}
	}
	return {width, height, data};
}

describe('Content-Aware Move', () => {
	it('takes the fill from the side opposite to the move, inside the picture', () => {
		expect(fill_source_offset({x0: 40, y0: 10, x1: 50, y1: 20}, 20, 0, 100, 100)).toEqual({dx: -14, dy: 0});
		expect(fill_source_offset({x0: 2, y0: 10, x1: 12, y1: 20}, -20, 0, 100, 100)).toEqual({dx: 14, dy: 0});
		expect(fill_source_offset({x0: 0, y0: 0, x1: 100, y1: 100}, 5, 0, 100, 100)).toEqual({dx: 5, dy: 0});
	});

	it('moves the part and fills its old place with the background', () => {
		//gray background, a red 6x6 square at 10..15
		const image = picture(60, 30, (x, y) => (x >= 10 && x < 16 && y >= 10 && y < 16 ? [255, 0, 0, 255] : [100, 100, 100, 255]));
		const mask = {width: 60, height: 30, data: new Uint8ClampedArray(60 * 30)};
		for (let y = 9; y < 17; y++) for (let x = 9; x < 17; x++) mask.data[y * 60 + x] = 255;
		content_aware_move(image, mask, 30, 0, {softness: 0});
		const at = (x: number, y: number) => Array.from(image.data.slice((y * 60 + x) * 4, (y * 60 + x) * 4 + 4));
		expect(at(43, 12)).toEqual([255, 0, 0, 255]); //moved
		const old = at(12, 12);
		expect(Math.abs(old[0] - 100)).toBeLessThan(15); //filled with the gray around
		expect(Math.abs(old[1] - 100)).toBeLessThan(15);
	});

	it('does nothing without a move or a mask', () => {
		const image = picture(10, 10, () => [1, 2, 3, 255]);
		const before = Array.from(image.data);
		content_aware_move(image, {width: 10, height: 10, data: new Uint8ClampedArray(100)}, 5, 5);
		expect(Array.from(image.data)).toEqual(before);
	});
});
