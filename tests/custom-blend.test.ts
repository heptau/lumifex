import { CUSTOM_BLEND, is_custom_blend, canvas_operation, blend_channel, blend_custom, dissolve_noise } from '../src/js/libs/custom-blend.js';
import { BLEND_MODES, CANVAS_BLEND_MODES, clean_blend_mode } from '../src/js/libs/blend-modes.js';
import { FILL_MODES, fill_operation } from '../src/js/libs/fill-options.js';
import { blend_mode } from '../src/js/libs/psd.js';
import { blend_key } from '../src/js/libs/psd-write.js';
import { group_props_of } from '../src/js/libs/layer-groups.js';

type Px = [number, number, number, number];

function image(pixels: Px[], width = pixels.length) {
	const data = new Uint8ClampedArray(pixels.length * 4);
	pixels.forEach((p, i) => data.set(p, i * 4));
	return {data, width, height: pixels.length / width};
}

function blend_one(mode: string, below: Px, layer: Px, opacity?: number): number[] {
	const backdrop = image([below]);
	blend_custom(backdrop, image([layer]), mode, opacity);
	return Array.from(backdrop.data);
}

describe('custom blend modes - channel formulas', () => {
	it('Linear Burn = b + s - 1', () => {
		expect(blend_channel(CUSTOM_BLEND.linear_burn, 200, 100)).toBe(45);
		expect(blend_channel(CUSTOM_BLEND.linear_burn, 100, 100)).toBe(0);
		expect(blend_channel(CUSTOM_BLEND.linear_burn, 255, 77)).toBe(77);
	});

	it('Vivid Light = Color Burn below the middle, Color Dodge above it', () => {
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 200, 100)).toBeCloseTo(255 - 55 * 255 / 200);
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 100, 200)).toBeCloseTo(100 * 255 / 110);
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 100, 0)).toBe(0);
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 255, 0)).toBe(255);
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 100, 255)).toBe(255);
		expect(blend_channel(CUSTOM_BLEND.vivid_light, 0, 255)).toBe(0);
	});

	it('Linear Light = b + 2s - 1, clamped', () => {
		expect(blend_channel(CUSTOM_BLEND.linear_light, 100, 100)).toBe(45);
		expect(blend_channel(CUSTOM_BLEND.linear_light, 200, 200)).toBe(255);
		expect(blend_channel(CUSTOM_BLEND.linear_light, 50, 20)).toBe(0);
	});

	it('Pin Light replaces by the half that applies', () => {
		expect(blend_channel(CUSTOM_BLEND.pin_light, 200, 50)).toBe(100);
		expect(blend_channel(CUSTOM_BLEND.pin_light, 50, 50)).toBe(50);
		expect(blend_channel(CUSTOM_BLEND.pin_light, 50, 200)).toBe(145);
		expect(blend_channel(CUSTOM_BLEND.pin_light, 220, 200)).toBe(220);
	});

	it('Hard Mix is 0 or 255', () => {
		expect(blend_channel(CUSTOM_BLEND.hard_mix, 100, 155)).toBe(255);
		expect(blend_channel(CUSTOM_BLEND.hard_mix, 100, 154)).toBe(0);
	});

	it('Subtract and Divide', () => {
		expect(blend_channel(CUSTOM_BLEND.subtract, 200, 50)).toBe(150);
		expect(blend_channel(CUSTOM_BLEND.subtract, 50, 200)).toBe(0);
		expect(blend_channel(CUSTOM_BLEND.divide, 100, 200)).toBeCloseTo(127.5);
		expect(blend_channel(CUSTOM_BLEND.divide, 200, 100)).toBe(255);
		expect(blend_channel(CUSTOM_BLEND.divide, 0, 0)).toBe(0);
		expect(blend_channel(CUSTOM_BLEND.divide, 10, 0)).toBe(255);
	});
});

