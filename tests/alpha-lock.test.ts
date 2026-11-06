import { keep_alpha } from '../src/js/libs/alpha-lock.js';

describe('lock transparency', () => {
	it('takes colors from the new image and alpha from the old one', () => {
		const old = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
		const next = new Uint8ClampedArray([200, 100, 50, 255, 1, 2, 3, 255]);
		expect(keep_alpha(old, next)).toBe(true);
		expect(Array.from(next)).toEqual([200, 100, 50, 255, 1, 2, 3, 128]);
	});

	it('transparent pixels stay empty (a fill does not paint them)', () => {
		const old = new Uint8ClampedArray([5, 5, 5, 0]);
		const next = new Uint8ClampedArray([255, 0, 0, 255]);
		keep_alpha(old, next);
		expect(Array.from(next)).toEqual([0, 0, 0, 0]);
	});

	it('the eraser does nothing: an erased pixel keeps its old color and alpha', () => {
		const old = new Uint8ClampedArray([10, 20, 30, 255]);
		const next = new Uint8ClampedArray([0, 0, 0, 0]);
		keep_alpha(old, next);
		expect(Array.from(next)).toEqual([10, 20, 30, 255]);
	});

	it('refuses data of different sizes and leaves the new image untouched', () => {
		const next = new Uint8ClampedArray([1, 2, 3, 4]);
		expect(keep_alpha(new Uint8ClampedArray(8), next)).toBe(false);
		expect(keep_alpha(null as any, next)).toBe(false);
		expect(keep_alpha(new Uint8ClampedArray(3), new Uint8ClampedArray(3))).toBe(false);
		expect(Array.from(next)).toEqual([1, 2, 3, 4]);
	});
});
