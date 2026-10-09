import { TRANSPARENCY_TYPES, SEPARATOR, is_transparency_type, normalize_transparency_type, transparency_class } from '../src/js/libs/transparency-types.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('transparency types', () => {
	const css = readFileSync(join(__dirname, '../src/css/layout.css'), 'utf8');

	it('every background has a CSS class (squares is the default image)', () => {
		for (const name of TRANSPARENCY_TYPES.filter((type) => type !== SEPARATOR && type !== 'Squares')) {
			expect(css).toContain(`.transparent-grid.${transparency_class(name)}{`);
		}
	});

	it('validates stored values', () => {
		expect(is_transparency_type('Squares')).toBe(true);
		expect(is_transparency_type('Magenta')).toBe(true);
		expect(normalize_transparency_type('grey')).toBe('Gray');
		expect(normalize_transparency_type('green')).toBe('Green');
		expect(transparency_class('Gray')).toBe('grey');
		expect(is_transparency_type(SEPARATOR)).toBe(false);
		expect(is_transparency_type('<script>')).toBe(false);
	});
});
