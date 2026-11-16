import { box_sizes_for_gaussian, GAUSSIAN_EXACT_LIMIT, lensBlur, gaussianBlur, smartSharpen, diffuseGlow, dryBrush, patchwork, facet, basRelief, neonGlow, stamp, crosshatch, spatter, angledStrokes, inkOutlines, sprayedStrokes, chrome, texturizer, posterEdges, cutout, photocopy, charcoal, blurMore, sharpenMore, glowingEdges, mezzotint, fragment, despeckle, customKernel, traceContour, wind, average, tiles, oilPaint, diffuse, pixelate, unsharpMask, highPass, median, maxMin, offset, motionBlur, clarity, mirror, smartBlur } from '../src/js/libs/filters.js';

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

describe('diffuseGlow', () => {
	const make = () => image(8, 8, () => [120, 60, 30, 77]);

	it('only brightens, keeps alpha and is repeatable for the same seed', () => {
		const a = diffuseGlow(make(), {graininess: 5, glow: 20, size: 2, seed: 3});
		const b = diffuseGlow(make(), {graininess: 5, glow: 20, size: 2, seed: 3});
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		for (let i = 0; i < a.data.length; i += 4) {
			expect(a.data[i]).toBeGreaterThanOrEqual(120);
			expect(a.data[i + 1]).toBeGreaterThanOrEqual(60);
			expect(a.data[i + 3]).toBe(77);
		}
	});

	it('zero glow changes nothing, a different seed changes the grain, a bad color glows white', () => {
		expect(Array.from(diffuseGlow(make(), {glow: 0}).data)).toEqual(Array.from(make().data));
		const one = diffuseGlow(make(), {graininess: 10, glow: 20, size: 1, seed: 1});
		const two = diffuseGlow(make(), {graininess: 10, glow: 20, size: 1, seed: 2});
		expect(Array.from(one.data)).not.toEqual(Array.from(two.data));
		const white = diffuseGlow(image(4, 4, () => [0, 0, 0, 255]), {graininess: 0, glow: 20, size: 1, color: 'nope'});
		expect(white.data[0]).toBe(white.data[1]);
	});

	it('the glow color tints the glow', () => {
		const red = diffuseGlow(image(4, 4, () => [100, 100, 100, 255]), {graininess: 0, glow: 20, size: 1, color: '#ff0000'});
		expect(red.data[0]).toBeGreaterThan(red.data[1]);
		expect(red.data[1]).toBe(100);
	});
});

describe('smartSharpen', () => {
	const edge = () => image(10, 1, (x) => (x < 5 ? [100, 100, 100, 66] : [140, 140, 140, 66]));

	it('sharpens an edge like Unsharp Mask and keeps alpha', () => {
		const out = smartSharpen(edge(), {amount: 200, radius: 2, reduce_noise: 0});
		expect(out.data[4 * 4]).toBeLessThan(100);
		expect(out.data[5 * 4]).toBeGreaterThan(140);
		expect(out.data[3]).toBe(66);
		const plain = unsharpMask(edge(), {amount: 200, radius: 2, threshold: 0});
		expect(Array.from(out.data)).toEqual(Array.from(plain.data));
	});

	it('leaves a small difference alone when it counts as noise', () => {
		const slight = () => image(10, 1, (x) => (x < 5 ? [100, 100, 100, 255] : [104, 104, 104, 255]));
		const untouched = smartSharpen(slight(), {amount: 300, radius: 2, reduce_noise: 100});
		expect(Array.from(untouched.data)).toEqual(Array.from(slight().data));
	});

	it('fading shadows spares dark pixels and fading highlights spares bright ones', () => {
		const dark = () => image(10, 1, (x) => (x < 5 ? [10, 10, 10, 255] : [50, 50, 50, 255]));
		const change = (out: {data: Uint8ClampedArray}, source: {data: Uint8ClampedArray}) => Math.abs(out.data[4 * 4] - source.data[4 * 4]);
		const full = change(smartSharpen(dark(), {amount: 300, fade_shadows: 0}), dark());
		const faded = change(smartSharpen(dark(), {amount: 300, fade_shadows: 100}), dark());
		expect(full).toBeGreaterThan(0);
		expect(faded).toBeLessThan(full);
		const bright = () => image(10, 1, (x) => (x < 5 ? [210, 210, 210, 255] : [250, 250, 250, 255]));
		const bright_full = change(smartSharpen(bright(), {amount: 300}), bright());
		const bright_faded = change(smartSharpen(bright(), {amount: 300, fade_highlights: 100}), bright());
		expect(bright_faded).toBeLessThan(bright_full);
	});
});

