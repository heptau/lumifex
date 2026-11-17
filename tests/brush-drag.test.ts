import { is_brush_drag_press, drag_brush_values } from '../src/js/libs/brush-drag.js';

describe('Brush size by dragging on the canvas', () => {
	it('starts with Alt + right button or Ctrl + Alt + left button', () => {
		expect(is_brush_drag_press({button: 2, altKey: true, ctrlKey: false})).toBe(true);
		expect(is_brush_drag_press({button: 0, altKey: true, ctrlKey: true})).toBe(true);
		expect(is_brush_drag_press({button: 0, altKey: true, ctrlKey: false})).toBe(false);
		expect(is_brush_drag_press({button: 2, altKey: false, ctrlKey: false})).toBe(false);
		expect(is_brush_drag_press(null as any)).toBe(false);
	});

	it('changes the size with the horizontal move and the zoom', () => {
		const start = {size: 20, hardness: 50, min: 1, max: 500};
		expect(drag_brush_values(start, 10, 0, 1).size).toBe(40);
		expect(drag_brush_values(start, 10, 0, 2).size).toBe(30);
		expect(drag_brush_values(start, -100, 0, 1).size).toBe(1);
		expect(drag_brush_values(start, 10000, 0, 1).size).toBe(500);
	});

	it('changes the hardness with the vertical move (up = harder) and only when the tool has it', () => {
		const start = {size: 20, hardness: 50, min: 1, max: 500};
		expect(drag_brush_values(start, 0, -20, 1).hardness).toBe(60);
		expect(drag_brush_values(start, 0, 300, 1).hardness).toBe(0);
		expect(drag_brush_values({size: 20, hardness: null, min: 1, max: 500}, 0, -20, 1).hardness).toBe(null);
		expect(drag_brush_values({size: NaN, hardness: 'x', min: NaN, max: NaN} as any, NaN, NaN, 0)).toEqual({size: 1, hardness: null});
	});
});
