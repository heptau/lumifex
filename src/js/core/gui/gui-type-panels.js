import app from './../../app.js';
import config from './../../config.js';
import { metaDefaults } from './../../tools/text.js';
import { apply_meta, read_meta, meta_from_attributes, set_tool_attributes } from './../../libs/text-style.js';
import { t } from './../../modules/tools/translate.js';

//the number fields of the Character panel: key of the meta, label (a dictionary key), limits
const NUMBER_FIELDS = [
	{key: 'size', label: 'Size', min: 1, max: 1000, step: 1},
	{key: 'kerning', label: 'Kerning:', min: -999, max: 999, step: 1},
	{key: 'leading', label: 'Leading:', min: -999, max: 999, step: 1},
	{key: 'stroke_size', label: 'Stroke size:', min: 0, max: 100, step: 0.5},
];
const COLOR_FIELDS = [
	{key: 'fill_color', label: 'Color'},
	{key: 'stroke_color', label: 'Stroke color:'},
];
const FLAGS = [
	{key: 'bold', label: 'Bold', text: 'B'},
	{key: 'italic', label: 'Italic', text: 'I'},
	{key: 'underline', label: 'Underline', text: 'U'},
	{key: 'strikethrough', label: 'Strikethrough', text: 'S'},
];
const ALIGNS = [
	{key: 'left', label: 'Align Left'},
	{key: 'center', label: 'Align Horizontal Center'},
	{key: 'right', label: 'Align Right'},
];

/**
 * @param {string} key a dictionary key, maybe with a colon at the end (shared with the dialogs)
 * @returns {string} the translated label without the colon
 */
function label_text(key) {
	return t(key).replace(/:\s*$/, '');
}

/**
 * The Character and Paragraph panels (Photoshop): the style of the active text layer - or of the marked part while
 * the Text tool edits it - and its alignment. A number or a color changes the picture live while it is moved, the
 * change goes to the history once (Update_layer_action with new data, the same as Type > Character…). With no text
 * layer active the Character panel shows and edits the options of the Text tool (the style of the next text).
 */
class GUI_type_panels_class {

	constructor() {
		this.fields = {};
		this.flags = {};
		this.aligns = {};
		this.labels = [];
		this.pending = false;
		//a live change that is not in the history yet: {layer, data, range}
		this.preview = null;
	}

	render_main() {
		const character = document.getElementById('toggle_character');
		const paragraph = document.getElementById('toggle_paragraph');
		if (!character || !paragraph) {
			return;
		}
		this.build_character(character);
		this.build_paragraph(paragraph);

		document.addEventListener('minipaint:history', () => this.schedule());
		//the marked part of the text changes without a history step
		const follow_text_tool = () => {
			if (config.TOOL && config.TOOL.name == 'text') {
				this.schedule();
			}
		};
		document.addEventListener('mouseup', follow_text_tool);
		document.addEventListener('keyup', follow_text_tool);
		['character_base', 'paragraph_base'].forEach((id) => {
			const header = document.querySelector(`#${id} h2.toggle`);
			if (header) {
				header.addEventListener('click', () => this.schedule());
			}
		});
		this.schedule();
	}

	/**
	 * @param {HTMLElement} parent
	 * @param {string} key dictionary key of the label
	 * @param {HTMLElement} input
	 */
	add_row(parent, key, input) {
		const row = document.createElement('label');
		row.className = 'type_panel_row';
		const caption = document.createElement('span');
		caption.className = 'type_panel_label';
		caption.textContent = label_text(key);
		this.labels.push({element: caption, key});
		row.appendChild(caption);
		row.appendChild(input);
		parent.appendChild(row);
	}

