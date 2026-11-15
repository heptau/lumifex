import {
	SMART_FILTERS, is_smart_filter, default_smart_settings, clean_smart_settings, make_smart_filter,
	active_smart_filters, smart_signature, run_smart_filters, seeded_random,
	has_smart_mask, smart_mask_weights, mix_with_mask,
} from '../src/js/libs/smart-filters.js';

function image(width: number, height: number, fill: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data.set(fill(x, y), (y * width + x) * 4);
		}
	}
	return { width, height, data };
}

describe('Smart filters', () => {
	it('knows only registered keys and offers no filter with its own editor', () => {
		expect(is_smart_filter('unsharp_mask')).toBe(true);
		expect(is_smart_filter('hue_saturation')).toBe(true);
		expect(is_smart_filter('curves')).toBe(false);
		expect(is_smart_filter('__proto__')).toBe(false);
		expect(is_smart_filter(5)).toBe(false);
	});

	it('every filter has defaults that survive cleaning', () => {
		Object.keys(SMART_FILTERS).forEach((key) => {
			const defaults = default_smart_settings(key);
			expect(clean_smart_settings(key, defaults)).toEqual(defaults);
		});
	});

	it('cleans settings from a saved project', () => {
		const clean = clean_smart_settings('unsharp_mask', { amount: 9999, radius: 'x', threshold: -5, evil: 1 });
		expect(clean).toEqual({ amount: 500, radius: 2, threshold: 0 });
		expect(clean_smart_settings('add_noise', { gaussian: 'true', monochrome: 1 })).toMatchObject({ gaussian: true, monochrome: false });
		expect(clean_smart_settings('nope', { a: 1 })).toEqual({});
	});

	it('lists only active valid smart filters in order and ignores other filters', () => {
		const a = make_smart_filter('invert', {});
		const b = make_smart_filter('pixelate', { size: 4 }, 7, false);
		const c = make_smart_filter('median', { radius: 2 });
		const list = active_smart_filters([a, { id: 1, name: 'blur', params: {} }, b, c, { id: 2, name: 'smart', params: { key: 'bad' } }]);
		expect(list.map((item) => item.key)).toEqual(['invert', 'median']);
		expect(active_smart_filters(undefined)).toEqual([]);
	});

	it('the signature changes with the settings and with switching off', () => {
		const on = smart_signature(active_smart_filters([make_smart_filter('pixelate', { size: 4 }, 1)]));
		const other = smart_signature(active_smart_filters([make_smart_filter('pixelate', { size: 5 }, 1)]));
		const off = smart_signature(active_smart_filters([make_smart_filter('pixelate', { size: 4 }, 1, false)]));
		expect(on).not.toEqual(other);
		expect(off).toEqual(smart_signature([]));
	});

	it('runs the filters one after another and keeps alpha', () => {
		const img = image(2, 1, () => [10, 20, 30, 128]);
		const list = active_smart_filters([make_smart_filter('invert', {}), make_smart_filter('invert', {})]);
		const result = run_smart_filters(img, list);
		expect(Array.from(result.data.slice(0, 4))).toEqual([10, 20, 30, 128]);
		const inverted = run_smart_filters(image(1, 1, () => [10, 20, 30, 128]), active_smart_filters([make_smart_filter('invert', {})]));
		expect(Array.from(inverted.data)).toEqual([245, 235, 225, 128]);
	});

	it('noise is repeatable', () => {
		const make = () => run_smart_filters(image(4, 4, () => [100, 100, 100, 255]), active_smart_filters([make_smart_filter('add_noise', { amount: 50 })]));
		expect(Array.from(make().data)).toEqual(Array.from(make().data));
		const random = seeded_random(1);
		const value = random();
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThan(1);
	});
});

describe('Smart filter mask', () => {
	const stored = { width: 2, height: 1, values: [255, 0], counts: [1, 1] };

	it('is active only when it exists and is not switched off', () => {
		expect(has_smart_mask({ smart_mask: stored })).toBe(true);
		expect(has_smart_mask({ smart_mask: stored, smart_mask_enabled: true })).toBe(true);
		expect(has_smart_mask({ smart_mask: stored, smart_mask_enabled: false })).toBe(false);
		expect(has_smart_mask({})).toBe(false);
		expect(has_smart_mask(null)).toBe(false);
	});

	it('resamples the stored mask to the picture and rejects a broken one', () => {
		expect(Array.from(smart_mask_weights(stored, 4, 1) as Uint8ClampedArray)).toEqual([255, 255, 0, 0]);
		expect(smart_mask_weights({ width: 2 }, 4, 1)).toBeNull();
		expect(smart_mask_weights(null, 4, 1)).toBeNull();
	});

	it('keeps the filter where the mask is 255 and the original where it is 0, mixes in between', () => {
		const original = image(3, 1, () => [100, 100, 100, 255]);
		const filtered = image(3, 1, () => [200, 0, 100, 255]);
		const result = mix_with_mask(original, filtered, Uint8ClampedArray.from([255, 0, 128]));
		expect(Array.from(result.data.slice(0, 4))).toEqual([200, 0, 100, 255]);
		expect(Array.from(result.data.slice(4, 8))).toEqual([100, 100, 100, 255]);
		expect(result.data[8]).toBe(150);
		expect(result.data[9]).toBe(50);
	});
});
