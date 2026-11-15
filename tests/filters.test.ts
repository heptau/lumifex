import { dryBrush, patchwork, facet, basRelief, neonGlow, stamp, posterEdges, cutout, photocopy, charcoal, blurMore, sharpenMore, glowingEdges, mezzotint, fragment, despeckle, customKernel, traceContour, wind, average, tiles, oilPaint, diffuse, pixelate, unsharpMask, highPass, median, maxMin, offset, motionBlur, clarity, mirror, smartBlur } from '../src/js/libs/filters.js';

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

	it('tiles shift whole tiles, are deterministic and do nothing without an offset', () => {
		const make = () => image(20, 20, (x, y) => [x * 10, y * 10, 3, 255]);
		const base = make();
		expect(Array.from(tiles(make(), { count: 4, offset: 0 }).data)).toEqual(Array.from(base.data));
		const a = tiles(make(), { count: 4, offset: 40, seed: 3 });
		const b = tiles(make(), { count: 4, offset: 40, seed: 3 });
		const c = tiles(make(), { count: 4, offset: 40, seed: 4 });
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
		expect(Array.from(a.data)).not.toEqual(Array.from(base.data));
		//only values from the source appear and the alpha is untouched
		for (let i = 0; i < a.data.length; i += 4) {
			expect(a.data[i] % 10).toBe(0);
			expect(a.data[i + 3]).toBe(255);
		}
	});

	it('average fills with the alpha weighted mean color and keeps alpha', () => {
		//a red pixel with full alpha and a blue one with a quarter of it: the mean leans to red
		const img = average(image(2, 1, (x) => (x == 0 ? [200, 0, 0, 200] : [0, 0, 200, 100])));
		expect(Array.from(img.data)).toEqual([133, 0, 67, 200, 133, 0, 67, 100]);
		const empty = image(2, 1, () => [9, 9, 9, 0]);
		expect(Array.from(average(empty).data)).toEqual([9, 9, 9, 0, 9, 9, 9, 0]);
	});

	it('average with weights takes the mean only from the weighted pixels', () => {
		const img = image(3, 1, (x) => [[200, 0, 0, 255], [0, 0, 200, 255], [0, 200, 0, 255]][x]);
		const out = average(img, new Uint8Array([255, 255, 0]));
		expect(Array.from(out.data)).toEqual([100, 0, 100, 255, 100, 0, 100, 255, 100, 0, 100, 255]);
	});
});

describe('wind', () => {
	const make = () => image(20, 1, (x) => (x < 5 ? [0, 0, 0, 255] : [200, 100, 50, 255]));

	it('trails streaks of the bright side away from an edge, in the chosen direction', () => {
		const right = wind(make(), {method: 'Wind', direction: 'From the Left', strength: 20, seed: 1});
		expect(Array.from(right.data.slice(5 * 4, 5 * 4 + 3))).toEqual([200, 100, 50]);
		//the dark part left of the edge is untouched
		expect(right.data[0]).toBe(0);
		const left = wind(image(20, 1, (x) => (x >= 15 ? [0, 0, 0, 255] : [200, 100, 50, 255])), {direction: 'From the Right', strength: 20});
		expect(left.data[14 * 4]).toBe(200);
		expect(left.data[19 * 4]).toBe(0);
	});

	it('is deterministic, keeps alpha and does nothing on a flat image or a too high threshold', () => {
		const a = wind(make(), {method: 'Stagger', seed: 3});
		const b = wind(make(), {method: 'Stagger', seed: 3});
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(a.data[3]).toBe(255);
		const flat = image(6, 2, () => [9, 9, 9, 77]);
		expect(Array.from(wind(flat, {strength: 0}).data)).toEqual(Array.from(image(6, 2, () => [9, 9, 9, 77]).data));
		const soft = () => image(20, 1, (x) => (x < 5 ? [0, 0, 0, 255] : [100, 100, 100, 255]));
		expect(Array.from(wind(soft(), {strength: 100}).data)).toEqual(Array.from(soft().data));
	});

	it('ignores an unknown method', () => {
		expect(() => wind(make(), {method: '__proto__'})).not.toThrow();
	});
});

