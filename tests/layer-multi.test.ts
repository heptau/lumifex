import { clean_selection, toggle_selection, range_selection, union_bounds, steps_to_place } from '../src/js/libs/layer-multi.js';

describe('Selecting several layers', () => {
	const all = [1, 2, 3, 4, 5];

	it('always keeps the active layer and drops unknown or repeated ids', () => {
		expect(clean_selection([2, 3, 9, 3], 3, all)).toEqual([2, 3]);
		expect(clean_selection([2, 4], 3, all)).toEqual([3]);
		expect(clean_selection(null as any, 1, all)).toEqual([1]);
		expect(clean_selection([1], null, all)).toEqual([]);
	});

	it('adds and removes layers with Ctrl + click', () => {
		expect(toggle_selection([1], 1, 3, all)).toEqual({active: 3, selection: [1, 3]});
		expect(toggle_selection([1, 3], 3, 1, all)).toEqual({active: 3, selection: [3]});
		expect(toggle_selection([1, 3], 3, 3, all)).toEqual({active: 1, selection: [1]});
		expect(toggle_selection([2], 2, 2, all)).toEqual({active: 2, selection: [2]});
	});

	it('selects a range with Shift + click in the order of the panel', () => {
		expect(range_selection([5, 4, 3, 2, 1], 4, 2)).toEqual({active: 4, selection: [4, 3, 2]});
		expect(range_selection([5, 4, 3, 2, 1], 2, 5)).toEqual({active: 2, selection: [5, 4, 3, 2]});
		expect(range_selection([5, 4], 9, 5)).toEqual({active: 5, selection: [5]});
	});

	it('joins bounds and places a merged layer', () => {
		expect(union_bounds([{left: 0, top: 5, right: 10, bottom: 10}, {left: -2, top: 7, right: 4, bottom: 20}])).toEqual({left: -2, top: 5, right: 10, bottom: 20});
		expect(union_bounds([])).toBe(null);
		const layers = [{id: 1, order: 1}, {id: 2, order: 2}, {id: 3, order: 3}, {id: 4, order: 4}];
		expect(steps_to_place(layers, [1, 2])).toBe(2);
		expect(steps_to_place(layers, [2, 4])).toBe(0);
		expect(steps_to_place(layers, [])).toBe(0);
	});
});
