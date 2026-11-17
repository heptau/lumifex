import {
	clean_paths, clean_path_anchors, next_path_id, next_path_name, translate_anchors, path_bounds, hit_outline, pick_path,
	point_in_polygon, trace_path, pen_layer_anchors, pen_layer_geometry, clean_vector_mask, vector_mask_from_path,
	vector_mask_to_document, vector_mask_anchors_for_size, multiply_masks, MAX_PATHS, MAX_PATH_ANCHORS,
} from '../src/js/libs/document-paths.js';
import { move_part } from '../src/js/libs/pen-path.js';
import { parse_psd, read_vector_mask } from '../src/js/libs/psd.js';
import { build_psd, vector_mask_block } from '../src/js/libs/psd-write.js';

const corner = (x: number, y: number) => ({ x, y, in: null, out: null });
const square = [corner(10, 10), corner(30, 10), corner(30, 30), corner(10, 30)];

describe('document paths: validation of a project file', () => {
	it('keeps valid paths and fixes ids and names', () => {
		const paths = clean_paths([
			{ id: 3, name: 'A', closed: true, anchors: square },
			{ id: 3, name: '\u0001', anchors: [{ x: 'a', y: 1 }, { x: 1, y: 2, in: { x: 0, y: 'z' } }] },
			null, 'text', { anchors: 'no' },
		]);
		expect(paths.length).toBe(3);
		expect(paths[0]).toEqual({ id: 3, name: 'A', closed: true, anchors: square });
		expect(paths[1].id).not.toBe(3);
		expect(paths[1].name).toBe('Path');
		expect(paths[1].closed).toBe(false);
		expect(paths[1].anchors).toEqual([{ x: 1, y: 2, in: null, out: null }]);
		expect(paths[2].anchors).toEqual([]);
		expect(clean_paths('nothing')).toEqual([]);
	});

	it('limits the number of paths and anchors', () => {
		expect(clean_paths(new Array(MAX_PATHS + 50).fill({ anchors: [] })).length).toBe(MAX_PATHS);
		expect(clean_path_anchors(new Array(MAX_PATH_ANCHORS + 5).fill({ x: 1, y: 1 })).length).toBe(MAX_PATH_ANCHORS);
		expect(clean_path_anchors([{ x: 1e9, y: 0 }, { x: Infinity, y: 0 }])).toEqual([]);
	});

	it('gives new ids and names', () => {
		const paths = [{ id: 4, name: 'Path 1', closed: false, anchors: [] }];
		expect(next_path_id(paths)).toBe(5);
		expect(next_path_name(paths, 'Path')).toBe('Path 2');
	});
});

describe('document paths: geometry', () => {
	it('moves anchors with their handles and measures the path', () => {
		const moved = translate_anchors([{ x: 0, y: 0, in: { x: -1, y: 0 }, out: { x: 1, y: 0 } }], 5, 2);
		expect(moved).toEqual([{ x: 5, y: 2, in: { x: 4, y: 2 }, out: { x: 6, y: 2 } }]);
		expect(path_bounds(square, true)).toEqual({ x: 10, y: 10, width: 20, height: 20 });
	});

	it('hits the line of a path and the inside of a closed one', () => {
		expect(hit_outline(square, true, { x: 20, y: 11 }, 2)).toBe(true);
		expect(hit_outline(square, true, { x: 20, y: 20 }, 2)).toBe(true);
		expect(hit_outline(square, false, { x: 20, y: 20 }, 2)).toBe(false);
		expect(hit_outline(square, false, { x: 10, y: 20 }, 2)).toBe(false); //the open side
		expect(hit_outline(square, true, { x: 50, y: 50 }, 2)).toBe(false);
		expect(point_in_polygon(square, { x: 11, y: 29 })).toBe(true);
		const paths = [
			{ id: 1, name: 'a', closed: true, anchors: square },
			{ id: 2, name: 'b', closed: true, anchors: translate_anchors(square, 10, 10) },
		];
		expect(pick_path(paths, { x: 25, y: 25 }, 1)).toBe(2); //the one on top
		expect(pick_path(paths, { x: 12, y: 12 }, 1)).toBe(1);
		expect(pick_path(paths, { x: 100, y: 100 }, 1)).toBe(null);
	});

	it('breaks the handles of an anchor with Alt', () => {
		const anchor = { x: 0, y: 0, in: { x: -5, y: 0 }, out: { x: 5, y: 0 } };
		move_part(anchor, 'out', { x: 0, y: 5 }, true);
		expect(anchor.in).toEqual({ x: -5, y: 0 });
		move_part(anchor, 'out', { x: 0, y: 10 });
		expect(anchor.in!.x).toBeCloseTo(0);
		expect(anchor.in!.y).toBeCloseTo(-5);
	});

	it('traces curves and lines into a context', () => {
		const calls: string[] = [];
		const ctx = {
			moveTo: () => calls.push('move'), lineTo: () => calls.push('line'),
			bezierCurveTo: () => calls.push('curve'), closePath: () => calls.push('close'),
		};
		trace_path(ctx, [corner(0, 0), { x: 10, y: 0, in: { x: 8, y: 2 }, out: null }, corner(10, 10)], true);
		expect(calls).toEqual(['move', 'curve', 'line', 'line', 'close']);
	});

	it('reads and writes the anchors of a Pen layer', () => {
		const layer = { x: 100, y: 50, width: 40, height: 20, width_original: 20, height_original: 20, data: [corner(10, 10)] };
		expect(pen_layer_anchors(layer)).toEqual([corner(120, 60)]);
		const geometry = pen_layer_geometry(square, true, 2);
		expect(geometry.x).toBe(7);
		expect(geometry.width).toBe(26);
		expect(geometry.width_original).toBe(26);
		expect(geometry.data[0]).toEqual(corner(3, 3));
	});
});

