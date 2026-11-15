import { pick_shape, is_shape_module, sort_shapes, carry_shape_options, DEFAULT_SHAPE } from '../src/js/libs/shape-tools.js';

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

describe('Shape options carried between shapes', () => {
	it('copies border and fill to the next shape, also into {value} options', () => {
		const from = { border_size: 9, border: false, fill: true, border_color: '#111111', fill_color: '#222222', radius: { value: 5 } };
		const to = { border_size: 4, border: true, fill: { value: false }, border_color: '#555555', fill_color: '#aaaaaa', circle: false };
		const copied = carry_shape_options(from, to);
		expect(copied).toEqual(['border_size', 'border', 'fill', 'border_color', 'fill_color']);
		expect(to).toEqual({ border_size: 9, border: false, fill: { value: true }, border_color: '#111111', fill_color: '#222222', circle: false });
	});

	it('skips options the other shape lacks or that have another type', () => {
		const to: any = { size: 4, border_size: '4' };
		expect(carry_shape_options({ border_size: 7, fill: true }, to)).toEqual([]);
		expect(to).toEqual({ size: 4, border_size: '4' });
		expect(carry_shape_options(null as any, to)).toEqual([]);
	});
});
