import { color_blend, parse_paint_color, recolor_dab } from '../src/js/libs/color-replace.js';
import { is_tool_disabled } from '../src/js/libs/raster-tools.js';

function image(w: number, h: number, color: number[]) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		data.set(color, i * 4);
	}
	return {data, width: w, height: h};
}

const lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

describe('color_blend', () => {
	it('keeps the luminosity of the pixel and the hue of the paint', () => {
		const out = color_blend([100, 100, 100], [255, 0, 0]);
		expect(Math.abs(lum(out) - 100)).toBeLessThan(2);
		expect(out[0]).toBeGreaterThan(out[1]);
		expect(out[1]).toBe(out[2]);
	});

	it('black stays black and white stays white, whatever the paint', () => {
		expect(color_blend([0, 0, 0], [255, 0, 0])).toEqual([0, 0, 0]);
		expect(color_blend([255, 255, 255], [0, 0, 255])).toEqual([255, 255, 255]);
	});

	it('painting with gray makes the pixel gray', () => {
		const out = color_blend([200, 50, 20], [90, 90, 90]);
		expect(out[0]).toBe(out[1]);
		expect(out[1]).toBe(out[2]);
		expect(Math.abs(out[0] - lum([200, 50, 20]))).toBeLessThan(2);
	});

	it('stays inside 0-255 for strong colors', () => {
		for (const base of [[10, 240, 30], [250, 250, 5], [3, 3, 250]]) {
			for (const paint of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]) {
				for (const v of color_blend(base, paint)) {
					expect(v).toBeGreaterThanOrEqual(0);
					expect(v).toBeLessThanOrEqual(255);
				}
			}
		}
	});
});

describe('parse_paint_color', () => {
	it('reads #rrggbb only', () => {
		expect(parse_paint_color('#ff8000')).toEqual([255, 128, 0]);
		expect(parse_paint_color('red')).toBeNull();
		expect(parse_paint_color('#fff')).toBeNull();
		expect(parse_paint_color(null as any)).toBeNull();
	});
});

describe('recolor_dab', () => {
	it('recolors the middle, leaves the outside and keeps alpha', () => {
		const img = image(9, 9, [100, 100, 100, 200]);
		recolor_dab(img, 4.5, 4.5, 3, 100, 100, [255, 0, 0]);
		const at = (x: number, y: number) => Array.from(img.data.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 4));
		expect(at(4, 4)[0]).toBeGreaterThan(at(4, 4)[1]);
		expect(at(4, 4)[3]).toBe(200);
		expect(at(0, 0)).toEqual([100, 100, 100, 200]);
	});

	it('skips transparent pixels, opacity 0 and bad input', () => {
		const clear = image(5, 5, [100, 100, 100, 0]);
		recolor_dab(clear, 2.5, 2.5, 3, 100, 100, [255, 0, 0]);
		expect(Array.from(clear.data.slice(0, 4))).toEqual([100, 100, 100, 0]);
		const flat = image(5, 5, [100, 100, 100, 255]);
		recolor_dab(flat, 2.5, 2.5, 3, 100, 0, [255, 0, 0]);
		expect(Array.from(flat.data.slice(40, 44))).toEqual([100, 100, 100, 255]);
		recolor_dab(flat, 2.5, 2.5, NaN, 100, 100, [255, 0, 0]);
		recolor_dab(flat, 2.5, 2.5, 3, 100, 100, null as any);
		expect(Array.from(flat.data.slice(40, 44))).toEqual([100, 100, 100, 255]);
	});

	it('a soft edge is weaker than the center', () => {
		const img = image(15, 1, [100, 100, 100, 255]);
		recolor_dab(img, 7.5, 0.5, 6, 0, 100, [255, 0, 0]);
		const redness = (x: number) => img.data[x * 4] - img.data[x * 4 + 1];
		expect(redness(7)).toBeGreaterThan(redness(3));
		expect(redness(3)).toBeGreaterThan(0);
	});
});

describe('recolor_dab tolerance', () => {
	//left half dark gray, right half light gray
	const two_tones = () => {
		const img = image(10, 1, [60, 60, 60, 255]);
		for (let x = 5; x < 10; x++) {
			img.data.set([200, 200, 200, 255], x * 4);
		}
		return img;
	};

	it('changes only colors close to the one under the center', () => {
		const img = two_tones();
		recolor_dab(img, 4.5, 0.5, 6, 100, 100, [255, 0, 0], 20);
		expect(img.data[0] - img.data[1]).toBeGreaterThan(0);
		expect(img.data[9 * 4]).toBe(img.data[9 * 4 + 1]);
	});

	it('a high tolerance and the default change both tones, and a bad number counts as 100', () => {
		for (const args of [[100], [], [NaN as any]]) {
			const img = two_tones();
			recolor_dab(img, 4.5, 0.5, 6, 100, 100, [255, 0, 0], ...(args as [number]));
			expect(img.data[9 * 4] - img.data[9 * 4 + 1]).toBeGreaterThan(0);
		}
	});
});

describe('recolor_dab with a fixed reference ("Once")', () => {
	it('compares with the given color instead of the pixel under the center', () => {
		const img = image(10, 1, [60, 60, 60, 255]);
		for (let x = 5; x < 10; x++) {
			img.data.set([200, 200, 200, 255], x * 4);
		}
		//the center is on the light half, but the reference is the dark one
		recolor_dab(img, 7.5, 0.5, 8, 100, 100, [255, 0, 0], 20, [60, 60, 60]);
		expect(img.data[0] - img.data[1]).toBeGreaterThan(0);
		expect(img.data[9 * 4]).toBe(img.data[9 * 4 + 1]);
	});

	it('ignores a reference that is not three numbers', () => {
		const img = image(5, 1, [60, 60, 60, 255]);
		recolor_dab(img, 2.5, 0.5, 4, 100, 100, [255, 0, 0], 10, [1] as any);
		expect(img.data[8] - img.data[9]).toBeGreaterThan(0);
	});
});

describe('new tools on vector layers', () => {
	it('are raster tools', () => {
		expect(is_tool_disabled('pattern_stamp', {type: 'text', is_vector: true})).toBe(true);
		expect(is_tool_disabled('color_replace', {type: 'text', is_vector: true})).toBe(true);
		expect(is_tool_disabled('color_replace', {type: 'image', is_vector: false})).toBe(false);
	});
});
