import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { metaDefaults } from './../../tools/text.js';
import { meta_from_attributes, replace_text } from './../../libs/text-style.js';
import { pen_layer_anchors, text_path_bounds, clean_text_path, clean_offset, path_glyphs } from './../../libs/text-path.js';
import { t } from '../tools/translate.js';

let instance = null;

const MAX_TEXT_LENGTH = 5000;

/**
 * Type > Type on Path: a new text layer whose letters follow the path of the active Pen layer (libs/text-path.js,
 * drawn by Text_class.render_on_path). Type > Edit Type on Path (or a double click with the Text tool) changes the text
 * and the start offset. Each command is one step of the history.
 */
class Type_type_path_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
	}

	/**
	 * @param {string} value
	 * @returns {string} one line of text of a sensible length
	 */
	clean_text(value) {
		return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').slice(0, MAX_TEXT_LENGTH);
	}

	create() {
		const pen = config.layer;
		if (pen == null || pen.type != 'pen') {
			alertify.error(t('Select a path layer first.'));
			return;
		}
		const anchors = pen_layer_anchors(pen);
		if (anchors.length < 2) {
			alertify.error(t('A path needs at least 2 points.'));
			return;
		}
		const closed = pen.params && pen.params.closed === true;
		new Dialog_class().show({
			title: 'Type on Path',
			params: [
				{name: 'text', title: 'Text:', value: t('Type on a path')},
				{name: 'offset', title: 'Start offset (%):', value: 0, range: [0, 100]},
			],
			on_finish: (params) => {
				const text = this.clean_text(params.text);
				if (text.trim() === '') {
					alertify.error(t('Enter some text.'));
					return;
				}
				const tool = config.TOOLS.find((item) => item.name == 'text');
				const style = meta_from_attributes(tool ? tool.attributes : null, metaDefaults);
				//only what differs from the defaults is stored (the color always)
				const meta = {};
				Object.keys(style).forEach((key) => {
					if (style[key] !== metaDefaults[key] || key == 'fill_color') {
						meta[key] = style[key];
					}
				});
				const box = text_path_bounds(anchors, closed, style.size);
				const layer = {
					type: 'text',
					name: t('Type on Path'),
					data: [[{text, meta}]],
					params: {
						boundary: 'box',
						kerning: 'metrics',
						text_direction: 'ltr',
						wrap_direction: 'ttb',
						halign: 'left',
						valign: 'top',
						wrap: 'letter',
						path: anchors,
						path_closed: closed,
						path_offset: clean_offset(params.offset),
						path_origin: {x: box.x, y: box.y},
					},
					render_function: ['text', 'render'],
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height,
					rotate: 0,
					is_vector: true,
				};
				return app.State.do_action(
					new app.Actions.Bundle_action('type_on_path', 'Type on Path', [
						new app.Actions.Insert_layer_action(layer),
					])
				);
			},
		});
	}

	edit() {
		const layer = config.layer;
		const text_path = layer && layer.type == 'text' ? clean_text_path(layer.params) : null;
		if (text_path == null) {
			alertify.error(t('Select a text on a path first.'));
			return;
		}
		const current = path_glyphs(layer.data).map((glyph) => glyph.char).join('');
		new Dialog_class().show({
			title: 'Edit Type on Path',
			params: [
				{name: 'text', title: 'Text:', value: current},
				{name: 'offset', title: 'Start offset (%):', value: text_path.offset, range: [0, 100]},
			],
			on_finish: (params) => {
				const text = this.clean_text(params.text);
				const changes = {
					params: Object.assign({}, layer.params, {path_offset: clean_offset(params.offset)}),
				};
				if (text !== current) {
					changes.data = replace_text(layer.data, text);
				}
				return app.State.do_action(
					new app.Actions.Bundle_action('edit_type_on_path', 'Edit Type on Path', [
						new app.Actions.Update_layer_action(layer.id, changes),
					])
				);
			},
		});
	}
}

export default Type_type_path_class;
