import { mask_outline, ant_is_light, ant_phase, draw_mask_ants, draw_rect_ants, set_edges_hidden, are_edges_hidden } from '../src/js/libs/marching-ants.js';

function mask(width: number, height: number, inside: (x: number, y: number) => boolean) {
	const data = new Uint8ClampedArray(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			data[y * width + x] = inside(x, y) ? 255 : 0;
		}
	}
	return { width, height, data };
}

describe('marching ants', () => {
	it('finds only the edge pixels of a square', () => {
		const m = mask(10, 10, (x, y) => x >= 3 && x < 7 && y >= 3 && y < 7);
		const outline = Array.from(mask_outline(m));
		//4 x 4 square: 16 pixels, the 4 in the middle are not on the edge
		expect(outline).toHaveLength(12);
		expect(outline).not.toContain(4 * 10 + 4);
		expect(outline).toContain(3 * 10 + 3);
	});

	it('treats the picture border as an edge and caches the result', () => {
		const m = mask(4, 4, () => true);
		const first = mask_outline(m);
		expect(first).toHaveLength(12);
		expect(mask_outline(m)).toBe(first);
	});

	it('alternates light and dark in runs of four pixels', () => {
		expect(ant_is_light(0, 0, 0)).toBe(false);
		expect(ant_is_light(4, 0, 0)).toBe(true);
		expect(ant_is_light(0, 0, 4)).toBe(true);
		expect(ant_phase(0)).toBe(0);
		expect(ant_phase(80)).toBe(1);
	});
});

describe('hiding the selection edges', () => {
	afterEach(() => set_edges_hidden(false));

	const fake_ctx = () => {
		const calls: string[] = [];
		const ctx: any = new Proxy({}, {
			get: (_t, name) => (...args: unknown[]) => {
				calls.push(String(name));
				return undefined;
			},
			set: () => true,
		});
		return {ctx, calls};
	};

	it('draws nothing while hidden and draws again when shown', () => {
		expect(are_edges_hidden()).toBe(false);
		set_edges_hidden(true);
		expect(are_edges_hidden()).toBe(true);
		const hidden = fake_ctx();
		draw_rect_ants(hidden.ctx, 0, 0, 5, 5, 1, 0);
		draw_mask_ants(hidden.ctx, mask(4, 4, (x, y) => x > 0 && y > 0), 0);
		expect(hidden.calls).toEqual([]);
		set_edges_hidden(false);
		const shown = fake_ctx();
		draw_rect_ants(shown.ctx, 0, 0, 5, 5, 1, 0);
		expect(shown.calls).toContain('strokeRect');
	});

	it('only an exact true hides', () => {
		set_edges_hidden('yes' as any);
		expect(are_edges_hidden()).toBe(false);
	});
});
