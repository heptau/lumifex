import { layer_to_select, visibility_toggles } from '../src/js/libs/layer-select.js';

const layers = [{ id: 7, order: 0 }, { id: 3, order: 2 }, { id: 9, order: 1 }];

describe('layer to select', () => {
	it('walks through the stack by the order, not by the id', () => {
		expect(layer_to_select(layers, 7, 'next')).toBe(9);
		expect(layer_to_select(layers, 9, 'next')).toBe(3);
		expect(layer_to_select(layers, 3, 'previous')).toBe(9);
		expect(layer_to_select(layers, 9, 'previous')).toBe(7);
	});

	it('jumps to the ends', () => {
		expect(layer_to_select(layers, 9, 'top')).toBe(3);
		expect(layer_to_select(layers, 9, 'bottom')).toBe(7);
	});

	it('returns null when nothing changes', () => {
		expect(layer_to_select(layers, 3, 'next')).toBeNull();
		expect(layer_to_select(layers, 7, 'previous')).toBeNull();
		expect(layer_to_select(layers, 3, 'top')).toBeNull();
		expect(layer_to_select([{ id: 1, order: 0 }], 1, 'next')).toBeNull();
		expect(layer_to_select(layers, 999, 'next')).toBeNull();
		expect(layer_to_select(layers, 7, 'sideways')).toBeNull();
		expect(layer_to_select(null as any, 7, 'next')).toBeNull();
	});
});

describe('visibility toggles', () => {
	const stack = [{ id: 1, visible: true }, { id: 2, visible: false }, { id: 3 }, { id: 4, visible: false }];

	it('show all toggles only the hidden layers', () => {
		expect(visibility_toggles(stack, 1, 'show_all')).toEqual([2, 4]);
		expect(visibility_toggles([{ id: 1 }], 1, 'show_all')).toEqual([]);
	});

	it('hide others keeps only the active layer visible, also showing it when hidden', () => {
		expect(visibility_toggles(stack, 1, 'hide_others')).toEqual([3]);
		expect(visibility_toggles(stack, 2, 'hide_others')).toEqual([1, 2, 3]);
		expect(visibility_toggles([{ id: 1, visible: true }], 1, 'hide_others')).toEqual([]);
	});

	it('survives bad input', () => {
		expect(visibility_toggles(null as any, 1, 'show_all')).toEqual([]);
		expect(visibility_toggles([null as any, { id: 5, visible: false }], 1, 'show_all')).toEqual([5]);
		expect(visibility_toggles(stack, 1, 'other')).toEqual([]);
	});
});