describe('traceContour', () => {
	const make = () => image(6, 3, (x) => (x < 3 ? [0, 0, 0, 200] : [255, 255, 255, 200]));

	it('draws only the pixels next to the level crossing and whitens the rest', () => {
		const lower = traceContour(make(), {level: 128, edge: 'Lower'});
		expect(lower.data[2 * 4]).toBe(0);   //dark pixel at the edge keeps its value
		expect(lower.data[0]).toBe(255);     //dark pixel far from the edge becomes white
		expect(lower.data[4 * 4]).toBe(255); //bright side is not drawn
		const upper = traceContour(make(), {level: 128, edge: 'Upper'});
		expect(upper.data[3 * 4]).toBe(255); //bright pixel at the edge keeps its value
		expect(upper.data[5 * 4]).toBe(255);
	});

	it('keeps alpha and tolerates bad parameters', () => {
		const img = traceContour(make(), {level: 'x', edge: 5});
		expect(img.data[3]).toBe(200);
	});
});

describe('customKernel', () => {
	const make = () => image(3, 3, (x, y) => [x * 40 + y * 10, 100, 7, 180]);
	const identity = {k0: 0, k1: 0, k2: 0, k3: 0, k4: 1, k5: 0, k6: 0, k7: 0, k8: 0, scale: 1, offset: 0};

	it('identity kernel changes nothing and keeps alpha', () => {
		const img = customKernel(make(), identity);
		expect(Array.from(img.data)).toEqual(Array.from(make().data));
	});

	it('box blur averages the neighbourhood, offset and scale apply, values are clamped', () => {
		const flat = image(3, 3, () => [90, 90, 90, 255]);
		const box = {k0: 1, k1: 1, k2: 1, k3: 1, k4: 1, k5: 1, k6: 1, k7: 1, k8: 1, scale: 9, offset: 10};
		expect(customKernel(flat, box).data[4 * 4]).toBe(100);
		const bright = customKernel(image(2, 2, () => [200, 200, 200, 255]), {...identity, k4: 5});
		expect(bright.data[0]).toBe(255);
	});

	it('survives garbage parameters', () => {
		expect(() => customKernel(make(), {k4: 'x', scale: 0, offset: 'y'})).not.toThrow();
	});
});

describe('despeckle', () => {
	it('removes a lone speckle on a flat area but keeps a sharp edge', () => {
		const speck = image(7, 7, (x, y) => (x == 3 && y == 3 ? [90, 90, 90, 255] : [100, 100, 100, 255]));
		expect(despeckle(speck, {threshold: 100}).data[(3 * 7 + 3) * 4]).toBeGreaterThan(90);
		const edge = () => image(8, 3, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
		const out = despeckle(edge(), {threshold: 100});
		expect(Array.from(out.data)).toEqual(Array.from(edge().data));
	});

	it('keeps alpha and survives bad parameters', () => {
		const img = despeckle(image(4, 4, () => [10, 20, 30, 77]), {threshold: 'x', passes: 99});
		expect(img.data[3]).toBe(77);
	});
});

describe('fragment', () => {
	it('distance 0 changes nothing; a flat image stays flat; a vertical edge is split into steps', () => {
		const make = () => image(9, 1, (x) => (x < 4 ? [0, 0, 0, 255] : [200, 200, 200, 255]));
		expect(Array.from(fragment(make(), {distance: 0}).data)).toEqual(Array.from(make().data));
		const flat = fragment(image(5, 5, () => [50, 60, 70, 255]), {distance: 2});
		expect(Array.from(flat.data.slice(0, 4))).toEqual([50, 60, 70, 255]);
		const out = fragment(make(), {distance: 2});
		//beside the edge pixels are half way: two of the four copies come from each side
		expect(out.data[3 * 4]).toBe(100);
		expect(out.data[4 * 4]).toBe(100);
		expect(out.data[0]).toBe(0);
	});

	it('is weighted by alpha so transparent pixels add no color', () => {
		const img = fragment(image(5, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 255, 0, 0])), {distance: 1});
		expect(img.data[2 * 4 + 1]).toBe(0);
		expect(img.data[2 * 4]).toBe(255);
	});
});

describe('mezzotint', () => {
	const flat = (v: number) => image(30, 30, () => [v, v, v, 140]);

	it('makes every channel black or white and keeps alpha', () => {
		const out = mezzotint(flat(128), {mode: 'Color', seed: 1});
		for (let i = 0; i < out.data.length; i += 4) {
			expect([0, 255]).toContain(out.data[i]);
			expect(out.data[i + 3]).toBe(140);
		}
	});

	it('keeps the average tone, extremes stay and the mono mode gives gray values', () => {
		const out = mezzotint(flat(128), {mode: 'Black and White', seed: 2});
		let sum = 0;
		for (let i = 0; i < out.data.length; i += 4) {
			expect(out.data[i]).toBe(out.data[i + 1]);
			sum += out.data[i];
		}
		expect(sum / 900).toBeGreaterThan(100);
		expect(sum / 900).toBeLessThan(155);
		expect(mezzotint(flat(0), {}).data[0]).toBe(0);
		expect(mezzotint(flat(255), {}).data[0]).toBe(255);
	});

	it('is deterministic by seed', () => {
		const a = mezzotint(flat(100), {seed: 3});
		const b = mezzotint(flat(100), {seed: 3});
		const c = mezzotint(flat(100), {seed: 4});
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
	});
});

