import { stroke_steps } from '../src/js/libs/stroke-steps.js';

describe('stroke_steps', () => {
	it('spreads the stamps evenly and ends exactly at the pointer', () => {
		const places = stroke_steps({x: 0, y: 0}, {x: 10, y: 0}, 4);
		expect(places).toEqual([{x: 10 / 3, y: 0}, {x: 20 / 3, y: 0}, {x: 10, y: 0}]);
	});

	it('a short move is a single stamp and the same place is one stamp', () => {
		expect(stroke_steps({x: 0, y: 0}, {x: 1, y: 0}, 5)).toEqual([{x: 1, y: 0}]);
		expect(stroke_steps({x: 3, y: 3}, {x: 3, y: 3}, 5)).toEqual([{x: 3, y: 3}]);
	});

	it('no distance between stamps is larger than the spacing, also diagonally', () => {
		const places = stroke_steps({x: 0, y: 0}, {x: 30, y: 40}, 7);
		let previous = {x: 0, y: 0};
		places.forEach((p) => {
			expect(Math.hypot(p.x - previous.x, p.y - previous.y)).toBeLessThanOrEqual(7 + 1e-9);
			previous = p;
		});
		expect(places[places.length - 1]).toEqual({x: 30, y: 40});
	});

	it('without a start there is one stamp, bad input gives none or a safe spacing', () => {
		expect(stroke_steps(null, {x: 5, y: 6}, 3)).toEqual([{x: 5, y: 6}]);
		expect(stroke_steps({x: 0, y: 0}, null as any, 3)).toEqual([]);
		expect(stroke_steps({x: 0, y: 0}, {x: NaN, y: 1}, 3)).toEqual([]);
		expect(stroke_steps({x: 0, y: 0}, {x: 3, y: 0}, NaN).length).toBe(3);
		expect(stroke_steps({x: 0, y: 0}, {x: 3, y: 0}, 0).length).toBe(3);
	});
});
