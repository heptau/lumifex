import { overlay_lines, normalize_overlay, CROP_OVERLAYS } from '../src/js/libs/crop-overlay.js';

describe('crop overlay', () => {
	it('thirds: two vertical and two horizontal lines', () => {
		const lines = overlay_lines('Thirds', 300, 150);
		expect(lines).toHaveLength(4);
		expect(lines[0]).toEqual([100, 0, 100, 150]);
		expect(lines[2]).toEqual([0, 50, 300, 50]);
	});

	it('golden ratio splits at 38.2 % and 61.8 %', () => {
		const lines = overlay_lines('Golden Ratio', 1000, 1000);
		expect(lines[0][0]).toBeCloseTo(381.97, 1);
		expect(lines[1][0]).toBeCloseTo(618.03, 1);
	});

	it('diagonals and grid', () => {
		expect(overlay_lines('Diagonals', 10, 20)).toEqual([[0, 0, 10, 20], [10, 0, 0, 20]]);
		expect(overlay_lines('Grid', 100, 100)).toHaveLength(6);
	});

	it('None and an empty frame draw nothing', () => {
		expect(overlay_lines('None', 100, 100)).toEqual([]);
		expect(overlay_lines('Thirds', 0, 100)).toEqual([]);
		expect(overlay_lines('Thirds', NaN, 100)).toEqual([]);
	});

	it('an unknown or missing value is the rule of thirds, an object from the tool attributes is read', () => {
		expect(normalize_overlay(undefined)).toBe('Thirds');
		expect(normalize_overlay('Spiral')).toBe('Thirds');
		expect(normalize_overlay({ value: 'Grid', values: CROP_OVERLAYS })).toBe('Grid');
		expect(overlay_lines(null, 90, 90)).toHaveLength(4);
	});
});
