import { ANCHORS, anchor_shares, anchor_offset } from '../src/js/libs/canvas-anchor.js';

describe('canvas anchor', () => {
	it('has nine anchors and Top Left first', () => {
		expect(ANCHORS).toHaveLength(9);
		expect(ANCHORS[0]).toBe('Top Left');
	});

	it('maps the anchors to the share of the change', () => {
		expect(anchor_shares('Top Left')).toEqual({ x: 0, y: 0 });
		expect(anchor_shares('Center')).toEqual({ x: 0.5, y: 0.5 });
		expect(anchor_shares('Bottom Right')).toEqual({ x: 1, y: 1 });
		expect(anchor_shares('Top Right')).toEqual({ x: 1, y: 0 });
		expect(anchor_shares('Left')).toEqual({ x: 0, y: 0.5 });
		expect(anchor_shares('nonsense')).toEqual({ x: 0, y: 0 });
		expect(anchor_shares(undefined as any)).toEqual({ x: 0, y: 0 });
	});

	it('does not move anything for the top left anchor', () => {
		expect(anchor_offset(100, 100, 300, 200, 'Top Left')).toEqual({ x: 0, y: 0 });
	});

	it('moves content right and down when the canvas grows around the center', () => {
		expect(anchor_offset(100, 100, 300, 200, 'Center')).toEqual({ x: 100, y: 50 });
	});

	it('moves content left and up when the canvas shrinks towards the bottom right', () => {
		expect(anchor_offset(300, 200, 100, 100, 'Bottom Right')).toEqual({ x: -200, y: -100 });
	});

	it('rounds to whole pixels and survives bad numbers', () => {
		expect(anchor_offset(10, 10, 13, 13, 'Center')).toEqual({ x: 2, y: 2 });
		expect(anchor_offset(10, 10, NaN, 10, 'Center')).toEqual({ x: 0, y: 0 });
	});
});
