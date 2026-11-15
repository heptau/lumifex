import { layer_box, reveal_all_size } from '../src/js/libs/reveal-all.js';

describe('reveal all', () => {
	it('computes the box of a layer, also rotated', () => {
		expect(layer_box({ x: 10, y: 20, width: 100, height: 50 })).toEqual({ left: 10, top: 20, right: 110, bottom: 70 });
		const box = layer_box({ x: 0, y: 0, width: 100, height: 50, rotate: 90 })!;
		expect(box.right - box.left).toBeCloseTo(50);
		expect(box.bottom - box.top).toBeCloseTo(100);
		expect(layer_box({ x: 0, y: 0, width: null, height: 5 })).toBeNull();
		expect(layer_box(null as any)).toBeNull();
	});

	it('keeps the canvas when everything fits', () => {
		const out = reveal_all_size([{ x: 5, y: 5, width: 10, height: 10 }], 100, 80);
		expect(out).toEqual({ width: 100, height: 80, dx: 0, dy: 0 });
	});

	it('grows to the right and bottom', () => {
		const out = reveal_all_size([{ x: 50, y: 50, width: 200, height: 100 }], 100, 80);
		expect(out).toEqual({ width: 250, height: 150, dx: 0, dy: 0 });
	});

	it('grows to the left and top and moves the content', () => {
		const out = reveal_all_size([{ x: -30, y: -10, width: 40, height: 20 }], 100, 80);
		expect(out).toEqual({ width: 130, height: 90, dx: 30, dy: 10 });
	});

	it('ignores layers without a size and limits the result', () => {
		expect(reveal_all_size([{ x: 0, y: 0 }, null as any], 10, 10)).toEqual({ width: 10, height: 10, dx: 0, dy: 0 });
		expect(reveal_all_size([{ x: 0, y: 0, width: 1e9, height: 5 }], 10, 10).width).toBe(20000);
	});
});