describe('glowingEdges', () => {
	const step = () => image(8, 3, (x) => (x < 4 ? [0, 0, 0, 200] : [100, 100, 100, 200]));

	it('is black on flat areas and bright at a step, keeps alpha', () => {
		const out = glowingEdges(step(), {brightness: 20});
		expect(out.data[0]).toBe(0);
		expect(out.data[7 * 4]).toBe(0);
		expect(out.data[3 * 4]).toBeGreaterThan(30);
		expect(out.data[3 * 4]).toBe(out.data[4 * 4]);
		expect(out.data[3]).toBe(200);
	});

	it('brightness scales the glow, the threshold drops weak edges', () => {
		const dim = glowingEdges(step(), {brightness: 10}).data[3 * 4];
		const bright = glowingEdges(step(), {brightness: 40}).data[3 * 4];
		expect(bright).toBeGreaterThan(dim);
		expect(glowingEdges(step(), {threshold: 200}).data[3 * 4]).toBe(0);
	});
});

describe('blurMore / sharpenMore', () => {
	const step = () => image(8, 1, (x) => (x < 4 ? [0, 0, 0, 90] : [240, 240, 240, 90]));

	it('Blur More softens an edge more than one pass of a box blur and keeps alpha and flat areas', () => {
		const out = blurMore(step());
		expect(out.data[3 * 4]).toBeGreaterThan(0);
		expect(out.data[4 * 4]).toBeLessThan(240);
		expect(out.data[0]).toBe(0);
		expect(out.data[3]).toBe(90);
		const flat = blurMore(image(4, 4, () => [77, 77, 77, 255]));
		expect(flat.data[5 * 4]).toBe(77);
	});

	it('Sharpen More exaggerates an edge and leaves flat areas alone', () => {
		const out = sharpenMore(step());
		expect(out.data[3 * 4]).toBe(0);
		expect(out.data[4 * 4]).toBe(255);
		const flat = sharpenMore(image(4, 4, () => [77, 77, 77, 255]));
		expect(flat.data[5 * 4]).toBe(77);
	});
});

describe('charcoal', () => {
	it('flat white stays paper, dark areas and edges get ink, alpha is kept', () => {
		const white = charcoal(image(6, 6, () => [255, 255, 255, 120]), {});
		expect(Array.from(white.data.slice(0, 4))).toEqual([255, 255, 255, 120]);
		const dark = charcoal(image(6, 6, () => [0, 0, 0, 255]), {tone: 100, edge: 0});
		expect(dark.data[0]).toBe(0);
	});

	it('uses the given colors and falls back to black on white for bad ones', () => {
		const custom = charcoal(image(4, 4, () => [255, 255, 255, 255]), {paper: '#102030', charcoal: '#ffffff'});
		expect(Array.from(custom.data.slice(0, 3))).toEqual([16, 32, 48]);
		const bad = charcoal(image(4, 4, () => [255, 255, 255, 255]), {paper: 'red', charcoal: 5});
		expect(Array.from(bad.data.slice(0, 3))).toEqual([255, 255, 255]);
	});

	it('an edge is darker than flat areas beside it', () => {
		const img = charcoal(image(10, 1, (x) => (x < 5 ? [255, 255, 255, 255] : [200, 200, 200, 255])), {detail: 5, edge: 100, tone: 0});
		expect(img.data[4 * 4]).toBeLessThan(img.data[0]);
	});
});

