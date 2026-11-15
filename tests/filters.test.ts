import { oilPaint, diffuse, pixelate, unsharpMask, highPass, median, maxMin, offset, motionBlur, clarity, mirror, smartBlur } from '../src/js/libs/filters.js';

function image(width: number, height: number, fill: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data.set(fill(x, y), (y * width + x) * 4);
		}
	}
	return { width, height, data };
}

describe('Filters', () => {
	it('pixelate averages blocks and keeps alpha', () => {
		const img = pixelate(image(2, 2, (x) => (x == 0 ? [0, 0, 0, 10] : [100, 200, 50, 20])), 2);
		expect(Array.from(img.data.slice(0, 4))).toEqual([50, 100, 25, 10]);
		expect(Array.from(img.data.slice(4, 8))).toEqual([50, 100, 25, 20]);
	});

	it('pixelate handles partial blocks at the edge', () => {
		const img = pixelate(image(3, 1, (x) => [x * 100, 0, 0, 255]), 2);
		expect(img.data[0]).toBe(50);
		expect(img.data[8]).toBe(200);
	});

	it('unsharp mask leaves flat image unchanged', () => {
		const img = unsharpMask(image(5, 5, () => [90, 90, 90, 255]), {amount: 200, radius: 2});
		expect(img.data[0]).toBe(90);
	});

	it('unsharp mask increases edge contrast', () => {
		const img = unsharpMask(image(6, 1, (x) => (x < 3 ? [100, 100, 100, 255] : [150, 150, 150, 255])), {amount: 100, radius: 1});
		expect(img.data[2 * 4]).toBeLessThan(100);
		expect(img.data[3 * 4]).toBeGreaterThan(150);
	});

	it('unsharp mask respects threshold', () => {
		const img = unsharpMask(image(6, 1, (x) => (x < 3 ? [100, 100, 100, 255] : [110, 110, 110, 255])), {amount: 100, radius: 1, threshold: 50});
		expect(img.data[2 * 4]).toBe(100);
	});

	it('high pass turns flat image into mid gray', () => {
		const img = highPass(image(4, 4, () => [10, 200, 90, 255]), 2);
		expect(Array.from(img.data.slice(0, 4))).toEqual([128, 128, 128, 255]);
	});

	it('median removes single-pixel noise', () => {
		const img = median(image(3, 3, (x, y) => (x == 1 && y == 1 ? [255, 255, 255, 255] : [10, 10, 10, 255])), 1);
		expect(img.data[(1 * 3 + 1) * 4]).toBe(10);
	});
});

describe('Maximum/Minimum', () => {
	const spot = (x: number, y: number) => (x == 1 && y == 1 ? [255, 255, 255, 255] : [0, 0, 0, 255]);

	it('maximum spreads light pixels', () => {
		const img = maxMin(image(3, 3, spot), 1, 'maximum');
		expect(img.data[0]).toBe(255);
		expect(img.data[3]).toBe(255);
	});

	it('minimum erodes light pixels', () => {
		const img = maxMin(image(3, 3, spot), 1, 'minimum');
		expect(img.data[(1 * 3 + 1) * 4]).toBe(0);
	});
});

describe('Offset and motion blur', () => {
	const row = (x: number) => [x * 10, 0, 0, 255];

	it('offset wraps pixels around', () => {
		const img = offset(image(4, 1, row), 1, 0);
		expect([0, 1, 2, 3].map((x) => img.data[x * 4])).toEqual([30, 0, 10, 20]);
	});

	it('offset supports negative and oversized values', () => {
		const img = offset(image(4, 1, row), -1, 0);
		expect([0, 1, 2, 3].map((x) => img.data[x * 4])).toEqual([10, 20, 30, 0]);
		const same = offset(image(4, 1, row), 8, 0);
		expect([0, 1, 2, 3].map((x) => same.data[x * 4])).toEqual([0, 10, 20, 30]);
	});

	it('offset shifts vertically', () => {
		const img = offset(image(1, 3, (_x, y) => [y * 10, 0, 0, 255]), 0, 1);
		expect([0, 1, 2].map((y) => img.data[y * 4])).toEqual([20, 0, 10]);
	});

	it('horizontal motion blur averages neighbours', () => {
		const img = motionBlur(image(3, 1, (x) => [x == 1 ? 90 : 0, 0, 0, 255]), {angle: 0, distance: 1});
		expect(img.data[4]).toBe(30);
	});

	it('motion blur keeps flat images and alpha', () => {
		const img = motionBlur(image(3, 3, () => [50, 50, 50, 77]), {angle: 45, distance: 5});
		expect(Array.from(img.data.slice(0, 4))).toEqual([50, 50, 50, 77]);
	});
});

