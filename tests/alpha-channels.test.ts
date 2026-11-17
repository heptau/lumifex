import {
	next_channel_name, clean_alpha_channels, add_channel, replace_channel, remove_channel, rename_channel, channel_to_mask,
	MAX_ALPHA_CHANNELS,
} from '../src/js/libs/alpha-channels.js';

function mask(width: number, height: number, values: number[]) {
	return {width, height, data: Uint8ClampedArray.from(values)};
}

describe('next_channel_name', () => {
	it('numbers after the highest Alpha N', () => {
		expect(next_channel_name([])).toBe('Alpha 1');
		expect(next_channel_name([{name: 'Alpha 3'}, {name: 'Sky'}], 'Alfa')).toBe('Alfa 1');
		expect(next_channel_name([{name: 'Alpha 3'}, {name: 'Alpha 1'}])).toBe('Alpha 4');
	});
});

describe('add_channel / channel_to_mask', () => {
	it('encodes and decodes the mask', () => {
		const m = mask(3, 2, [0, 0, 255, 255, 128, 0]);
		const result = add_channel([], m, '  Sky ');
		expect(result).not.toBeNull();
		const channel = result!.channel;
		expect(channel.id).toBe(1);
		expect(channel.name).toBe('Sky');
		expect(channel.values).toEqual([0, 255, 128, 0]);
		expect(channel.counts).toEqual([2, 2, 1, 1]);
		expect(Array.from(channel_to_mask(channel, 3, 2)!.data)).toEqual([0, 0, 255, 255, 128, 0]);
	});

	it('gives the next id and a default name', () => {
		const first = add_channel([], mask(1, 1, [255]), '')!;
		const second = add_channel(first.list, mask(1, 1, [0]), '')!;
		expect(second.channel.id).toBe(2);
		expect(second.channel.name).toBe('Alpha 2');
		expect(second.list).toHaveLength(2);
		expect(first.list).toHaveLength(1);
	});

	it('refuses more than the limit', () => {
		let list: ReturnType<typeof clean_alpha_channels> = [];
		for (let i = 0; i < MAX_ALPHA_CHANNELS; i++) {
			list = add_channel(list, mask(1, 1, [255]), '')!.list;
		}
		expect(add_channel(list, mask(1, 1, [255]), '')).toBeNull();
	});

	it('stretches a channel of another size', () => {
		const channel = add_channel([], mask(2, 1, [0, 255]), 'x')!.channel;
		expect(Array.from(channel_to_mask(channel, 4, 2)!.data)).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
	});
});

describe('replace / remove / rename', () => {
	const list = add_channel(add_channel([], mask(1, 1, [255]), 'A')!.list, mask(1, 1, [0]), 'B')!.list;

	it('replaces the mask and keeps the name', () => {
		const next = replace_channel(list, 1, mask(2, 1, [0, 0]));
		expect(next[0].name).toBe('A');
		expect(next[0].width).toBe(2);
		expect(next[0].counts).toEqual([2]);
		expect(list[0].width).toBe(1);
	});

	it('removes and renames by id', () => {
		expect(remove_channel(list, 1).map((c) => c.name)).toEqual(['B']);
		expect(rename_channel(list, 2, 'Edge')[1].name).toBe('Edge');
		expect(rename_channel(list, 2, '  ')[1].name).toBe('B');
	});
});

describe('clean_alpha_channels', () => {
	const good = {id: 1, name: 'Sky', width: 2, height: 2, values: [0, 255], counts: [1, 3]};

	it('keeps valid channels', () => {
		expect(clean_alpha_channels([good])).toEqual([good]);
	});

	it('drops anything broken', () => {
		expect(clean_alpha_channels('x')).toEqual([]);
		expect(clean_alpha_channels([
			null,
			{...good, id: 0},
			{...good, width: 2.5},
			{...good, counts: [1, 2]},
			{...good, values: [0, 300]},
			{...good, values: [0], counts: [4, 1]},
			{...good, counts: [0, 4]},
			{...good, width: 100000, height: 100000, counts: [1, 9999999999]},
		])).toEqual([]);
	});

	it('drops duplicate ids and cleans the name', () => {
		const result = clean_alpha_channels([good, {...good, name: 'Other'}, {...good, id: 2, name: '\n'}]);
		expect(result.map((c) => c.id)).toEqual([1, 2]);
		expect(result[1].name).toBe('Alpha 2');
	});
});
