import { capture_comp, comp_changes, step_comp, clean_comps, snapshot_layers } from '../src/js/libs/layer-comps.js';

const layers = () => [
	{id: 1, visible: true, x: 0, y: 0, opacity: 100, composition: 'source-over'},
	{id: 2, visible: false, x: 10, y: 20, opacity: 50, composition: 'multiply', filters: [{name: 'shadow', params: {}}]},
];

describe('Layer comps', () => {
	it('remembers only the chosen kinds of state', () => {
		const snap = snapshot_layers(layers(), {visibility: true, position: false, appearance: false});
		expect(snap).toEqual({1: {visible: true}, 2: {visible: false}});
		const all = snapshot_layers(layers(), {visibility: true, position: true, appearance: true});
		expect(all[2]).toEqual({visible: false, x: 10, y: 20, opacity: 50, composition: 'multiply', filters: [{name: 'shadow', params: {}}]});
	});

	it('numbers the comps and gives back the changes to apply', () => {
		const first = capture_comp([], layers(), 'One', {visibility: true, position: true, appearance: true});
		expect(first.id).toBe(1);
		expect(capture_comp([first], layers(), '', {} as any).id).toBe(2);
		const now = layers();
		now[0].visible = false;
		now[1].x = 99;
		now.push({id: 3, visible: true, x: 0, y: 0, opacity: 100, composition: 'source-over'});
		expect(comp_changes(now, first)).toEqual([{id: 1, settings: {visible: true}}, {id: 2, settings: {x: 10}}]);
		expect(comp_changes(layers(), first)).toEqual([]);
	});

	it('steps to the next and previous comp in a circle', () => {
		const comps = [{id: 1}, {id: 2}, {id: 3}] as any;
		expect(step_comp(comps, 3, 1)!.id).toBe(1);
		expect(step_comp(comps, 1, -1)!.id).toBe(3);
		expect(step_comp(comps, null, -1)!.id).toBe(3);
		expect(step_comp([], 1, 1)).toBe(null);
	});

	it('validates comps from a project', () => {
		const comps = clean_comps([
			{id: 1, name: 'A', layers: {1: {visible: true, x: 'x', opacity: 500, composition: 'multiply'}, bad: {}}},
			{id: 1, name: 'duplicate', layers: {}},
			{id: 'x', layers: {}},
			null,
		]);
		expect(comps).toEqual([{id: 1, name: 'A', comment: '', options: {visibility: true, position: true, appearance: true}, layers: {1: {visible: true, opacity: 100, composition: 'multiply'}}}]);
		expect(clean_comps('nonsense')).toEqual([]);
	});
});
