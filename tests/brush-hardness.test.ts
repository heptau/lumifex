import { clean_hardness, soft_blur_radius } from '../src/js/libs/brush-hardness.js';

describe('brush hardness', () => {
	it('keeps the hardness between 0 and 100 and falls back to a sharp brush', () => {
		expect(clean_hardness(50)).toBe(50);
		expect(clean_hardness(-5)).toBe(0);
		expect(clean_hardness(500)).toBe(100);
		expect(clean_hardness('75')).toBe(75);
		expect(clean_hardness(undefined)).toBe(100);
		expect(clean_hardness('abc')).toBe(100);
		expect(clean_hardness(NaN)).toBe(100);
	});

	it('does not blur a hard brush', () => {
		expect(soft_blur_radius(40, 100)).toBe(0);
		expect(soft_blur_radius(40, undefined)).toBe(0);
	});

	it('blurs a softer brush more and scales with the size', () => {
		const half = soft_blur_radius(40, 50);
		const soft = soft_blur_radius(40, 0);
		expect(half).toBeGreaterThan(0);
		expect(soft).toBeGreaterThan(half);
		expect(soft_blur_radius(80, 0)).toBeCloseTo(soft * 2);
	});

	it('ignores an invalid size', () => {
		expect(soft_blur_radius(0, 0)).toBe(0);
		expect(soft_blur_radius(-3, 0)).toBe(0);
		expect(soft_blur_radius(NaN, 0)).toBe(0);
	});
});
