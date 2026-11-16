import { CROP_RATIOS, ratio_value, fit_to_ratio } from '../src/js/libs/crop-ratio.js';

describe('ratio_value', () => {
	it('is null for Free and the proportions of the others', () => {
		expect(ratio_value('Free', 100, 50)).toBeNull();
		expect(ratio_value('1:1', 100, 50)).toBe(1);
		expect(ratio_value('16:9', 100, 50)).toBeCloseTo(16 / 9);
		expect(ratio_value('9:16', 100, 50)).toBeCloseTo(9 / 16);
		expect(ratio_value('Original', 200, 100)).toBe(2);
	});

	it('is null for anything unknown or an empty document', () => {
		expect(ratio_value('7:3', 100, 50)).toBeNull();
		expect(ratio_value('x', 100, 50)).toBeNull();
		expect(ratio_value(undefined as any, 100, 50)).toBeNull();
		expect(ratio_value('Original', 0, 50)).toBeNull();
		expect(CROP_RATIOS[0]).toBe('Free');
	});
});

describe('fit_to_ratio', () => {
	it('keeps the wider side and changes the other one', () => {
		expect(fit_to_ratio(100, 10, 1)).toEqual({width: 100, height: 100});
		expect(fit_to_ratio(10, 100, 1)).toEqual({width: 100, height: 100});
		expect(fit_to_ratio(160, 20, 16 / 9)).toEqual({width: 160, height: 90});
	});

	it('keeps the direction of the drag', () => {
		expect(fit_to_ratio(-100, 10, 1)).toEqual({width: -100, height: 100});
		expect(fit_to_ratio(100, -10, 1)).toEqual({width: 100, height: -100});
		expect(fit_to_ratio(-20, -100, 2)).toEqual({width: -200, height: -100});
	});

	it('a frame that already fits stays, and no ratio or bad numbers change nothing', () => {
		expect(fit_to_ratio(160, 90, 16 / 9)).toEqual({width: 160, height: 90});
		expect(fit_to_ratio(30, 40, null)).toEqual({width: 30, height: 40});
		expect(fit_to_ratio(30, 40, 0)).toEqual({width: 30, height: 40});
		expect(fit_to_ratio(NaN, 40, 1).height).toBe(40);
		expect(fit_to_ratio(0, 0, 1)).toEqual({width: 0, height: 0});
	});
});
