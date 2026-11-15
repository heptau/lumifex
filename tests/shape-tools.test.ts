import { pick_shape, is_shape_module, sort_shapes, DEFAULT_SHAPE } from '../src/js/libs/shape-tools.js';

describe('Unified Shape tool', () => {
	const available = ['star', 'rectangle', 'ellipse'];

	it('remembers a valid shape and falls back to the rectangle otherwise', () => {
		expect(pick_shape('star', available)).toBe('star');
		expect(pick_shape('unknown', available)).toBe(DEFAULT_SHAPE);
		expect(pick_shape(null, available)).toBe('rectangle');
		expect(pick_shape({ evil: 1 }, available)).toBe('rectangle');
		expect(pick_shape('x', ['star'])).toBe('star');
		expect(pick_shape('x', [])).toBe('rectangle');
	});

	it('recognises shape modules by their folder', () => {
		expect(is_shape_module('shapes/star')).toBe(true);
		expect(is_shape_module('brush')).toBe(false);
		expect(is_shape_module(undefined as any)).toBe(false);
	});

	it('sorts the picker by title without changing the input', () => {
		const input = [{ key: 'b', title: 'Star' }, { key: 'a', title: 'Arrow' }];
		expect(sort_shapes(input).map((s) => s.key)).toEqual(['a', 'b']);
		expect(input[0].key).toBe('b');
	});
});