describe('custom blend modes - composing', () => {
	it('an opaque layer over an opaque picture gives the blended color', () => {
		expect(blend_one(CUSTOM_BLEND.linear_burn, [200, 100, 255, 255], [100, 100, 77, 255])).toEqual([45, 0, 77, 255]);
		expect(blend_one(CUSTOM_BLEND.subtract, [200, 100, 50, 255], [50, 100, 200, 255])).toEqual([150, 0, 0, 255]);
	});

	it('Darker / Lighter Color pick the whole color by brightness', () => {
		expect(blend_one(CUSTOM_BLEND.darker_color, [200, 200, 200, 255], [255, 0, 0, 255])).toEqual([255, 0, 0, 255]);
		expect(blend_one(CUSTOM_BLEND.darker_color, [10, 10, 10, 255], [255, 0, 0, 255])).toEqual([10, 10, 10, 255]);
		expect(blend_one(CUSTOM_BLEND.lighter_color, [200, 200, 200, 255], [255, 0, 0, 255])).toEqual([200, 200, 200, 255]);
		expect(blend_one(CUSTOM_BLEND.lighter_color, [10, 10, 10, 255], [255, 0, 0, 255])).toEqual([255, 0, 0, 255]);
	});

	it('over a transparent place the layer keeps its color and alpha', () => {
		expect(blend_one(CUSTOM_BLEND.linear_burn, [0, 0, 0, 0], [100, 150, 200, 128])).toEqual([100, 150, 200, 128]);
		expect(blend_one(CUSTOM_BLEND.divide, [0, 0, 0, 0], [100, 150, 200, 255])).toEqual([100, 150, 200, 255]);
	});

	it('a transparent layer changes nothing', () => {
		expect(blend_one(CUSTOM_BLEND.hard_mix, [10, 20, 30, 200], [255, 255, 255, 0])).toEqual([10, 20, 30, 200]);
		expect(blend_one(CUSTOM_BLEND.hard_mix, [10, 20, 30, 200], [255, 255, 255, 255], 0)).toEqual([10, 20, 30, 200]);
	});

	it('half alpha mixes the blended color with the picture', () => {
		//subtract: 200 - 100 = 100, half of the way from 200
		expect(blend_one(CUSTOM_BLEND.subtract, [200, 200, 200, 255], [100, 100, 100, 128])).toEqual([150, 150, 150, 255]);
		//the opacity argument does the same
		expect(blend_one(CUSTOM_BLEND.subtract, [200, 200, 200, 255], [100, 100, 100, 255], 0.5)).toEqual([150, 150, 150, 255]);
	});

	it('a half transparent picture below: the result alpha is source-over', () => {
		const out = blend_one(CUSTOM_BLEND.linear_burn, [200, 200, 200, 128], [100, 100, 100, 255]);
		expect(out[3]).toBe(255);
		//half of the blended 45 and half of the own 100
		expect(out[0]).toBeCloseTo(72, -0.5);
	});

	it('Dissolve shows a share of pixels fully, by the alpha, the same every time', () => {
		const size = 64;
		const pixels: Px[] = [];
		for (let i = 0; i < size * size; i++) {
			pixels.push([255, 0, 0, 128]);
		}
		const run = () => {
			const backdrop = image(pixels.map(() => [0, 0, 255, 255] as Px), size);
			blend_custom(backdrop, image(pixels, size), CUSTOM_BLEND.dissolve);
			return backdrop.data;
		};
		const a = run();
		const b = run();
		expect(Array.from(a)).toEqual(Array.from(b));
		let red = 0;
		for (let i = 0; i < a.length; i += 4) {
			expect(a[i] === 255 || a[i + 2] === 255).toBe(true);
			expect(a[i + 3]).toBe(255);
			if (a[i] === 255) {
				red++;
			}
		}
		expect(red / (size * size)).toBeGreaterThan(0.4);
		expect(red / (size * size)).toBeLessThan(0.6);
		//full alpha shows every pixel, none shows none
		expect(blend_one(CUSTOM_BLEND.dissolve, [0, 0, 0, 0], [1, 2, 3, 255])).toEqual([1, 2, 3, 255]);
		expect(dissolve_noise(3, 4)).toBe(dissolve_noise(3, 4));
		expect(dissolve_noise(3, 4)).toBeLessThan(255);
	});

	it('works on pictures of different widths (row offsets)', () => {
		const backdrop = image([[200, 200, 200, 255], [200, 200, 200, 255], [200, 200, 200, 255], [200, 200, 200, 255]], 2);
		const source = image([[50, 50, 50, 255], [50, 50, 50, 255]], 1);
		blend_custom(backdrop, source, CUSTOM_BLEND.subtract);
		expect(Array.from(backdrop.data.slice(0, 4))).toEqual([150, 150, 150, 255]);
		expect(Array.from(backdrop.data.slice(4, 8))).toEqual([200, 200, 200, 255]);
		expect(Array.from(backdrop.data.slice(8, 12))).toEqual([150, 150, 150, 255]);
	});
});

