import { find_guide } from '../src/js/libs/guide-hit.js';

describe('find_guide', () => {
	const guides = [{x: 100, y: null}, {x: null, y: 50}, {x: 103, y: null}];

	it('finds a vertical and a horizontal guide within the tolerance', () => {
		expect(find_guide(guides, 150, 52, 4)).toBe(1);
		expect(find_guide(guides, 98, 300, 4)).toBe(0);
	});

	it('returns -1 when nothing is near', () => {
		expect(find_guide(guides, 200, 200, 4)).toBe(-1);
		expect(find_guide([], 1, 1, 4)).toBe(-1);
	});

	it('picks the nearest of two close guides and the later one on a tie', () => {
		expect(find_guide(guides, 102, 999, 4)).toBe(2);
		expect(find_guide(guides, 101.5, 999, 4)).toBe(2);
	});

	it('ignores broken guides and bad input', () => {
		expect(find_guide([null, {x: null, y: null}, {x: 'a', y: null}] as any, 0, 0, 5)).toBe(-1);
		expect(find_guide(guides, 100, 0, NaN)).toBe(-1);
		expect(find_guide(null as any, 0, 0, 4)).toBe(-1);
	});
});
