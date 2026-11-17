import { next_screen_mode, clean_screen_mode, SCREEN_MODES } from '../src/js/libs/screen-mode.js';

describe('Screen modes', () => {
	it('cycles forwards and backwards like F / Shift+F in Photoshop', () => {
		expect(SCREEN_MODES).toEqual(['standard', 'menu', 'full']);
		expect(next_screen_mode('standard')).toBe('menu');
		expect(next_screen_mode('menu')).toBe('full');
		expect(next_screen_mode('full')).toBe('standard');
		expect(next_screen_mode('standard', true)).toBe('full');
		expect(next_screen_mode('nonsense')).toBe('menu');
	});

	it('cleans unknown modes', () => {
		expect(clean_screen_mode('full')).toBe('full');
		expect(clean_screen_mode('x')).toBe('standard');
	});
});