describe('gaussianBlur', () => {
	it('zero radius changes nothing and a flat picture stays flat', () => {
		const img = image(6, 6, (x) => [x * 40, 10, 20, 90]);
		const copy = Array.from(img.data);
		expect(Array.from(gaussianBlur(img, {radius: 0}).data)).toEqual(copy);
		const flat = gaussianBlur(image(7, 7, () => [90, 120, 30, 200]), {radius: 2});
		for (let i = 0; i < flat.data.length; i += 4) {
			expect(Array.from(flat.data.slice(i, i + 4))).toEqual([90, 120, 30, 200]);
		}
	});

	it('spreads a bright pixel symmetrically and keeps the total light roughly', () => {
		const dot = image(9, 9, (x, y) => (x == 4 && y == 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
		const out = gaussianBlur(dot, {radius: 1});
		const at = (x: number, y: number) => out.data[(y * 9 + x) * 4];
		expect(at(4, 4)).toBeLessThan(255);
		expect(at(3, 4)).toBeGreaterThan(0);
		expect(at(3, 4)).toBe(at(5, 4));
		expect(at(4, 3)).toBe(at(4, 5));
		expect(at(3, 4)).toBe(at(4, 3));
		let sum = 0;
		for (let i = 0; i < out.data.length; i += 4) {
			sum += out.data[i];
		}
		expect(Math.abs(sum - 255)).toBeLessThan(20);
	});

	it('a larger radius blurs more', () => {
		const make = () => image(15, 1, (x) => (x < 7 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
		const small = gaussianBlur(make(), {radius: 1});
		const large = gaussianBlur(make(), {radius: 3});
		expect(large.data[4 * 4]).toBeGreaterThan(small.data[4 * 4]);
	});

	it('the color of transparent pixels does not bleed into the edge', () => {
		const img = image(7, 1, (x) => (x < 3 ? [255, 0, 0, 0] : [0, 0, 255, 255]));
		const out = gaussianBlur(img, {radius: 1.5});
		//the edge pixel is half transparent but still pure blue, not purple
		expect(out.data[3 * 4 + 3]).toBeGreaterThan(0);
		expect(out.data[3 * 4 + 3]).toBeLessThan(255);
		expect(out.data[3 * 4]).toBe(0);
		expect(out.data[3 * 4 + 2]).toBe(255);
	});
});

describe('lensBlur', () => {
	it('zero radius changes nothing and a flat picture stays flat with its alpha', () => {
		const img = image(5, 5, (x) => [x * 40, 10, 20, 90]);
		const copy = Array.from(img.data);
		expect(Array.from(lensBlur(img, {radius: 0}).data)).toEqual(copy);
		const flat = lensBlur(image(9, 9, () => [90, 120, 30, 200]), {radius: 3, highlights: 50});
		for (let i = 0; i < flat.data.length; i += 4) {
			expect(Array.from(flat.data.slice(i, i + 4))).toEqual([90, 120, 30, 200]);
		}
	});

	it('spreads a light point into a disc with a hard edge, not a soft ramp', () => {
		const size = 21;
		const dot = image(size, size, (x, y) => (x == 10 && y == 10 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
		const out = lensBlur(dot, {radius: 4, highlights: 0});
		const at = (x: number, y: number) => out.data[(y * size + x) * 4];
		//inside the disc all pixels are equal, outside there is nothing
		expect(at(10, 10)).toBe(at(12, 10));
		expect(at(10, 10)).toBe(at(10, 7));
		expect(at(10, 10)).toBeGreaterThan(0);
		expect(at(10 + 6, 10)).toBe(0);
	});

	it('bright pixels weigh more with highlights, so they stay brighter', () => {
		const make = () => image(11, 11, (x, y) => (x == 5 && y == 5 ? [255, 255, 255, 255] : [60, 60, 60, 255]));
		const plain = lensBlur(make(), {radius: 3, highlights: 0});
		const boosted = lensBlur(make(), {radius: 3, highlights: 100, threshold: 150});
		expect(boosted.data[(5 * 11 + 6) * 4]).toBeGreaterThan(plain.data[(5 * 11 + 6) * 4]);
	});

	it('the color of transparent pixels does not bleed into the edge', () => {
		const img = image(9, 1, (x) => (x < 4 ? [255, 0, 0, 0] : [0, 0, 255, 255]));
		const out = lensBlur(img, {radius: 2});
		expect(out.data[4 * 4 + 3]).toBeLessThan(255);
		expect(out.data[4 * 4 + 3]).toBeGreaterThan(0);
		expect(out.data[4 * 4]).toBe(0);
		expect(out.data[4 * 4 + 2]).toBe(255);
	});
});

describe('median (histogram) against a plain sort', () => {
	//the straightforward version: sort the whole neighborhood of every channel
	function reference(image: { data: Uint8ClampedArray; width: number; height: number }, radius: number) {
		const { width: w, height: h } = image;
		const src = new Uint8ClampedArray(image.data);
		const out = new Uint8ClampedArray(src);
		const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				for (let c = 0; c < 3; c++) {
					const values: number[] = [];
					for (let dy = -radius; dy <= radius; dy++) {
						for (let dx = -radius; dx <= radius; dx++) {
							values.push(src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c]);
						}
					}
					values.sort((a, b) => a - b);
					out[(y * w + x) * 4 + c] = values[values.length >> 1];
				}
			}
		}
		return out;
	}

	const noise = (w: number, h: number, seed: number) => {
		const data = new Uint8ClampedArray(w * h * 4);
		let s = seed;
		for (let i = 0; i < data.length; i++) {
			s = (s * 1103515245 + 12345) & 0x7fffffff;
			data[i] = (s >> 8) & 255;
		}
		return { data, width: w, height: h };
	};

	it('gives exactly the same picture for every radius, also on tiny pictures', () => {
		for (const [w, h] of [[17, 13], [3, 3], [1, 8], [9, 1], [30, 4]]) {
			for (const radius of [1, 2, 3, 5]) {
				const img = noise(w, h, w * 31 + h + radius);
				const expected = reference(img, radius);
				const out = median(img, radius);
				expect(Array.from(out.data)).toEqual(Array.from(expected));
			}
		}
	});

	it('keeps alpha, and a bad radius counts as 1 and a large one as 5', () => {
		const img = noise(10, 10, 7);
		const alpha = Array.from(img.data).filter((_, i) => i % 4 == 3);
		const out = median(noise(10, 10, 7), 'x' as any);
		expect(Array.from(out.data).filter((_, i) => i % 4 == 3)).toEqual(alpha);
		expect(Array.from(out.data)).toEqual(Array.from(reference(noise(10, 10, 7), 1)));
		expect(Array.from(median(noise(10, 10, 7), 99).data)).toEqual(Array.from(reference(noise(10, 10, 7), 5)));
	});
});

describe('lensBlur (running sums) against the plain disc', () => {
	//the straightforward version: every pixel of the disc is visited
	function reference(image: { data: Uint8ClampedArray; width: number; height: number }, radius: number, highlights: number, threshold: number) {
		const { width: w, height: h, data } = image;
		const boost = highlights / 100 * 9;
		const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
		const weight = new Float64Array(w * h);
		for (let p = 0; p < w * h; p++) {
			const luma = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;
			const t = clamp((luma - threshold) / (255 - threshold), 0, 1);
			weight[p] = 1 + boost * t * t * (3 - 2 * t);
		}
		const out = new Uint8ClampedArray(data.length);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let r = 0, g = 0, b = 0, a = 0, total = 0;
				for (let dy = -radius; dy <= radius; dy++) {
					for (let dx = -radius; dx <= radius; dx++) {
						if (dx * dx + dy * dy > radius * radius + radius * 0.5) {
							continue;
						}
						const p = clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1);
						const alpha = data[p * 4 + 3] / 255;
						r += data[p * 4] * alpha * weight[p];
						g += data[p * 4 + 1] * alpha * weight[p];
						b += data[p * 4 + 2] * alpha * weight[p];
						a += alpha * weight[p];
						total += weight[p];
					}
				}
				const i = (y * w + x) * 4;
				if (a > 0) {
					out[i] = Math.round(r / a);
					out[i + 1] = Math.round(g / a);
					out[i + 2] = Math.round(b / a);
				}
				out[i + 3] = Math.round(a / total * 255);
			}
		}
		return out;
	}

	const noise = (w: number, h: number, seed: number) => {
		const data = new Uint8ClampedArray(w * h * 4);
		let s = seed;
		for (let i = 0; i < data.length; i++) {
			s = (s * 1103515245 + 12345) & 0x7fffffff;
			data[i] = (s >> 8) & 255;
		}
		return { data, width: w, height: h };
	};

	it('gives the same picture (within one level) for several radii, sizes and highlights', () => {
		for (const [w, h] of [[23, 17], [5, 4], [1, 9], [12, 1]]) {
			for (const [radius, highlights] of [[1, 0], [3, 50], [6, 100], [9, 30]]) {
				const img = noise(w, h, w * 7 + h * 3 + radius);
				const expected = reference(img, radius, highlights, 200);
				const out = lensBlur(noise(w, h, w * 7 + h * 3 + radius), {radius, highlights, threshold: 200});
				for (let i = 0; i < out.data.length; i++) {
					expect(Math.abs(out.data[i] - expected[i])).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe('gaussianBlur with box blurs for a large radius', () => {
	it('the three box widths are odd and give about the variance of the Gaussian', () => {
		for (const sigma of [13, 20, 45, 100]) {
			const sizes = box_sizes_for_gaussian(sigma);
			expect(sizes.length).toBe(3);
			sizes.forEach((size) => expect(size % 2).toBe(1));
			const variance = sizes.reduce((sum, size) => sum + (size * size - 1) / 12, 0);
			expect(Math.abs(Math.sqrt(variance) - sigma) / sigma).toBeLessThan(0.05);
		}
	});

	it('is close to the exact kernel (a step edge, 20 px radius) and keeps flat areas, alpha and the total light', () => {
		const w = 120;
		const step = () => image(w, 3, (x) => (x < 60 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
		const blurred = gaussianBlur(step(), {radius: 20});
		//the exact blur of an edge is an error function: 50 % at the edge, about 84 % one sigma away
		const at = (x: number) => blurred.data[x * 4];
		expect(Math.abs(at(59) - 127)).toBeLessThan(8);
		expect(Math.abs(at(80) - 255 * 0.84)).toBeLessThan(14);
		expect(Math.abs(at(40) - 255 * 0.16)).toBeLessThan(14);
		for (let x = 0; x < w; x++) {
			expect(blurred.data[x * 4 + 3]).toBe(255);
		}
		const flat = gaussianBlur(image(40, 40, () => [90, 120, 30, 200]), {radius: 25});
		for (let i = 0; i < flat.data.length; i += 4) {
			expect(Array.from(flat.data.slice(i, i + 4))).toEqual([90, 120, 30, 200]);
		}
		expect(GAUSSIAN_EXACT_LIMIT).toBe(12);
	});

	it('switches from the exact kernel to the boxes without a jump', () => {
		const make = () => image(100, 1, (x) => (x < 50 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
		const exact = gaussianBlur(make(), {radius: GAUSSIAN_EXACT_LIMIT});
		const boxes = gaussianBlur(make(), {radius: GAUSSIAN_EXACT_LIMIT + 0.5});
		for (let x = 0; x < 100; x++) {
			expect(Math.abs(exact.data[x * 4] - boxes.data[x * 4])).toBeLessThan(12);
		}
	});
});

describe('crosshatch', () => {
	it('white stays paper and black gets all four line families', () => {
		const white = crosshatch(image(12, 12, () => [255, 255, 255, 255]), {spacing: 4, thickness: 1, smoothness: 0});
		expect(white.data.every((v: number, i: number) => i % 4 == 3 || v == 255)).toBe(true);
		const black = crosshatch(image(12, 12, () => [0, 0, 0, 255]), {spacing: 4, thickness: 1, smoothness: 0, ink: '#112233', paper: '#ffffff'});
		const at = (x: number, y: number) => black.data[(y * 12 + x) * 4];
		expect(at(0, 0)).toBe(0x11); //on every family
		expect(at(1, 1)).toBe(0x11); //the horizontal line? y = 1 is not, but x - y = 0 is
		expect(at(2, 1)).toBe(255); //x + y = 3, x - y = 1, y = 1, x = 2: none
	});

	it('keeps alpha and a darker area has more ink', () => {
		const count = (v: number) => {
			const out = crosshatch(image(16, 16, () => [v, v, v, 77]), {spacing: 4, thickness: 1, smoothness: 0, ink: '#000000'});
			expect(out.data[3]).toBe(77);
			return out.data.filter((c: number, i: number) => i % 4 == 0 && c == 0).length;
		};
		expect(count(180)).toBeLessThan(count(120));
		expect(count(120)).toBeLessThan(count(20));
		expect(count(250)).toBe(0);
	});
});

describe('spatter', () => {
	const make = () => image(20, 20, (x, y) => [x * 10, y * 10, 5, 200]);

	it('is deterministic, keeps the palette of the source and radius 0 changes nothing', () => {
		const a = spatter(make(), {radius: 6, smoothness: 3, seed: 4});
		const b = spatter(make(), {radius: 6, smoothness: 3, seed: 4});
		expect(Array.from(a.data)).toEqual(Array.from(b.data));
		expect(Array.from(spatter(make(), {radius: 0}).data)).toEqual(Array.from(make().data));
		expect(a.data.every((v: number, i: number) => i % 4 != 2 ? v % 10 == 0 : v == 5 || i % 4 == 3 ? true : v == 5)).toBe(true);
	});

	it('moves pixels at most by the radius and a seed changes the result', () => {
		const out = spatter(make(), {radius: 3, smoothness: 4, seed: 1});
		for (let y = 0; y < 20; y++) {
			for (let x = 0; x < 20; x++) {
				const i = (y * 20 + x) * 4;
				expect(Math.abs(out.data[i] / 10 - x)).toBeLessThanOrEqual(3);
				expect(Math.abs(out.data[i + 1] / 10 - y)).toBeLessThanOrEqual(3);
			}
		}
		const other = spatter(make(), {radius: 3, smoothness: 4, seed: 2});
		expect(Array.from(other.data)).not.toEqual(Array.from(out.data));
	});
});

describe('angledStrokes', () => {
	it('light pixels are smeared along the angle, dark ones across it', () => {
		// a vertical white line on gray: horizontal strokes (angle 0) smear it sideways, only light pixels stroke along the angle
		const make = () => image(9, 9, (x) => (x == 4 ? [255, 255, 255, 255] : [100, 100, 100, 255]));
		const out = angledStrokes(make(), {angle: 0, length: 3});
		// light centre pixel: horizontal mean of (100, 255, 100)
		expect(out.data[(4 * 9 + 4) * 4]).toBe(Math.round((100 + 255 + 100) / 3));
		// dark neighbour strokes vertically across the line: all 100
		expect(out.data[(4 * 9 + 3) * 4]).toBe(100);
	});

	it('a flat picture stays, length 1 changes nothing and alpha is kept', () => {
		const flat = angledStrokes(image(6, 6, () => [200, 50, 20, 120]), {angle: 30, length: 7});
		expect(Array.from(flat.data.slice(0, 4))).toEqual([200, 50, 20, 120]);
		const one = image(3, 3, (x, y) => [x * 80, y * 80, 9, 255]);
		expect(Array.from(angledStrokes(image(3, 3, (x, y) => [x * 80, y * 80, 9, 255]), {length: 1}).data)).toEqual(Array.from(one.data));
	});
});

describe('inkOutlines', () => {
	const make = () => image(10, 10, (x) => (x < 5 ? [230, 230, 230, 200] : [40, 40, 40, 200]));

	it('draws ink on an edge, leaves flat areas alone and keeps alpha', () => {
		const out = inkOutlines(make(), {smoothness: 0, threshold: 10, intensity: 100, ink: '#000000'});
		const px = (x: number) => out.data[(5 * 10 + x) * 4];
		expect(px(4)).toBe(0);
		expect(px(5)).toBe(0);
		expect(px(0)).toBe(230);
		expect(px(9)).toBe(40);
		expect(out.data[3]).toBe(200);
	});

	it('intensity 0 changes nothing and a high threshold finds no edge', () => {
		expect(Array.from(inkOutlines(make(), {smoothness: 0, threshold: 10, intensity: 0}).data)).toEqual(Array.from(make().data));
		expect(Array.from(inkOutlines(make(), {smoothness: 0, threshold: 254}).data)).toEqual(Array.from(make().data));
	});
});

describe('sprayedStrokes', () => {
	const make = () => image(30, 30, (x, y) => [x * 8, y * 8, 5, 200]);

	it('moves pixels only along the angle, within the length, deterministically', () => {
		const out = sprayedStrokes(make(), {angle: 0, length: 5, seed: 3});
		let moved = 0;
		for (let y = 0; y < 30; y++) {
			for (let x = 0; x < 30; x++) {
				const i = (y * 30 + x) * 4;
				expect(out.data[i + 1]).toBe(y * 8); //horizontal spray keeps the row
				expect(Math.abs(out.data[i] / 8 - x)).toBeLessThanOrEqual(5);
				if (out.data[i] != x * 8) {
					moved++;
				}
			}
		}
		expect(moved).toBeGreaterThan(300);
		expect(Array.from(sprayedStrokes(make(), {angle: 0, length: 5, seed: 3}).data)).toEqual(Array.from(out.data));
	});

	it('length 0 changes nothing', () => {
		expect(Array.from(sprayedStrokes(make(), {length: 0}).data)).toEqual(Array.from(make().data));
	});
});

describe('chrome', () => {
	it('maps brightness through a sine: gray output, mid brightness stays mid, alpha kept', () => {
		const out = chrome(image(3, 1, (x) => [[0, 0, 0, 77], [128, 128, 128, 77], [255, 255, 255, 77]][x]), {detail: 1, smoothness: 0});
		expect(out.data[0]).toBe(out.data[1]);
		expect(out.data[1]).toBe(out.data[2]);
		expect(out.data[3]).toBe(77);
		expect(Math.abs(out.data[4] - 128)).toBeLessThanOrEqual(1); //sin(0) = 0 -> 127.5
		expect(out.data[0]).toBe(0); //sin(-pi/2) = -1
		expect(out.data[8]).toBe(255); //sin(pi/2) = 1
	});

	it('more detail makes the brightness go up and down again', () => {
		const ramp = image(64, 1, (x) => [x * 4, x * 4, x * 4, 255]);
		const out = chrome(ramp, {detail: 3, smoothness: 0});
		let turns = 0;
		let last = 0;
		for (let x = 1; x < 64; x++) {
			const diff = Math.sign(out.data[x * 4] - out.data[(x - 1) * 4]); //plateaus at the extremes are skipped
			if (diff != 0) {
				if (last != 0 && diff != last) {
					turns++;
				}
				last = diff;
			}
		}
		expect(turns).toBeGreaterThanOrEqual(2);
	});
});

describe('texturizer', () => {
	const flat = () => image(32, 32, () => [128, 128, 128, 90]);

	it('relief 0 changes nothing, alpha is kept, gray stays gray', () => {
		expect(Array.from(texturizer(flat(), {relief: 0}).data)).toEqual(Array.from(flat().data));
		const out = texturizer(flat(), {scaling: 8, relief: 60});
		for (let i = 0; i < out.data.length; i += 4) {
			expect(out.data[i + 3]).toBe(90);
			expect(out.data[i]).toBe(out.data[i + 1]);
			expect(out.data[i]).toBe(out.data[i + 2]);
		}
	});

	it('repeats and gets deeper with relief', () => {
		const a = texturizer(flat(), {scaling: 8, relief: 50});
		//the over-under weave repeats after two thread distances
		expect(a.data[(5 * 32 + 3) * 4]).toBe(a.data[(5 * 32 + 19) * 4]);
		expect(a.data[(5 * 32 + 3) * 4]).toBe(a.data[(21 * 32 + 3) * 4]);
		const spread = (relief: number) => {
			const out = texturizer(flat(), {scaling: 8, relief});
			let lo = 255, hi = 0;
			for (let i = 0; i < out.data.length; i += 4) {
				lo = Math.min(lo, out.data[i]);
				hi = Math.max(hi, out.data[i]);
			}
			return hi - lo;
		};
		expect(spread(80)).toBeGreaterThan(spread(20));
		expect(spread(20)).toBeGreaterThan(0);
	});
});
