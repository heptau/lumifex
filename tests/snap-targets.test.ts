import { default_snap_to, parse_snap_to, toggle_snap_to, grid_lines } from '../src/js/libs/snap-targets.js';

describe('snap targets', () => {
	it('has everything on by default', () => {
		expect(default_snap_to()).toEqual({guides: true, layers: true, bounds: true, grid: true});
	});

	it('reads a stored choice and trusts nothing else', () => {
		expect(parse_snap_to('{"guides":false,"layers":true}')).toEqual({guides: false, layers: true, bounds: true, grid: true});
		expect(parse_snap_to('{"bounds":0,"guides":"no","x":false}')).toEqual(default_snap_to());
		for (const bad of [null, undefined, '', 'nope', '[false]', '5', '"x"']) {
			expect(parse_snap_to(bad as any)).toEqual(default_snap_to());
		}
	});

	it('toggles one known target and ignores others', () => {
		const off = toggle_snap_to(default_snap_to(), 'layers');
		expect(off).toEqual({guides: true, layers: false, bounds: true, grid: true});
		expect(toggle_snap_to(off, 'layers')).toEqual(default_snap_to());
		expect(toggle_snap_to(off, 'x')).toEqual(off);
		expect((toggle_snap_to({} as any, 'bounds') as any).bounds).toBe(false);
	});
});

describe('grid_lines', () => {
	it('lists the lines inside the document without the edges', () => {
		expect(grid_lines(50, 200)).toEqual([50, 100, 150]);
		expect(grid_lines(50, 201)).toEqual([50, 100, 150, 200]);
	});

	it('gives nothing for bad input or an absurdly dense grid', () => {
		expect(grid_lines(0, 100)).toEqual([]);
		expect(grid_lines(NaN, 100)).toEqual([]);
		expect(grid_lines(10, 0)).toEqual([]);
		expect(grid_lines(1, 100000)).toEqual([]);
	});
});
