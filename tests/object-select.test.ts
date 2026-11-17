import { clip_rect, largest_region, object_in_rect_mask } from '../src/js/libs/object-select.js';

function picture(width: number, height: number, fill: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data.set(fill(x, y), (y * width + x) * 4);
		}
	}
	return {width, height, data};
}

describe('Object Selection', () => {
	it('clips the rectangle to the picture, in any drag direction', () => {
		expect(clip_rect({x: 10, y: 10, width: -20, height: -5}, 100, 100)).toEqual({x: 0, y: 5, width: 10, height: 5});
		expect(clip_rect({x: 0, y: 0, width: 2, height: 50}, 100, 100)).toBe(null);
		expect(clip_rect({x: 90, y: 90, width: 50, height: 50}, 100, 100)).toEqual({x: 90, y: 90, width: 10, height: 10});
	});

	it('keeps only the largest region', () => {
		const mask = {width: 6, height: 1, data: new Uint8ClampedArray([255, 0, 255, 255, 255, 0])};
		expect(Array.from(largest_region(mask).data)).toEqual([0, 0, 255, 255, 255, 0]);
		expect(Array.from(largest_region({width: 2, height: 1, data: new Uint8ClampedArray([0, 0])}).data)).toEqual([0, 0]);
	});

	it('selects the object inside the rectangle and nothing outside', () => {
		//white picture, a red square 20..39 and another red square far away
		const image = picture(80, 60, (x, y) => ((x >= 20 && x < 40 && y >= 20 && y < 40) || (x >= 65 && y >= 45) ? [220, 20, 20, 255] : [250, 250, 250, 255]));
		const mask = object_in_rect_mask(image, {x: 10, y: 10, width: 40, height: 40}, 40);
		expect(mask.data[30 * 80 + 30]).toBe(255);
		expect(mask.data[12 * 80 + 12]).toBe(0);
		expect(mask.data[50 * 80 + 70]).toBe(0);
	});
});
