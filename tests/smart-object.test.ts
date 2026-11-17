import {
	is_smart_object, make_smart_object, sanitize_smart_object, project_info, contents_layer, build_project,
	picture_project, place_contents, fit_placed, scale_replaced, contents_file_name, MAX_SMART_DOCUMENT,
} from '../src/js/libs/smart-object.js';
import { is_tool_disabled } from '../src/js/libs/raster-tools.js';
import { is_menu_item_disabled } from '../src/js/libs/menu-availability.js';

const project = picture_project('a.png', 'data:image/png;base64,AAAA', 40, 30, '1.0.0');
const smart = {type: 'image', smart_object: make_smart_object(project, 40, 30)};

describe('smart objects', () => {
	test('recognizes a smart object', () => {
		expect(is_smart_object(smart)).toBe(true);
		expect(is_smart_object({type: 'image', smart_object: null})).toBe(false);
		expect(is_smart_object({type: 'text', smart_object: smart.smart_object})).toBe(false);
		expect(is_smart_object(null)).toBe(false);
	});

	test('a picture project has the size and one image layer', () => {
		const parsed = JSON.parse(project);
		expect(parsed.info.width).toBe(40);
		expect(parsed.info.version).toBe('1.0.0');
		expect(parsed.layers).toHaveLength(1);
		expect(parsed.data[0].id).toBe(parsed.layers[0].id);
		expect(project_info(project)).toEqual({width: 40, height: 30});
		expect(project_info('{')).toBeNull();
		expect(project_info('{"info": {"width": 0, "height": 5}, "layers": []}')).toBeNull();
	});

	test('sanitizes a smart object from a file', () => {
		expect(sanitize_smart_object(smart.smart_object)).toEqual(smart.smart_object);
		expect(sanitize_smart_object(null)).toBeNull();
		expect(sanitize_smart_object([])).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, format: 'x'})).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, version: 2})).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, width: 41})).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, width: 1.5})).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, document: 'not json'})).toBeNull();
		expect(sanitize_smart_object({...smart.smart_object, document: ' '.repeat(MAX_SMART_DOCUMENT + 1)})).toBeNull();
		//unknown keys are dropped
		expect(Object.keys(sanitize_smart_object({...smart.smart_object, extra: 1}) || {})).not.toContain('extra');
	});

	test('the contents layer loses the placement of the parent', () => {
		const layer = {id: 7, order: 9, name: 'T', type: 'text', x: 100, y: 50, rotate: 30, opacity: 40, composition: 'multiply',
			filters: [{name: 'shadow'}], group: 'A', link_id: 3, mask: {width: 1}, params: {size: 5}};
		const result = contents_layer(layer, 10, 20);
		expect(result).toMatchObject({id: 1, order: 1, x: 10, y: 20, rotate: 0, opacity: 100, composition: 'source-over',
			filters: [], group: null, link_id: null, mask: null, params: {size: 5}, name: 'T'});
		expect(contents_layer(layer, 0, 0, {keep_mask: true}).mask).toEqual({width: 1});
		//keys the layer does not have are not added
		expect('blend_if' in result).toBe(false);
		//the original is untouched
		expect(layer.opacity).toBe(40);
	});

	test('build_project is a loadable project', () => {
		const json = JSON.parse(build_project({width: 5, height: 6, version: '2.0.0', layers: [{id: 4}]}));
		expect(json.info).toMatchObject({width: 5, height: 6, version: '2.0.0', layer_active: 4});
		expect(json.data).toEqual([]);
	});

	test('place_contents keeps an unrotated layer in place', () => {
		const frame = place_contents({x: 100, y: 50, width: 40, height: 20, rotate: 0}, 64, {x: 60, y: 62, width: 50, height: 24});
		expect(frame).toEqual({x: 96, y: 48, width: 50, height: 24});
	});

	test('place_contents turns the offset with the layer', () => {
		//the visible part is 10 px right of the center of a layer rotated by 90 degrees: it ends up 10 px below it
		const frame = place_contents({x: 0, y: 0, width: 100, height: 100, rotate: 90}, 0, {x: 10, y: 0, width: 100, height: 100});
		expect(frame.x).toBeCloseTo(0);
		expect(frame.y).toBeCloseTo(10);
	});

	test('fit_placed centers and makes smaller, never larger', () => {
		expect(fit_placed(100, 50, 400, 300)).toEqual({x: 150, y: 125, width: 100, height: 50});
		expect(fit_placed(800, 400, 400, 300)).toEqual({x: 0, y: 50, width: 400, height: 200});
	});

	test('scale_replaced keeps the scale and the center', () => {
		expect(scale_replaced({x: 0, y: 0, width: 200, height: 100}, 100, 50, 50, 50)).toEqual({x: 50, y: 0, width: 100, height: 100});
	});

	test('contents_file_name is safe', () => {
		expect(contents_file_name('a/b:c')).toBe('a-b-c.json');
		expect(contents_file_name('')).toBe('smart-object.json');
	});

	test('pixel tools are disabled, selection tools and quick mask are not', () => {
		expect(is_tool_disabled('erase', smart)).toBe(true);
		expect(is_tool_disabled('clone', smart)).toBe(true);
		expect(is_tool_disabled('magic_wand', smart)).toBe(false);
		expect(is_tool_disabled('quick_mask', smart)).toBe(false);
		expect(is_tool_disabled('erase', {type: 'image'})).toBe(false);
	});

	test('menu: pixel commands are disabled, smart filters and smart object commands are not', () => {
		expect(is_menu_item_disabled('image/adjustments.invert', smart)).toBe(true);
		expect(is_menu_item_disabled('edit/fill.fill', smart)).toBe(true);
		expect(is_menu_item_disabled('effects/common/blur', smart)).toBe(false);
		expect(is_menu_item_disabled('layer/smart_filter.add', smart)).toBe(false);
		expect(is_menu_item_disabled('edit/selection.color_range', smart)).toBe(false);
		expect(is_menu_item_disabled('image/adjustments.fade', smart)).toBe(false);
		expect(is_menu_item_disabled('layer/smart_object.edit_contents', smart)).toBe(false);
		expect(is_menu_item_disabled('layer/smart_object.edit_contents', {type: 'image'})).toBe(true);
		expect(is_menu_item_disabled('layer/smart_object.rasterize', {type: 'text'})).toBe(true);
		expect(is_menu_item_disabled('layer/smart_object.convert', {type: 'text'})).toBe(false);
	});
});
