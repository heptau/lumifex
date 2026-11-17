import {
	blend_value, extract_channel, apply_image, calculations, clean_apply_mode, clean_apply_channel, APPLY_MODES,
} from '../src/js/libs/apply-image.js';

function img(pixels: number[][]) {
	return {width: pixels.length, height: 1, data: Uint8ClampedArray.from(pixels.flat())};
}

describe('blend_value', () => {
	it('computes the basic modes', () => {
		expect(blend_value('normal', 10, 200)).toBe(200);
		expect(blend_value('multiply', 255, 128)).toBe(128);
		expect(blend_value('screen', 0, 128)).toBe(128);
		expect(blend_value('darken', 50, 100)).toBe(50);
		expect(blend_value('lighten', 50, 100)).toBe(100);
		expect(blend_value('difference', 50, 100)).toBe(50);
		expect(blend_value('add', 200, 100)).toBe(255);
		expect(blend_value('subtract', 200, 50)).toBe(150);
		expect(blend_value('linear-burn', 200, 100)).toBe(45);
	});

	it('keeps every mode in 0-255', () => {
		for (const [mode] of APPLY_MODES) {
			for (const b of [0, 1, 127, 128, 254, 255]) {
				for (const s of [0, 1, 127, 128, 254, 255]) {
					const value = blend_value(mode, b, s);
					expect(value).toBeGreaterThanOrEqual(0);
					expect(value).toBeLessThanOrEqual(255);
				}
			}
		}
	});

	it('cleans unknown modes and channels', () => {
		expect(clean_apply_mode('nope')).toBe('normal');
		expect(clean_apply_mode('overlay')).toBe('overlay');
		expect(clean_apply_channel(null)).toBe('rgb');
		expect(clean_apply_channel('alpha')).toBe('alpha');
	});
});

describe('extract_channel', () => {
	it('multiplies colors by the alpha and gives the alpha', () => {
		const picture = img([[200, 100, 50, 255], [200, 100, 50, 0], [0, 0, 0, 128]]);
		expect(Array.from(extract_channel(picture, 'red'))).toEqual([200, 0, 0]);
		expect(Array.from(extract_channel(picture, 'blue'))).toEqual([50, 0, 0]);
		expect(Array.from(extract_channel(picture, 'alpha'))).toEqual([255, 0, 128]);
		expect(extract_channel(img([[255, 255, 255, 255]]), 'gray')[0]).toBe(255);
	});
});

describe('apply_image', () => {
	it('blends the source colors and keeps the target alpha', () => {
		const target = img([[255, 255, 255, 100]]);
		apply_image(target, img([[128, 0, 64, 255]]), {mode: 'multiply', opacity: 100});
		expect(Array.from(target.data)).toEqual([128, 0, 64, 100]);
	});

	it('uses one channel for all colors, inverted, at half opacity', () => {
		const target = img([[0, 0, 0, 255]]);
		apply_image(target, img([[0, 255, 0, 255]]), {channel: 'red', invert: true, opacity: 50});
		expect(Array.from(target.data)).toEqual([128, 128, 128, 255]);
	});

	it('does nothing where the source is transparent or the sizes differ', () => {
		const target = img([[10, 20, 30, 255]]);
		apply_image(target, img([[255, 255, 255, 0]]), {opacity: 100});
		expect(Array.from(target.data)).toEqual([10, 20, 30, 255]);
		apply_image(target, img([[0, 0, 0, 255], [0, 0, 0, 255]]), {opacity: 100});
		expect(Array.from(target.data)).toEqual([10, 20, 30, 255]);
	});
});

describe('calculations', () => {
	it('blends source 1 over source 2 with opacity and inversion', () => {
		const a = Uint8ClampedArray.from([255, 0, 128]);
		const b = Uint8ClampedArray.from([128, 128, 255]);
		expect(Array.from(calculations(a, b, {mode: 'multiply', opacity: 100}))).toEqual([128, 0, 128]);
		expect(Array.from(calculations(a, b, {mode: 'normal', opacity: 100, invert_first: true}))).toEqual([0, 255, 127]);
		expect(Array.from(calculations(a, b, {mode: 'normal', opacity: 0}))).toEqual([128, 128, 255]);
	});
});