describe('custom blend modes - ids and lists', () => {
	it('ids are recognized and never reach the canvas', () => {
		Object.values(CUSTOM_BLEND).forEach((id) => {
			expect(is_custom_blend(id)).toBe(true);
			expect(canvas_operation(id)).toBe('source-over');
		});
		expect(is_custom_blend('multiply')).toBe(false);
		expect(canvas_operation('multiply')).toBe('multiply');
		expect(canvas_operation(undefined)).toBe('source-over');
	});

	it('BLEND_MODES follow the order of Photoshop', () => {
		expect(BLEND_MODES.map((m: string[]) => m[1])).toEqual([
			'Normal', 'Dissolve', 'Darken', 'Multiply', 'Color Burn', 'Linear Burn', 'Darker Color', 'Lighten', 'Screen',
			'Color Dodge', 'Linear Dodge (Add)', 'Lighter Color', 'Overlay', 'Soft Light', 'Hard Light', 'Vivid Light',
			'Linear Light', 'Pin Light', 'Hard Mix', 'Difference', 'Exclusion', 'Subtract', 'Divide', 'Hue', 'Saturation',
			'Color', 'Luminosity',
		]);
		expect(CANVAS_BLEND_MODES.some((m: string[]) => is_custom_blend(m[0]))).toBe(false);
	});

	it('the Fill dialog offers only modes the canvas can do', () => {
		expect(FILL_MODES).not.toContain('Linear Burn');
		expect(fill_operation('Linear Burn')).toBe('source-over');
	});

	it('unknown modes from a project become Normal', () => {
		expect(clean_blend_mode('lf-pin-light')).toBe('lf-pin-light');
		expect(clean_blend_mode('source-atop')).toBe('source-atop');
		expect(clean_blend_mode('lf-nope')).toBe('source-over');
		expect(clean_blend_mode(42)).toBe('source-over');
		expect(group_props_of({group: 'A', group_props: {A: {opacity: 100, composition: 'lf-divide'}}}, 'A').composition).toBe('lf-divide');
		expect(group_props_of({group: 'A', group_props: {A: {opacity: 100, composition: 'bogus-mode'}}}, 'A').composition).toBe('source-over');
	});

	it('PSD keys round trip', () => {
		const keys: Record<string, string> = {
			'lf-dissolve': 'diss', 'lf-linear-burn': 'lbrn', 'lf-darker-color': 'dkCl', 'lf-lighter-color': 'lgCl',
			'lf-vivid-light': 'vLit', 'lf-linear-light': 'lLit', 'lf-pin-light': 'pLit', 'lf-hard-mix': 'hMix',
			'lf-subtract': 'fsub', 'lf-divide': 'fdiv',
		};
		Object.entries(keys).forEach(([id, key]) => {
			expect(blend_key(id)).toBe(key);
			expect(blend_mode(key)).toBe(id);
		});
	});
});