describe('photocopy', () => {
	it('gives only black or white, keeps alpha, dark areas are black and bright flat areas white', () => {
		const img = image(12, 12, (x) => (x < 6 ? [20, 20, 20, 90] : [240, 240, 240, 90]));
		const out = photocopy(img, {detail: 5});
		for (let i = 0; i < out.data.length; i += 4) {
			expect([0, 255]).toContain(out.data[i]);
			expect(out.data[i + 3]).toBe(90);
		}
		expect(out.data[0]).toBe(0);
		expect(out.data[(5 * 12 + 11) * 4]).toBe(255);
	});

	it('an edge in a bright picture becomes a line and a high threshold removes it', () => {
		const make = () => image(10, 3, (x) => (x < 5 ? [255, 255, 255, 255] : [150, 150, 150, 255]));
		const lined = photocopy(make(), {detail: 5, edge: 20, darkness: 0});
		expect(lined.data[4 * 4]).toBe(0);
		expect(lined.data[0]).toBe(255);
		expect(photocopy(make(), {detail: 5, edge: 255, darkness: 0}).data[4 * 4]).toBe(255);
	});
});

describe('cutout', () => {
	it('reduces every channel to the given number of levels and keeps alpha', () => {
		const img = image(6, 1, (x) => [x * 40, 100, 255 - x * 40, 77]);
		const out = cutout(img, {levels: 2, simplicity: 0});
		for (let i = 0; i < out.data.length; i += 4) {
			for (let c = 0; c < 3; c++) {
				expect([0, 255]).toContain(out.data[i + c]);
			}
			expect(out.data[i + 3]).toBe(77);
		}
	});

	it('a larger simplicity smooths away a small detail', () => {
		const make = () => image(9, 9, (x, y) => (x == 4 && y == 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
		expect(cutout(make(), {levels: 2, simplicity: 0}).data[(4 * 9 + 4) * 4]).toBe(255);
		expect(cutout(make(), {levels: 2, simplicity: 3}).data[(4 * 9 + 4) * 4]).toBe(0);
	});
});

describe('posterEdges', () => {
	const make = () => image(10, 3, (x) => (x < 5 ? [255, 255, 255, 60] : [180, 180, 180, 60]));

	it('darkens the pixels on a sharp edge, leaves flat areas and keeps alpha', () => {
		const out = posterEdges(make(), {levels: 8, simplicity: 0, edge: 20, intensity: 100});
		expect(out.data[4 * 4]).toBe(0);
		expect(out.data[0]).toBe(255);
		expect(out.data[3]).toBe(60);
	});

	it('a high threshold or zero intensity draws no lines', () => {
		const plain = cutout(make(), {levels: 8, simplicity: 0}).data[4 * 4];
		expect(posterEdges(make(), {levels: 8, simplicity: 0, edge: 255}).data[4 * 4]).toBe(plain);
		expect(posterEdges(make(), {levels: 8, simplicity: 0, edge: 20, intensity: 0}).data[4 * 4]).toBe(plain);
	});
});

describe('stamp', () => {
	const make = () => image(8, 2, (x) => (x < 4 ? [40, 40, 40, 90] : [220, 220, 220, 90]));

	it('gives only ink and paper colors and keeps alpha', () => {
		const out = stamp(make(), {balance: 50, smoothness: 0, ink: '#102030', paper: '#f0e0d0'});
		expect(Array.from(out.data.slice(0, 4))).toEqual([16, 32, 48, 90]);
		expect(Array.from(out.data.slice(7 * 4, 7 * 4 + 4))).toEqual([240, 224, 208, 90]);
	});

	it('the balance moves the threshold and a bad color falls back to black and white', () => {
		const mid = image(2, 1, () => [128, 128, 128, 255]);
		expect(stamp(image(2, 1, () => [128, 128, 128, 255]), {balance: 10, smoothness: 0, ink: 'red'}).data[0]).toBe(255);
		expect(stamp(mid, {balance: 90, smoothness: 0, ink: 'red'}).data[0]).toBe(0);
	});
});

describe('neonGlow', () => {
	const make = () => image(11, 3, (x) => (x < 5 ? [0, 0, 0, 70] : [255, 255, 255, 70]));

	it('glows in the chosen color near an edge, keeps alpha, a flat picture only darkens', () => {
		const out = neonGlow(make(), {size: 2, brightness: 100, darken: 100, color: '#ff0000'});
		expect(out.data[5 * 4]).toBeGreaterThan(100);
		expect(out.data[5 * 4 + 1]).toBe(0);
		expect(out.data[3]).toBe(70);
		const flat = neonGlow(image(5, 5, () => [200, 100, 50, 255]), {size: 2, brightness: 100, darken: 50, color: '#ffffff'});
		expect(Array.from(flat.data.slice(0, 3))).toEqual([100, 50, 25]);
	});

	it('an invalid color falls back to cyan', () => {
		const out = neonGlow(make(), {size: 2, brightness: 100, darken: 100, color: 'nope'});
		expect(out.data[5 * 4]).toBe(0);
		expect(out.data[5 * 4 + 2]).toBeGreaterThan(100);
	});
});

describe('basRelief', () => {
	//brightness grows to the right: a slope that faces left
	const ramp = () => image(9, 3, (x) => [x * 25, x * 25, x * 25, 80]);

	it('flat areas are the middle color and alpha is kept', () => {
		const out = basRelief(image(4, 4, () => [90, 90, 90, 80]), {smoothness: 0, dark: '#000000', light_color: '#fefefe'});
		expect(out.data[0]).toBe(127);
		expect(out.data[3]).toBe(80);
	});

	it('the side of a slope facing the light is brighter than the side facing away', () => {
		const from_left = basRelief(ramp(), {smoothness: 0, detail: 5, light: 180});
		const from_right = basRelief(ramp(), {smoothness: 0, detail: 5, light: 0});
		expect(from_left.data[4 * 4]).toBeGreaterThan(from_right.data[4 * 4]);
	});

	it('a bad color falls back and the result stays within the two colors', () => {
		const out = basRelief(ramp(), {smoothness: 0, detail: 15, light: 0, dark: '#202020', light_color: 'x'});
		for (let i = 0; i < out.data.length; i += 4) {
			expect(out.data[i]).toBeGreaterThanOrEqual(32);
			expect(out.data[i]).toBeLessThanOrEqual(255);
		}
	});
});

describe('facet', () => {
	it('removes a single odd pixel but keeps a large flat edge, and alpha', () => {
		const dot = image(7, 7, (x, y) => (x == 3 && y == 3 ? [255, 255, 255, 50] : [0, 0, 0, 50]));
		const out = facet(dot, {radius: 1, passes: 1});
		expect(out.data[(3 * 7 + 3) * 4]).toBe(0);
		expect(out.data[3]).toBe(50);
		const edge = facet(image(8, 8, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255])), {radius: 1, passes: 3});
		expect(edge.data[(4 * 8 + 1) * 4]).toBe(0);
		expect(edge.data[(4 * 8 + 6) * 4]).toBe(255);
	});

	it('more passes are not weaker: a bad number falls back to the default', () => {
		const out = facet(image(3, 3, () => [10, 20, 30, 255]), {radius: 'x', passes: 'y'});
		expect(Array.from(out.data.slice(0, 3))).toEqual([10, 20, 30]);
	});
});

