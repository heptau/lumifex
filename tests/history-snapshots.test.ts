import {
	clean_snapshot_name, next_snapshot_name, add_snapshot, remove_snapshot, rename_snapshot, valid_source,
	MAX_SNAPSHOTS, MAX_SNAPSHOT_NAME,
} from '../src/js/libs/history-snapshots.js';

describe('clean_snapshot_name', () => {
	it('trims and collapses spaces', () => {
		expect(clean_snapshot_name('  Before   sky ', 'x')).toBe('Before sky');
	});

	it('removes control characters and limits the length', () => {
		expect(clean_snapshot_name('a\nb\tc', 'x')).toBe('a b c');
		expect(clean_snapshot_name('y'.repeat(200), 'x')).toHaveLength(MAX_SNAPSHOT_NAME);
	});

	it('falls back for empty or non-string names', () => {
		expect(clean_snapshot_name('   ', 'Snapshot 1')).toBe('Snapshot 1');
		expect(clean_snapshot_name(null, 'Snapshot 1')).toBe('Snapshot 1');
		expect(clean_snapshot_name(42, 'S')).toBe('S');
	});
});

describe('next_snapshot_name', () => {
	it('starts at 1', () => {
		expect(next_snapshot_name([])).toBe('Snapshot 1');
		expect(next_snapshot_name(undefined, 'Snímek')).toBe('Snímek 1');
	});

	it('continues after the highest number and ignores other names', () => {
		const list = [{name: 'Snapshot 2'}, {name: 'Retouched'}, {name: 'Snapshot 7'}, {name: 'Snapshot x'}];
		expect(next_snapshot_name(list)).toBe('Snapshot 8');
	});
});

describe('add_snapshot', () => {
	it('appends without changing the original list', () => {
		const list = [{id: 1}];
		const result = add_snapshot(list, {id: 2});
		expect(result.list.map((s) => s.id)).toEqual([1, 2]);
		expect(result.dropped).toEqual([]);
		expect(list).toHaveLength(1);
	});

	it('drops the oldest over the limit', () => {
		const result = add_snapshot([{id: 1}, {id: 2}, {id: 3}], {id: 4}, 3);
		expect(result.list.map((s) => s.id)).toEqual([2, 3, 4]);
		expect(result.dropped.map((s) => s.id)).toEqual([1]);
		expect(MAX_SNAPSHOTS).toBe(20);
	});
});

describe('remove / rename / valid_source', () => {
	const list = [{id: 1, name: 'A'}, {id: 2, name: 'B'}];

	it('removes by id', () => {
		expect(remove_snapshot(list, 1)).toEqual([{id: 2, name: 'B'}]);
	});

	it('renames by id and keeps the old name for an empty one', () => {
		expect(rename_snapshot(list, 2, ' C ')[1].name).toBe('C');
		expect(rename_snapshot(list, 2, '')[1].name).toBe('B');
		expect(list[1].name).toBe('B');
	});

	it('keeps a source that exists, otherwise null', () => {
		expect(valid_source(list, 2)).toBe(2);
		expect(valid_source(list, 5)).toBeNull();
		expect(valid_source(list, null)).toBeNull();
	});
});
