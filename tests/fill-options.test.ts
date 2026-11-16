import { FILL_CONTENTS, FILL_MODES, fill_operation, fill_color, clean_fill_options } from '../src/js/libs/fill-options.js';

describe('fill options', () => {
	it('knows the contents and the blend modes of the layers panel', () => {
		expect(FILL_CONTENTS).toEqual(['Foreground Color', 'Background Color', 'Pattern', 'Black', '50% Gray', 'White']);
		expect(FILL_MODES[0]).toBe('Normal');
		expect(FILL_MODES).toContain('Multiply');
		expect(fill_operation('Multiply')).toBe('multiply');
		expect(fill_operation('Normal')).toBe('source-over');
		expect(fill_operation('nope')).toBe('source-over');
	});

	it('gives the color of every content, none for a pattern or an unknown one', () => {
		expect(fill_color('Foreground Color', '#112233', '#445566')).toBe('#112233');
		expect(fill_color('Background Color', '#112233', '#445566')).toBe('#445566');
		expect(fill_color('Black', '#1', '#2')).toBe('#000000');
		expect(fill_color('50% Gray', '#1', '#2')).toBe('#808080');
		expect(fill_color('White', '#1', '#2')).toBe('#ffffff');
		expect(fill_color('Pattern', '#1', '#2')).toBeNull();
		expect(fill_color('x', '#1', '#2')).toBeNull();
	});

	it('cleans what the dialog returned', () => {
		expect(clean_fill_options({contents: 'White', mode: 'Screen', opacity: '40'})).toEqual({contents: 'White', mode: 'Screen', opacity: 40, color: null});
		expect(clean_fill_options({contents: 'x', mode: 'y', opacity: 'z'})).toEqual({contents: 'Foreground Color', mode: 'Normal', opacity: 100, color: null});
		expect(clean_fill_options({opacity: 500}).opacity).toBe(100);
		expect(clean_fill_options({opacity: -5}).opacity).toBe(1);
		expect(clean_fill_options(null as any)).toEqual({contents: 'Foreground Color', mode: 'Normal', opacity: 100, color: null});
		expect(clean_fill_options({color: '#FF8800'}).color).toBe('#ff8800');
		expect(clean_fill_options({color: 'red'}).color).toBeNull();
		expect(clean_fill_options({color: 5 as any}).color).toBeNull();
	});
});
