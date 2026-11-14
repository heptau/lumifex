import { division_positions, guides_for_layout, MAX_DIVISIONS } from '../src/js/libs/guide-layout.js';

describe('guide layout', () => {
	it('splits into equal columns without a gutter', () => {
		expect(division_positions(300, 0, 0, 3, 0)).toEqual([100, 200]);
		expect(division_positions(300, 0, 0, 1, 0)).toEqual([]);
	});

	it('gives two lines for every gutter', () => {
		//columns of 80 with gutters of 20: 0-80, 100-180, 200-280 in a width of 280
		expect(division_positions(280, 0, 0, 3, 20)).toEqual([80, 100, 180, 200]);
	});

	it('adds the margins and divides what is left', () => {
		expect(division_positions(300, 50, 50, 2, 0)).toEqual([50, 150, 250]);
		expect(division_positions(300, 50, 50, 2, 20)).toEqual([50, 140, 160, 250]);
	});

	it('never lets the gutters eat the columns and ignores margins that fill the document', () => {
		const lines = division_positions(100, 0, 0, 3, 1000);
		expect(lines.every((line) => line > 0 && line < 100)).toBe(true);
		expect(division_positions(100, 60, 60, 3, 0)).toEqual([40, 60]); //only the margin lines are left, inside the document
	});

	it('makes vertical guides from the width and horizontal ones from the height', () => {
		const guides = guides_for_layout(300, 200, { columns: 3, rows: 2, gutter: 0 });
		expect(guides).toEqual([{ x: 100, y: null }, { x: 200, y: null }, { x: null, y: 100 }]);
	});

	it('is safe with bad input', () => {
		expect(guides_for_layout(300, 200, {})).toEqual([]);
		expect(guides_for_layout(300, 200, { columns: 'abc' as any, rows: NaN, gutter: -5 })).toEqual([]);
		expect(guides_for_layout(300, 200, { columns: 1e9 }).length).toBeLessThan(MAX_DIVISIONS);
		expect(guides_for_layout(300, 200, null as any)).toEqual([]);
	});
});
