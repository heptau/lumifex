import { layer_to_select } from '../src/js/libs/layer-select.js';

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
