import { property_fields, smart_property_fields, fields_from_params, field_value } from '../src/js/libs/adjustment-fields.js';
import { ADJUSTMENTS } from '../src/js/libs/adjustment-layers.js';

describe('property_fields', () => {
	it('has a field for every named setting of an adjustment, except the curves graph', () => {
		const levels = property_fields('levels');
		expect(levels.map((f) => f.name)).toEqual(['channel', 'in_black', 'gamma', 'in_white', 'out_black', 'out_white']);
		expect(levels[0].kind).toBe('select');
		expect(levels[2]).toMatchObject({kind: 'range', step: 0.01, range: [0.1, 5]});
		expect(property_fields('curves').map((f) => f.name)).toEqual(['channel']);
	});

	it('knows colors and checkboxes, and nothing for Invert or an unknown key', () => {
		const bw = property_fields('black_white');
		expect(bw.find((f) => f.name == 'tint')!.kind).toBe('checkbox');
		expect(bw.find((f) => f.name == 'tint_color')!.kind).toBe('color');
		expect(property_fields('invert')).toEqual([]);
		expect(property_fields('nope')).toEqual([]);
		expect(property_fields(undefined as any)).toEqual([]);
	});

	it('every adjustment setting that is not a heading has an input', () => {
		Object.keys(ADJUSTMENTS).forEach((key) => {
			const named = ADJUSTMENTS[key].params.filter((p: any) => p.name);
			expect(property_fields(key).length).toBe(named.length);
		});
	});
});

describe('smart_property_fields', () => {
	it('has fields for the settings of a smart filter, also the ones that are not adjustments', () => {
		expect(smart_property_fields('unsharp_mask').map((f) => f.name)).toEqual(['amount', 'radius', 'threshold']);
		expect(smart_property_fields('gaussian_blur')[0]).toMatchObject({kind: 'range', step: 0.1});
		expect(smart_property_fields('add_noise').some((f) => f.kind == 'checkbox')).toBe(true);
	});

	it('curves are not a smart filter, an unknown key has no fields', () => {
		expect(smart_property_fields('curves')).toEqual([]);
		expect(smart_property_fields('nope')).toEqual([]);
	});

	it('fields_from_params skips headings and entries it cannot show', () => {
		expect(fields_from_params([{heading: 'H'} as any, {name: 'a', title: 'A', value: 1}, {name: 'b', title: 'B', value: 1, range: [0, 2]}]).map((f) => f.name)).toEqual(['b']);
	});
});

describe('field_value', () => {
	const range = {name: 'x', title: 'X', kind: 'range', range: [-10, 10], value: 3} as any;

	it('limits numbers to the range and falls back to the default', () => {
		expect(field_value(range, '4.5')).toBe(4.5);
		expect(field_value(range, '99')).toBe(10);
		expect(field_value(range, -99)).toBe(-10);
		expect(field_value(range, 'x')).toBe(3);
	});

	it('accepts only listed values, valid colors and booleans', () => {
		const select = {name: 'c', title: 'C', kind: 'select', values: ['a', 'b'], value: 'a'} as any;
		expect(field_value(select, 'b')).toBe('b');
		expect(field_value(select, 'z')).toBe('a');
		const color = {name: 'k', title: 'K', kind: 'color', value: '#000000'} as any;
		expect(field_value(color, '#FFAA00')).toBe('#ffaa00');
		expect(field_value(color, 'red')).toBe('#000000');
		const box = {name: 'b', title: 'B', kind: 'checkbox', value: false} as any;
		expect(field_value(box, true)).toBe(true);
		expect(field_value(box, 'on')).toBe(true);
		expect(field_value(box, 'no')).toBe(false);
	});
});
