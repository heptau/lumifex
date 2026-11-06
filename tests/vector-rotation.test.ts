import { needs_generic_rotation, normalize_rotate, rotation_pivot, GENERIC_ROTATION_TYPES } from '../src/js/libs/vector-rotation.js';

describe('vector rotation', () => {
	test('rotated strokes and lines are turned by the generic code', () => {
		expect(needs_generic_rotation({type: 'brush', rotate: 30})).toBe(true);
		expect(needs_generic_rotation({type: 'line', rotate: -15})).toBe(true);
	});

	test('no turn for zero, null, images and self-rotating shapes', () => {
		expect(needs_generic_rotation({type: 'brush', rotate: 0})).toBe(false);
		expect(needs_generic_rotation({type: 'pen', rotate: null})).toBe(false);
		expect(needs_generic_rotation({type: 'image', rotate: 45})).toBe(false);
		expect(needs_generic_rotation({type: 'rectangle', rotate: 45})).toBe(false);
		expect(needs_generic_rotation(null as any)).toBe(false);
	});

	test('old projects with rotate null get 0 for rotatable types only', () => {
		for (const type of GENERIC_ROTATION_TYPES) {
			expect(normalize_rotate({type, rotate: null})).toBe(0);
		}
		expect(normalize_rotate({type: 'ellipse', rotate: null})).toBeNull();
		expect(normalize_rotate({type: 'brush', rotate: 20})).toBe(20);
	});

	test('pivot is the center of the layer, also for a negative size', () => {
		expect(rotation_pivot({x: 10, y: 20, width: 100, height: 50})).toEqual({x: 60, y: 45});
		expect(rotation_pivot({x: 10, y: 10, width: -20, height: 0})).toEqual({x: 0, y: 10});
	});
});
