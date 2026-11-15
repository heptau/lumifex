import { print_size_percent } from '../src/js/libs/zoom-fit.js';

describe('print size zoom', () => {
	it('shows the picture as big as on paper at a 96 dpi screen', () => {
		expect(print_size_percent(96)).toBe(100);
		expect(print_size_percent(72)).toBe(133);
		expect(print_size_percent(300)).toBe(32);
		expect(print_size_percent(192)).toBe(50);
	});

	it('stays in the allowed range and survives bad values', () => {
		expect(print_size_percent(2400)).toBe(4);
		expect(print_size_percent(1)).toBe(3200);
		expect(print_size_percent(0)).toBe(100);
		expect(print_size_percent(NaN)).toBe(100);
		expect(print_size_percent('abc' as any)).toBe(100);
	});
});
