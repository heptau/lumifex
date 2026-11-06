import { BLEND_MODES, cycle_blend_mode } from '../src/js/libs/blend-modes.js';
import shortcuts, { EXTRA_SHORTCUTS } from '../src/js/config-shortcuts.js';

describe('blend mode cycling', () => {
	it('steps to the next and the previous mode', () => {
		expect(cycle_blend_mode('source-over', 1)).toBe('darken');
		expect(cycle_blend_mode('multiply', -1)).toBe('darken');
		expect(cycle_blend_mode('multiply', 1)).toBe('color-burn');
	});

	it('is circular', () => {
		expect(cycle_blend_mode('luminosity', 1)).toBe('source-over');
		expect(cycle_blend_mode('source-over', -1)).toBe('luminosity');
	});

	it('a missing or unknown mode counts as Normal', () => {
		expect(cycle_blend_mode(undefined, 1)).toBe('darken');
		expect(cycle_blend_mode(null, -1)).toBe('luminosity');
		expect(cycle_blend_mode('lighter', 1)).toBe('darken');
	});

	it('a full circle returns to the start', () => {
		let mode = 'screen';
		for (let i = 0; i < BLEND_MODES.length; i++) {
			mode = cycle_blend_mode(mode, 1);
		}
		expect(mode).toBe('screen');
	});

	it('has default shortcuts that repeat', () => {
		const specs = Object.fromEntries(EXTRA_SHORTCUTS.map((entry) => [entry.id, entry.spec]));
		expect(specs['layer/blend_cycle.next']).toBe('Alt++');
		expect(specs['layer/blend_cycle.previous']).toBe('Alt+-');
		expect(shortcuts.length).toBeGreaterThan(0);
	});
});