	build_character(container) {
		const note = document.createElement('div');
		note.className = 'type_panel_note';
		container.appendChild(note);
		this.character_note = note;

		const font = document.createElement('select');
		font.className = 'type_panel_font';
		font.addEventListener('change', () => this.commit({family: font.value}));
		this.fields.family = font;
		this.add_row(container, 'Font', font);

		NUMBER_FIELDS.forEach((definition) => {
			const input = document.createElement('input');
			input.type = 'number';
			input.min = String(definition.min);
			input.max = String(definition.max);
			input.step = String(definition.step);
			const value = () => {
				const number = parseFloat(input.value);
				if (!isFinite(number)) {
					return null;
				}
				const change = {};
				change[definition.key] = Math.min(definition.max, Math.max(definition.min, number));
				return change;
			};
			input.addEventListener('input', () => {
				const change = value();
				if (change) {
					this.live(change);
				}
			});
			input.addEventListener('change', () => {
				const change = value();
				if (change) {
					this.commit(change);
				}
				else {
					this.cancel_live();
					this.sync();
				}
			});
			this.fields[definition.key] = input;
			this.add_row(container, definition.label, input);
		});

		COLOR_FIELDS.forEach((definition) => {
			const input = document.createElement('input');
			input.type = 'color';
			const change = () => {
				const result = {};
				result[definition.key] = input.value;
				return result;
			};
			input.addEventListener('input', () => this.live(change()));
			input.addEventListener('change', () => this.commit(change()));
			this.fields[definition.key] = input;
			this.add_row(container, definition.label, input);
		});

		const flags = document.createElement('div');
		flags.className = 'type_panel_buttons';
		flags.setAttribute('role', 'group');
		FLAGS.forEach((definition) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `type_panel_flag type_flag_${definition.key}`;
			button.textContent = definition.text;
			button.addEventListener('click', () => {
				const change = {};
				change[definition.key] = button.getAttribute('aria-pressed') != 'true';
				this.commit(change);
			});
			this.flags[definition.key] = button;
			flags.appendChild(button);
		});
		container.appendChild(flags);
		this.update_texts();
	}

	build_paragraph(container) {
		const note = document.createElement('div');
		note.className = 'type_panel_note';
		container.appendChild(note);
		this.paragraph_note = note;

		const group = document.createElement('div');
		group.className = 'type_panel_buttons';
		group.setAttribute('role', 'group');
		ALIGNS.forEach((definition) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `type_panel_align type_align_${definition.key}`;
			button.innerHTML = this.align_icon(definition.key);
			button.addEventListener('click', () => this.set_align(definition.key));
			this.aligns[definition.key] = button;
			group.appendChild(button);
		});
		container.appendChild(group);
	}

	/**
	 * @param {string} align left, center or right
	 * @returns {string} an SVG with four lines aligned that way
	 */
	align_icon(align) {
		const widths = [12, 8, 12, 6];
		const lines = widths.map((width, index) => {
			const x = align == 'left' ? 2 : align == 'right' ? 14 - width : 8 - width / 2;
			const y = 3.5 + index * 3;
			return `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}"/>`;
		}).join('');
		return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${lines}</svg>`;
	}

	update_texts() {
		this.labels.forEach((entry) => {
			entry.element.textContent = label_text(entry.key);
		});
		FLAGS.forEach((definition) => {
			const button = this.flags[definition.key];
			if (button) {
				button.title = t(definition.label);
				button.setAttribute('aria-label', t(definition.label));
			}
		});
		ALIGNS.forEach((definition) => {
			const button = this.aligns[definition.key];
			if (button) {
				button.title = t(definition.label);
				button.setAttribute('aria-label', t(definition.label));
			}
		});
	}

	/**
	 * @returns {object|null} the active layer when it is a text layer
	 */
	text_layer() {
		const layer = config.layer;
		return layer && layer.type == 'text' && Array.isArray(layer.data) ? layer : null;
	}

	/**
	 * @returns {object|null} the options of the Text tool
	 */
	tool_attributes() {
		const tool = (config.TOOLS || []).find((item) => item.name == 'text');
		return tool ? tool.attributes : null;
	}

	selection_range(layer) {
		try {
			//the module of the Type menu knows the editor of the Text tool (looked up at run time, no import cycle)
			const module = app.GUI.modules['type/character'];
			return module ? module.selection_range(layer) : null;
		}
		catch {
			return null;
		}
	}

	/**
	 * @returns {boolean} at least one of the panels is shown and open
	 */
	is_open() {
		return ['character', 'paragraph'].some((name) => {
			const block = document.getElementById(`${name}_base`);
			const content = document.getElementById(`toggle_${name}`);
			return block && content && !block.classList.contains('panel_hidden') && !content.classList.contains('hidden');
		});
	}

	schedule() {
		this.update_texts();
		if (this.pending) {
			return;
		}
		this.pending = true;
		setTimeout(() => {
			this.pending = false;
			this.sync();
		}, 60);
	}

	/**
	 * The fields follow the active layer (or the options of the Text tool); a field with the focus is left alone
	 */
	sync() {
		if (!this.is_open()) {
			return;
		}
		const layer = this.text_layer();
		if (this.preview && this.preview.layer !== layer) {
			this.preview = null;
		}
		let meta;
		if (layer) {
			const range = this.selection_range(layer);
			meta = read_meta(this.preview ? this.preview.data : layer.data, metaDefaults, range);
			this.character_note.textContent = range ? t('Selected text') : '';
		}
		else {
			meta = meta_from_attributes(this.tool_attributes(), metaDefaults);
			this.character_note.textContent = t('Text tool defaults');
		}
		this.character_note.hidden = this.character_note.textContent === '';

		const font = this.fields.family;
		const fonts = Array.from(new Set([metaDefaults.family, meta.family, ...(config.FONTS || []), ...Object.keys(config.user_fonts || {})]))
			.filter((name) => typeof name == 'string' && name !== '' && !name.includes('...')).sort();
		if (font.dataset.fonts !== fonts.join('\n')) {
			font.textContent = '';
			fonts.forEach((name) => {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = name;
				font.appendChild(option);
			});
			font.dataset.fonts = fonts.join('\n');
		}
		const active = document.activeElement;
		Object.keys(this.fields).forEach((key) => {
			const input = this.fields[key];
			if (input === active) {
				return;
			}
			input.value = meta[key] != null ? String(meta[key]) : '';
		});
		//the color inputs need #rrggbb
		COLOR_FIELDS.forEach((definition) => {
			const input = this.fields[definition.key];
			const value = String(meta[definition.key] || '');
			if (input !== active && /^#[0-9a-fA-F]{6}/.test(value)) {
				input.value = value.slice(0, 7);
			}
		});
		FLAGS.forEach((definition) => {
			this.flags[definition.key].setAttribute('aria-pressed', String(meta[definition.key] === true));
		});

		const align = layer && layer.params && layer.params.halign ? layer.params.halign : 'left';
		ALIGNS.forEach((definition) => {
			const button = this.aligns[definition.key];
			button.disabled = layer == null;
			button.setAttribute('aria-pressed', String(layer != null && align == definition.key));
		});
		this.paragraph_note.textContent = layer ? '' : t('No text layer');
		this.paragraph_note.hidden = layer != null;
	}

	/**
	 * A change while a number or a color is moved: the picture follows, the history not yet
	 *
	 * @param {object} changes
	 */
	live(changes) {
		const layer = this.text_layer();
		if (layer == null) {
			//the options of the Text tool have no picture to show, they are set at once
			this.set_tool(changes);
			return;
		}
		if (layer.locked === true) {
			return;
		}
		if (this.preview == null || this.preview.layer !== layer) {
			this.preview = {layer, data: layer.data, range: this.selection_range(layer)};
		}
		layer.data = apply_meta(this.preview.data, changes, metaDefaults, this.preview.range);
		layer._needs_update_data = true;
		config.need_render = true;
	}

	cancel_live() {
		if (this.preview) {
			this.preview.layer.data = this.preview.data;
			this.preview.layer._needs_update_data = true;
			this.preview = null;
			config.need_render = true;
		}
	}

	/**
	 * One step of the history (or a change of the options of the Text tool)
	 *
	 * @param {object} changes
	 */
	commit(changes) {
		const layer = this.text_layer();
		if (layer == null) {
			this.preview = null;
			this.set_tool(changes);
			this.sync();
			return;
		}
		let data = layer.data;
		let range;
		if (this.preview && this.preview.layer === layer) {
			data = this.preview.data;
			range = this.preview.range;
			this.cancel_live();
		}
		else {
			range = this.selection_range(layer);
		}
		const new_data = apply_meta(data, changes, metaDefaults, range);
		return app.State.do_action(
			new app.Actions.Bundle_action('character_panel', 'Character', [
				new app.Actions.Update_layer_action(layer.id, {data: new_data}),
			])
		);
	}

	/**
	 * @param {object} changes the meta of the next text
	 */
	set_tool(changes) {
		const attributes = this.tool_attributes();
		if (!attributes) {
			return;
		}
		set_tool_attributes(attributes, changes);
		if (config.TOOL && config.TOOL.name == 'text' && app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
	}

	/**
	 * @param {string} align left, center or right
	 */
	set_align(align) {
		const layer = this.text_layer();
		if (layer == null || (layer.params && layer.params.halign == align)) {
			return;
		}
		return app.State.do_action(
			new app.Actions.Bundle_action('paragraph_panel', 'Paragraph', [
				new app.Actions.Update_layer_action(layer.id, {params: Object.assign({}, layer.params, {halign: align})}),
			])
		);
	}
}

export default GUI_type_panels_class;