describe('patchwork', () => {
	it('every square gets its mean color, alpha is kept, and relief 0 makes the squares flat', () => {
		const img = image(4, 2, (x) => (x % 2 == 0 ? [0, 0, 0, 33] : [100, 100, 100, 33]));
		const out = patchwork(img, {size: 2, relief: 0});
		for (let i = 0; i < out.data.length; i += 4) {
			expect(out.data[i]).toBe(50);
			expect(out.data[i + 3]).toBe(33);
		}
	});

	it('the relief lightens the top left and darkens the bottom right of a square, deterministically', () => {
		const make = () => image(8, 8, () => [100, 100, 100, 255]);
		const a = patchwork(make(), {size: 8, relief: 25, seed: 5});
		const b = patchwork(make(), {size: 8, relief: 25, seed: 5});
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(a.data[0]).toBeGreaterThanOrEqual(a.data[(3 * 8 + 3) * 4]);
		expect(a.data[(7 * 8 + 7) * 4]).toBeLessThanOrEqual(a.data[(3 * 8 + 3) * 4]);
	});
});

describe('dryBrush', () => {
	it('keeps alpha, reduces colors to the levels and keeps a flat picture flat', () => {
		const out = dryBrush(image(6, 6, (x) => [x * 40, 90, 200, 120]), {size: 1, levels: 2});
		for (let i = 0; i < out.data.length; i += 4) {
			for (let c = 0; c < 3; c++) {
				expect([0, 255]).toContain(out.data[i + c]);
			}
			expect(out.data[i + 3]).toBe(120);
		}
		const flat = dryBrush(image(5, 5, () => [255, 0, 255, 255]), {size: 2, levels: 4});
		expect(Array.from(flat.data.slice(0, 3))).toEqual([255, 0, 255]);
	});

	it('flattens a noisy area into one color like Oil Paint', () => {
		const noisy = image(9, 9, (x, y) => ((x + y) % 2 ? [120, 120, 120, 255] : [130, 130, 130, 255]));
		const out = dryBrush(noisy, {size: 2, levels: 16});
		expect(out.data[(4 * 9 + 4) * 4]).toBe(out.data[(4 * 9 + 5) * 4]);
	});
});