describe('vector masks', () => {
	it('puts a path into the coordinates of the layer and back (also turned and stretched)', () => {
		const layer = { x: 10, y: 10, width: 40, height: 20, rotate: 30 };
		const mask = vector_mask_from_path(square, layer);
		expect(mask.width).toBe(40);
		expect(mask.invert).toBe(false);
		const back = vector_mask_to_document(mask, layer);
		back.forEach((p, i) => {
			expect(p.x).toBeCloseTo(square[i].x);
			expect(p.y).toBeCloseTo(square[i].y);
		});
		//the layer is made twice as wide: the path is stretched with it
		const plain = vector_mask_from_path(square, { x: 10, y: 10, width: 40, height: 20 });
		const wider = vector_mask_to_document(plain, { x: 10, y: 10, width: 80, height: 20 });
		expect(wider[1]).toEqual(corner(50, 10));
		expect(vector_mask_anchors_for_size(plain, 20, 10)[1]).toEqual(corner(10, 0));
	});

	it('validates a stored vector mask', () => {
		expect(clean_vector_mask(null)).toBe(null);
		expect(clean_vector_mask({ width: 0, height: 5, anchors: [] })).toBe(null);
		expect(clean_vector_mask({ width: 5, height: 5, anchors: [{ x: 1, y: 2 }, 'x'], invert: 1 }))
			.toEqual({ closed: true, anchors: [corner(1, 2)], width: 5, height: 5, invert: false });
	});

	it('multiplies two masks', () => {
		expect(Array.from(multiply_masks(new Uint8Array([255, 255, 0]), new Uint8Array([255, 128, 255])))).toEqual([255, 128, 0]);
	});

	it('goes through a PSD file', () => {
		const curve = [corner(1, 1), { x: 3, y: 1, in: { x: 2.5, y: 0.5 }, out: { x: 3.5, y: 1.5 } }, corner(2, 3)];
		const block = vector_mask_block({ anchors: curve, invert: true }, 4, 4);
		const read = read_vector_mask(new Uint8Array(block), 12, block.length - 12, 4, 4)!;
		expect(read.invert).toBe(true);
		expect(read.disabled).toBe(false);
		expect(read.anchors.length).toBe(3);
		expect(read.anchors[0]).toEqual(corner(1, 1));
		expect(read.anchors[1].in!.x).toBeCloseTo(2.5);
		expect(read.anchors[1].out!.y).toBeCloseTo(1.5);

		const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
		const file = build_psd(4, 4, [{
			name: 'V', x: 0, y: 0, width: 4, height: 4, opacity: 100, visible: true, composition: 'source-over', data,
			vector: { anchors: curve, disabled: true },
		}] as any, new Uint8ClampedArray(64));
		const parsed = parse_psd(file.buffer as ArrayBuffer);
		expect(parsed.layers[0].vector_mask!.disabled).toBe(true);
		expect(parsed.layers[0].vector_mask!.anchors[2]).toEqual(corner(2, 3));
		expect(read_vector_mask(new Uint8Array(4), 0, 10, 4, 4)).toBe(null);
	});
});
