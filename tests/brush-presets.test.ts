import { snapshot_attributes, apply_preset, parse_presets, add_preset, remove_preset, clean_preset_name, MAX_PRESETS } from '../src/js/libs/brush-presets.js';

const attributes = () => ({
	size: 4,
	pressure: false,
	hardness: { value: 100, min: 0, max: 100 },
	tip: { value: 'Round', values: ['Round', 'Custom'] },
});

describe('brush presets', () => {
	it('takes the values of all options, objects and plain ones', () => {
		expect(snapshot_attributes(attributes())).toEqual({ size: 4, pressure: false, hardness: 100, tip: 'Round' });
		expect(snapshot_attributes(null as any)).toEqual({});
	});

	it('applies a preset in place and keeps the shape of the options', () => {
		const target = attributes();
		const changed = apply_preset(target, { size: 30, pressure: true, hardness: 20, tip: 'Custom' });
		expect(changed).toBe(4);
		expect(target.size).toBe(30);
		expect(target.pressure).toBe(true);
		expect(target.hardness).toEqual({ value: 20, min: 0, max: 100 });
		expect(target.tip.value).toBe('Custom');
	});

	it('limits numbers to the range and ignores unknown names and wrong types', () => {
		const target = attributes();
		apply_preset(target, { hardness: 500, nope: 1, size: 'big' as any, pressure: 1 as any, tip: 'Hexagon' });
		expect(target.hardness.value).toBe(100);
		expect(target.size).toBe(4);
		expect(target.pressure).toBe(false);
		expect(target.tip.value).toBe('Round');
		expect((target as any).nope).toBeUndefined();
		apply_preset(target, { hardness: -9 });
		expect(target.hardness.value).toBe(0);
		expect(apply_preset(target, null as any)).toBe(0);
	});

	it('does not touch inherited properties such as __proto__', () => {
		const target = attributes();
		expect(apply_preset(target, JSON.parse('{"__proto__": 1, "constructor": 2, "toString": 3}'))).toBe(0);
	});

	it('cleans names', () => {
		expect(clean_preset_name('  Soft\u0000 brush ')).toBe('Soft brush');
		expect(clean_preset_name(null)).toBe('');
		expect(clean_preset_name('x'.repeat(100)).length).toBe(40);
	});

	it('adds, replaces and removes presets', () => {
		let list = add_preset([], 'A', { size: 1 }) as any[];
		list = add_preset(list, 'B', { size: 2 }) as any[];
		list = add_preset(list, 'A', { size: 9 }) as any[];
		expect(list).toEqual([{ name: 'A', values: { size: 9 } }, { name: 'B', values: { size: 2 } }]);
		expect(remove_preset(list, 'A')).toEqual([{ name: 'B', values: { size: 2 } }]);
		expect(add_preset(list, '   ', {})).toBeNull();
	});

	it('refuses a new preset when the list is full but still replaces an old one', () => {
		const full = Array.from({ length: MAX_PRESETS }, (_, i) => ({ name: `p${i}`, values: {} }));
		expect(add_preset(full, 'new', {})).toBeNull();
		expect(add_preset(full, 'p3', { size: 1 })).toHaveLength(MAX_PRESETS);
	});

	it('reads the stored text defensively', () => {
		expect(parse_presets(null)).toEqual([]);
		expect(parse_presets('not json')).toEqual([]);
		expect(parse_presets('{"a":1}')).toEqual([]);
		const text = JSON.stringify([
			{ name: 'ok', values: { size: 5, tip: 'Round', bad: { x: 1 }, inf: null } },
			{ name: 'ok', values: { size: 6 } },
			{ name: '', values: {} },
			{ name: 'list', values: [1] },
			'x',
			null,
		]);
		expect(parse_presets(text)).toEqual([{ name: 'ok', values: { size: 5, tip: 'Round' } }]);
		expect(parse_presets('x'.repeat(200000))).toEqual([]);
	});
});
