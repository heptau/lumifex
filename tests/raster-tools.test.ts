import { is_tool_disabled, needs_raster_layer } from '../src/js/libs/raster-tools.js';

describe('raster-only tools', () => {
	test('are disabled on vector layers', () => {
		expect(is_tool_disabled('blur', {type: 'text', is_vector: true})).toBe(true);
		expect(is_tool_disabled('fill', {type: 'rectangle', is_vector: true})).toBe(true);
	});

	test('work on image layers and on the empty layer', () => {
		expect(is_tool_disabled('blur', {type: 'image', is_vector: false})).toBe(false);
		expect(is_tool_disabled('fill', {type: null, is_vector: false})).toBe(false);
	});

	test('fill and erase refuse an image that is still vector', () => {
		expect(is_tool_disabled('fill', {type: 'image', is_vector: true})).toBe(true);
		expect(is_tool_disabled('blur', {type: 'image', is_vector: true})).toBe(false);
	});

	test('other tools are never disabled', () => {
		expect(is_tool_disabled('text', {type: 'text', is_vector: true})).toBe(false);
		expect(is_tool_disabled('hand', {type: 'rectangle', is_vector: true})).toBe(false);
		expect(is_tool_disabled('blur', null)).toBe(false);
	});
});

describe('Sample all layers', () => {
	it('keeps Magic Wand and Quick Selection usable on any layer', () => {
		const text = {type: 'text', is_vector: true};
		expect(is_tool_disabled('magic_wand', text, {sample_all: false})).toBe(true);
		expect(is_tool_disabled('magic_wand', text, {sample_all: true})).toBe(false);
		expect(is_tool_disabled('quick_select', text, {sample_all: {value: true}})).toBe(false);
		expect(is_tool_disabled('lasso', text, {sample_all: true})).toBe(true);
		expect(needs_raster_layer('magic_wand', {type: null}, {sample_all: true})).toBe(false);
		expect(needs_raster_layer('magic_wand', {type: null}, {sample_all: false})).toBe(true);
	});
});
