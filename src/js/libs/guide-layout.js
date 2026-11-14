/**
 * New Guide Layout (Photoshop): guides for the margins and for columns and rows with gutters between them.
 * Pure functions, no DOM.
 *
 * @typedef {{x: number|null, y: number|null}} Guide a vertical guide has x, a horizontal one has y
 * @typedef {{columns?: number, rows?: number, gutter?: number, margin_top?: number, margin_left?: number,
 *   margin_bottom?: number, margin_right?: number}} Guide_layout
 */

/** The most columns or rows, so a typo does not create thousands of guides */
export const MAX_DIVISIONS = 100;

/**
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @returns {number} a whole number in the range, min for anything that is not a number
 */
function whole(value, min, max) {
	const number = Math.round(typeof value == 'number' ? value : parseFloat(value));
	return isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

/**
 * The positions of the edges of the columns (or rows) between two margins. With a gutter every inner division gives
 * two lines: the end of one column and the start of the next.
 *
 * @param {number} length size of the document along the axis
 * @param {number} start margin at the beginning
 * @param {number} end margin at the end
 * @param {number} count number of columns
 * @param {number} gutter gap between two columns
 * @returns {number[]} positions inside the document, sorted, without duplicates
 */
export function division_positions(length, start, end, count, gutter) {
	const inner = length - start - end;
	const positions = [];
	if (start > 0) {
		positions.push(start);
	}
	if (end > 0) {
		positions.push(length - end);
	}
	if (inner > 0 && count >= 1) {
		const gaps = count - 1;
		const gap = Math.min(gutter, gaps > 0 ? inner / (gaps + count) : 0); //gutters never take more than the columns
		const column = (inner - gap * gaps) / count;
		for (let i = 0; i < count; i++) {
			const from = start + i * (column + gap);
			if (i > 0) {
				positions.push(from);
			}
			if (i < count - 1) {
				positions.push(from + column);
			}
		}
	}
	const rounded = positions.map((position) => Math.round(position * 100) / 100);
	return Array.from(new Set(rounded)).filter((position) => position > 0 && position < length).sort((a, b) => a - b);
}

/**
 * @param {number} width size of the document
 * @param {number} height
 * @param {Guide_layout} layout
 * @returns {Guide[]} the guides of the layout
 */
export function guides_for_layout(width, height, layout) {
	const options = layout || {};
	const columns = whole(options.columns, 0, MAX_DIVISIONS);
	const rows = whole(options.rows, 0, MAX_DIVISIONS);
	const gutter = whole(options.gutter, 0, 100000);
	const margin = (value) => whole(value, 0, 100000);
	const xs = division_positions(width, margin(options.margin_left), margin(options.margin_right), columns, gutter);
	const ys = division_positions(height, margin(options.margin_top), margin(options.margin_bottom), rows, gutter);
	return xs.map((x) => ({x, y: null})).concat(ys.map((y) => ({x: null, y})));
}