describe('Clarity', () => {
	it('is identity with zero amount and keeps flat images', () => {
		expect(clarity(image(3, 1, () => [50, 60, 70, 255]), 0).data[0]).toBe(50);
		expect(clarity(image(5, 5, () => [128, 128, 128, 255]), 100, 2).data[0]).toBe(128);
	});

	it('increases local contrast around an edge in midtones', () => {
		const img = clarity(image(8, 1, (x) => (x < 4 ? [110, 110, 110, 255] : [150, 150, 150, 255])), 100, 2);
		expect(img.data[3 * 4]).toBeLessThan(110);
		expect(img.data[4 * 4]).toBeGreaterThan(150);
	});

	it('does not touch pure black or white', () => {
		const img = clarity(image(4, 1, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])), 100, 1);
		expect(img.data[0]).toBe(0);
		expect(img.data[12]).toBe(255);
	});
});

describe('Mirror', () => {
	const row = (x: number) => [x * 10, 0, 0, 255];

	it('mirrors left half onto the right', () => {
		const img = mirror(image(4, 1, row), 'left');
		expect([0, 1, 2, 3].map((x) => img.data[x * 4])).toEqual([0, 10, 10, 0]);
	});

	it('mirrors right half onto the left', () => {
		const img = mirror(image(4, 1, row), 'right');
		expect([0, 1, 2, 3].map((x) => img.data[x * 4])).toEqual([30, 20, 20, 30]);
	});

	it('mirrors vertically', () => {
		const col = (_x: number, y: number) => [y * 10, 0, 0, 255];
		const top = mirror(image(1, 4, col), 'top');
		expect([0, 1, 2, 3].map((y) => top.data[y * 4])).toEqual([0, 10, 10, 0]);
		const bottom = mirror(image(1, 4, col), 'bottom');
		expect([0, 1, 2, 3].map((y) => bottom.data[y * 4])).toEqual([30, 20, 20, 30]);
	});

	it('ignores unknown source', () => {
		expect(mirror(image(2, 1, row), 'x' as any).data[4]).toBe(10);
	});
});

describe('Smart blur', () => {
	it('blurs similar tones', () => {
		const img = smartBlur(image(3, 1, (x) => [x == 1 ? 40 : 30, 30, 30, 255]), {radius: 1, threshold: 50});
		expect(img.data[0]).toBeCloseTo(35, 0);
	});

	it('keeps strong edges sharp', () => {
		const img = smartBlur(image(4, 1, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])), {radius: 2, threshold: 20});
		expect(img.data[4]).toBe(0);
		expect(img.data[8]).toBe(255);
	});

	it('keeps alpha', () => {
		const img = smartBlur(image(2, 2, () => [10, 10, 10, 66]), {radius: 1, threshold: 10});
		expect(img.data[3]).toBe(66);
	});

	it('diffuse is deterministic, keeps pixel values from the source and does nothing with amount 0', () => {
		const make = () => image(8, 8, (x, y) => [x * 30, y * 30, 7, 255]);
		const base = make();
		expect(Array.from(diffuse(make(), { amount: 0 }).data)).toEqual(Array.from(base.data));
		const a = diffuse(make(), { amount: 2, seed: 5 });
		const b = diffuse(make(), { amount: 2, seed: 5 });
		const c = diffuse(make(), { amount: 2, seed: 6 });
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
		expect(Array.from(a.data)).not.toEqual(Array.from(base.data));
		//every blue value and alpha stays as in the source, and no pixel comes from farther than 2
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				const i = (y * 8 + x) * 4;
				expect(a.data[i + 3]).toBe(255);
				expect(Math.abs(a.data[i] / 30 - x)).toBeLessThanOrEqual(2);
				expect(Math.abs(a.data[i + 1] / 30 - y)).toBeLessThanOrEqual(2);
			}
		}
	});

	it('oil paint flattens noise, keeps a sharp edge and the alpha', () => {
		//left half dark, right half bright, with a little noise
		const make = () => image(20, 10, (x, y) => {
			const v = (x < 10 ? 40 : 200) + ((x + y) % 2 ? 6 : -6);
			return [v, v, v, 100 + x];
		});
		const out = oilPaint(make(), { radius: 3 });
		const px = (x: number, y: number) => out.data[(y * 20 + x) * 4];
		//noise is gone inside the areas
		expect(Math.abs(px(3, 5) - px(4, 5))).toBeLessThanOrEqual(1);
		expect(Math.abs(px(15, 5) - px(16, 5))).toBeLessThanOrEqual(1);
		//the edge stays sharp: right next to it the colors are still the two original areas
		expect(px(9, 5)).toBeLessThan(60);
		expect(px(10, 5)).toBeGreaterThan(180);
		expect(out.data[(5 * 20 + 7) * 4 + 3]).toBe(107);
	});
});
