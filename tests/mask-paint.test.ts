import { mask_value_of_color, paint_value_stamp, paint_value_line, fill_mask_value, gradient_mask, thumbnail_size, mask_to_rgba, selection_weights } from '../src/js/libs/mask-paint.js';

function mask(width: number, height: number, value: number) {
	return { width, height, data: new Uint8ClampedArray(width * height).fill(value) };
}

describe('Painting into a layer mask', () => {
	it('turns a color into its gray (black hides, white reveals)', () => {
		expect(mask_value_of_color('#000000')).toBe(0);
		expect(mask_value_of_color('#ffffff')).toBe(255);
		expect(mask_value_of_color('#fff')).toBe(255);
		expect(mask_value_of_color('#808080')).toBe(128);
		expect(mask_value_of_color('nonsense')).toBe(0);
	});

	it('moves the pixels under a hard dab to the value and keeps the rest', () => {
		const m = mask(10, 10, 255);
		const rect = paint_value_stamp(m, 5, 5, 2, 0, 0);
		expect(rect).not.toBeNull();
		expect(m.data[5 * 10 + 5]).toBe(0);
		expect(m.data[0]).toBe(255);
	});

	it('mixes by the opacity and the soft edge', () => {
		const m = mask(10, 10, 0);
		paint_value_stamp(m, 5, 5, 3, 0, 200, 0.5);
		expect(m.data[5 * 10 + 5]).toBe(100);
		const soft = mask(20, 1, 0);
		paint_value_stamp(soft, 10, 0.5, 8, 1, 255);
		expect(soft.data[10]).toBeGreaterThan(soft.data[15]);
		expect(soft.data[15]).toBeGreaterThan(0);
	});

	it('ignores a dab outside of the mask and bad numbers', () => {
		const m = mask(4, 4, 7);
		expect(paint_value_stamp(m, 100, 100, 2, 0, 0)).toBeNull();
		paint_value_stamp(m, 2, 2, NaN as any, NaN as any, NaN as any, NaN as any);
		expect(Array.from(m.data).every((v) => Number.isFinite(v))).toBe(true);
	});

	it('paints a continuous line', () => {
		const m = mask(30, 5, 255);
		paint_value_line(m, { x: 2, y: 2.5 }, { x: 27, y: 2.5 }, 1.5, 0, 0);
		for (let x = 2; x <= 27; x++) {
			expect(m.data[2 * 30 + x]).toBe(0);
		}
	});

	it('fills everything or only the selected part', () => {
		const m = mask(2, 1, 255);
		fill_mask_value(m, 0, new Uint8ClampedArray([255, 0]));
		expect(Array.from(m.data)).toEqual([0, 255]);
		fill_mask_value(m, 100);
		expect(Array.from(m.data)).toEqual([100, 100]);
	});

	it('paints linear, reflected and radial gradients', () => {
		const m = mask(11, 1, 0);
		gradient_mask(m, { x: 0, y: 0.5 }, { x: 11, y: 0.5 }, 0, 255);
		expect(m.data[0]).toBeLessThan(m.data[5]);
		expect(m.data[5]).toBeLessThan(m.data[10]);
		const r = mask(11, 1, 0);
		gradient_mask(r, { x: 5.5, y: 0.5 }, { x: 11, y: 0.5 }, 255, 0, 'reflected');
		expect(r.data[0]).toBe(r.data[10]);
		const radial = mask(11, 11, 0);
		gradient_mask(radial, { x: 5.5, y: 5.5 }, { x: 10.5, y: 5.5 }, 255, 0, 'radial');
		expect(radial.data[5 * 11 + 5]).toBe(255);
		expect(radial.data[0]).toBe(0);
		const same = mask(3, 1, 9);
		gradient_mask(same, { x: 1, y: 0 }, { x: 1, y: 0 }, 0, 50);
		expect(Array.from(same.data)).toEqual([50, 50, 50]);
	});

	it('keeps the aspect ratio of thumbnails', () => {
		expect(thumbnail_size(800, 600, 28, 24)).toEqual({ width: 28, height: 21 });
		expect(thumbnail_size(100, 1000, 28, 24)).toEqual({ width: 2, height: 24 });
		expect(thumbnail_size(0, 0, 28, 24)).toEqual({ width: 24, height: 24 });
	});

	it('shows the mask in gray or as a red overlay', () => {
		const m = { width: 2, height: 1, data: new Uint8ClampedArray([0, 255]) };
		expect(Array.from(mask_to_rgba(m, 'gray'))).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
		expect(Array.from(mask_to_rgba(m, 'overlay'))).toEqual([255, 0, 0, 128, 255, 0, 0, 0]);
	});

	it('resamples the selection into the pixels of a smaller mask', () => {
		const selection = { width: 4, height: 2, data: new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255]) };
		const weights = selection_weights(selection, { x: 0, y: 0, width: 4, height: 2 }, 2, 1);
		expect(Array.from(weights)).toEqual([0, 255]);
		const outside = selection_weights(selection, { x: 10, y: 10, width: 4, height: 2 }, 2, 1);
		expect(Array.from(outside)).toEqual([0, 0]);
	});
});
