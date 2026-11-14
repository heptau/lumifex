import { constrain_axis } from '../src/js/libs/move-constrain.js';

describe('move constrain', () => {
	it('leaves the move alone without Shift', () => {
		expect(constrain_axis(30, 10, false)).toEqual({ x: 30, y: 10 });
		expect(constrain_axis(30, 10, undefined as any)).toEqual({ x: 30, y: 10 });
	});

	it('keeps the longer axis with Shift', () => {
		expect(constrain_axis(30, 10, true)).toEqual({ x: 30, y: 0 });
		expect(constrain_axis(-5, -40, true)).toEqual({ x: 0, y: -40 });
	});

	it('prefers the horizontal axis when both are equal', () => {
		expect(constrain_axis(20, -20, true)).toEqual({ x: 20, y: 0 });
		expect(constrain_axis(0, 0, true)).toEqual({ x: 0, y: 0 });
	});
});
