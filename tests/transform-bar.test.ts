import { fields_from_layer, update_from_field, normalize_angle, has_box } from '../src/js/libs/transform-bar.js';

const layer = () => ({ x: 10, y: 20, width: 200, height: 100, rotate: 0 });

describe('Transform bar', () => {
	it('shows the center of the layer', () => {
		expect(fields_from_layer(layer())).toEqual({ x: 110, y: 70, width: 200, height: 100, rotate: 0 });
		expect(fields_from_layer(null)).toBeNull();
		expect(fields_from_layer({ x: 0, y: 0, width: NaN, height: 1 })).toBeNull();
		expect(has_box({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
	});

	it('moves the center', () => {
		expect(update_from_field(layer(), 'x', 300)).toEqual({ x: 200 });
		expect(update_from_field(layer(), 'y', 0)).toEqual({ y: -50 });
		expect(update_from_field(layer(), 'x', 110)).toBeNull();
	});

	it('resizes around the center', () => {
		expect(update_from_field(layer(), 'width', 100)).toEqual({ width: 100, height: 100, x: 60, y: 20 });
	});

	it('keeps the proportions when linked, from either side', () => {
		expect(update_from_field(layer(), 'width', 100, true)).toEqual({ width: 100, height: 50, x: 60, y: 45 });
		expect(update_from_field(layer(), 'height', 50, true)).toEqual({ width: 100, height: 50, x: 60, y: 45 });
	});

	it('rejects bad values and keeps sizes positive and bounded', () => {
		expect(update_from_field(layer(), 'width', 'abc')).toBeNull();
		expect(update_from_field(layer(), 'nope' as any, 5)).toBeNull();
		expect(update_from_field(layer(), 'width', -5)?.width).toBe(1);
		expect(update_from_field(layer(), 'width', 1e12)?.width).toBe(100000);
		//a layer without a size does not divide by zero
		expect(update_from_field({ x: 0, y: 0, width: 0, height: 0 }, 'width', 10, true)?.width).toBe(10);
	});

	it('normalizes the angle', () => {
		expect(normalize_angle(190)).toBe(-170);
		expect(normalize_angle(-190)).toBe(170);
		expect(normalize_angle(360)).toBe(0);
		expect(update_from_field(layer(), 'rotate', 450)).toEqual({ rotate: 90 });
		expect(update_from_field(layer(), 'rotate', 0)).toBeNull();
	});
});
