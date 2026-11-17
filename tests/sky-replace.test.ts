import {
	gradient_sky, fit_sky_rect, sky_mask, mean_sky_color, compose_sky, SKY_PRESETS,
} from '../src/js/libs/sky-replace.js';

//a photo: blue sky in the top half, dark ground in the bottom half
function photo(width: number, height: number) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const sky = y < height / 2;
			data[i] = sky ? 90 : 40;
			data[i + 1] = sky ? 150 : 60;
			data[i + 2] = sky ? 230 : 20;
			data[i + 3] = 255;
		}
	}
	return {data, width, height};
}

describe('gradient_sky', () => {
	it('goes from the top color to the horizon color', () => {
		const sky = gradient_sky(2, 3, 'Sunset');
		const [top, bottom] = SKY_PRESETS['Sunset'];
		expect(Array.from(sky.data.slice(0, 4))).toEqual([...top, 255]);
		expect(Array.from(sky.data.slice(16, 20))).toEqual([...bottom, 255]);
		expect(Array.from(gradient_sky(1, 1, 'nope').data.slice(0, 3))).toEqual(SKY_PRESETS['Blue Sky'][0]);
	});
});

describe('fit_sky_rect', () => {
	it('covers the document and is centered', () => {
		expect(fit_sky_rect(100, 50, 200, 50)).toEqual({x: 0, y: 0, width: 200, height: 100});
		expect(fit_sky_rect(100, 100, 200, 100, 200, 10)).toEqual({x: -100, y: 10, width: 400, height: 400});
	});
});

describe('sky_mask', () => {
	it('selects the sky and moves the edge', () => {
		const image = photo(20, 20);
		const mask = sky_mask(image, {tolerance: 30});
		expect(mask.data[2 * 20 + 5]).toBe(255);
		expect(mask.data[17 * 20 + 5]).toBe(0);
		const grown = sky_mask(image, {tolerance: 30, shift: 3});
		const count = (m: {data: Uint8ClampedArray}) => m.data.reduce((sum, v) => sum + (v > 127 ? 1 : 0), 0);
		expect(count(grown)).toBeGreaterThan(count(mask));
		const soft = sky_mask(image, {tolerance: 30, fade: 3});
		expect(soft.data[10 * 20 + 5]).toBeGreaterThan(0);
		expect(soft.data[10 * 20 + 5]).toBeLessThan(255);
	});
});

describe('mean_sky_color / compose_sky', () => {
	it('takes the mean where the mask is', () => {
		const sky = {width: 2, height: 1, data: Uint8ClampedArray.from([200, 0, 0, 255, 0, 0, 200, 255])};
		expect(mean_sky_color(sky, {data: Uint8ClampedArray.from([255, 0])})).toEqual([200, 0, 0]);
		expect(mean_sky_color(sky, {data: Uint8ClampedArray.from([0, 0])})).toEqual([128, 128, 128]);
	});

	it('puts the sky over the masked part and lights the rest', () => {
		const image = {width: 2, height: 1, data: Uint8ClampedArray.from([10, 10, 10, 255, 100, 100, 100, 255])};
		const sky = {width: 2, height: 1, data: Uint8ClampedArray.from([0, 0, 255, 255, 0, 0, 255, 255])};
		compose_sky(image, sky, {data: Uint8ClampedArray.from([255, 0])}, 0, [0, 0, 0]);
		expect(Array.from(image.data)).toEqual([0, 0, 255, 255, 100, 100, 100, 255]);
		const lit = {width: 1, height: 1, data: Uint8ClampedArray.from([100, 100, 100, 255])};
		compose_sky(lit, {width: 1, height: 1, data: Uint8ClampedArray.from([0, 0, 0, 255])}, {data: Uint8ClampedArray.from([0])}, 100, [255, 0, 128]);
		expect(lit.data[0]).toBeGreaterThan(100);
		expect(lit.data[1]).toBeLessThan(100);
		expect(lit.data[3]).toBe(255);
	});
});
