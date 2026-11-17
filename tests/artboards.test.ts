import { clean_artboards, add_artboard, next_artboard_place, canvas_for_artboards, artboard_file_names } from '../src/js/libs/artboards.js';

describe('Artboards', () => {
	it('validates artboards from a project', () => {
		expect(clean_artboards([{id: 1, name: 'A', x: 0.4, y: 0, width: 100, height: 50}, {id: 1, x: 0, y: 0, width: 5, height: 5}, {id: 2, x: 'x', y: 0, width: 5, height: 5}, {id: 3, x: 0, y: 0, width: 0, height: 5}]))
			.toEqual([{id: 1, name: 'A', x: 0, y: 0, width: 100, height: 50}]);
		expect(clean_artboards(null)).toEqual([]);
	});

	it('adds artboards next to each other and grows the canvas to hold them', () => {
		let list = add_artboard([], {x: 0, y: 0, width: 100, height: 200});
		expect(list[0]).toEqual({id: 1, name: 'Artboard 1', x: 0, y: 0, width: 100, height: 200});
		const place = next_artboard_place(list);
		expect(place).toEqual({x: 200, y: 0});
		list = add_artboard(list, {...place, width: 50, height: 50}, 'Mobile');
		expect(list[1].id).toBe(2);
		expect(canvas_for_artboards(list, 120, 100)).toEqual({width: 250, height: 200});
		expect(next_artboard_place([])).toEqual({x: 0, y: 0});
	});

	it('makes unique file names', () => {
		const names = artboard_file_names([{id: 1, name: 'Home'}, {id: 2, name: 'Home'}, {id: 3, name: '///'}] as any);
		expect(names[0]).toBe('Home.png');
		expect(names[1]).toBe('Home-2.png');
		expect(names[2].endsWith('.png')).toBe(true);
	});
});
