import { default_snap_to, parse_snap_to, toggle_snap_to } from '../src/js/libs/snap-targets.js';

describe('snap targets', () => {
	it('has everything on by default', () => {
		expect(default_snap_to()).toEqual({guides: true, layers: true, bounds: true});
	});

	it('reads a stored choice and trusts nothing else', () => {
		expect(parse_snap_to('{"guides":false,"layers":true}')).toEqual({guides: false, layers: true, bounds: true});
		expect(parse_snap_to('{"bounds":0,"guides":"no","x":false}')).toEqual(default_snap_to());
		for (const bad of [null, undefined, '', 'nope', '[false]', '5', '"x"']) {
			expect(parse_snap_to(bad as any)).toEqual(default_snap_to());
		}
	});

	it('toggles one known target and ignores others', () => {
		const off = toggle_snap_to(default_snap_to(), 'layers');
		expect(off).toEqual({guides: true, layers: false, bounds: true});
		expect(toggle_snap_to(off, 'layers')).toEqual(default_snap_to());
		expect(toggle_snap_to(off, 'grid')).toEqual(off);
		expect((toggle_snap_to({} as any, 'bounds') as any).bounds).toBe(false);
	});
});
