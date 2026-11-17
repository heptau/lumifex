import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import { channel_mask } from './../../libs/selection-mask.js';
import {
	default_view, is_default_view, toggle_channel, solo_channel, view_matrix, compose_filter, COLOR_CHANNELS,
} from './../../libs/channel-view.js';
import { t } from './../../modules/tools/translate.js';
import { channel_to_mask } from './../../libs/alpha-channels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const THUMB_WIDTH = 40;
const THUMB_HEIGHT = 30;

//the rows of the panel: the whole picture first, then the channels
const ROWS = [
	{channel: 'rgb', label: 'RGB'},
	{channel: 'red', label: 'Red'},
	{channel: 'green', label: 'Green'},
	{channel: 'blue', label: 'Blue'},
	{channel: 'alpha', label: 'Transparency'},
];

/**
 * Channels panel (Photoshop): the red, green, blue and transparency channels of the active layer as small gray pictures.
 * The eye hides a color channel in the view, a click on a name shows the channel alone as a gray picture, the button
 * next to it turns the channel into a selection. Only the view changes (a color matrix on the canvas), the image and the
 * exports stay untouched.
 */
class GUI_channels_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.view = default_view();
		this.rows = {};
		this.pending = false;
		this.matrix_node = null;
		this.alpha_list = null;
		this.alpha_signature = null;
	}

	render_main_channels() {
		const container = document.getElementById('toggle_channels');
		if (!container) {
			return;
		}
		const list = document.createElement('div');
		list.className = 'channels_list';
		list.setAttribute('role', 'group');
		list.setAttribute('aria-label', t('Channels'));
		ROWS.forEach((definition) => {
			const row = document.createElement('div');
			row.className = 'channel_row';
			row.dataset.channel = definition.channel;

			const eye = document.createElement('button');
			eye.type = 'button';
			eye.className = 'channel_eye';
			if (COLOR_CHANNELS.includes(definition.channel)) {
				eye.title = t('Show / hide the channel in the view');
				eye.setAttribute('aria-label', `${t(definition.label)}: ${t('Show / hide the channel in the view')}`);
				eye.addEventListener('click', () => this.set_view(toggle_channel(this.view, definition.channel)));
			}
			else {
				eye.disabled = true;
				eye.classList.add('placeholder');
				eye.setAttribute('aria-hidden', 'true');
				eye.tabIndex = -1;
			}
			row.appendChild(eye);

			const thumb = document.createElement('canvas');
			thumb.width = THUMB_WIDTH;
			thumb.height = THUMB_HEIGHT;
			thumb.className = 'channel_thumb';
			thumb.setAttribute('aria-hidden', 'true');
			row.appendChild(thumb);

			const name = document.createElement('button');
			name.type = 'button';
			name.className = 'channel_name';
			name.textContent = t(definition.label);
			name.title = definition.channel == 'rgb' ? t('Show the whole picture') : t('Show only this channel');
			name.addEventListener('click', () => this.set_view(solo_channel(this.view, definition.channel)));
			row.appendChild(name);

			if (definition.channel != 'rgb') {
				const select = document.createElement('button');
				select.type = 'button';
				select.className = 'channel_select';
				select.title = t('Load channel as selection');
				select.setAttribute('aria-label', `${t(definition.label)}: ${t('Load channel as selection')}`);
				select.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" '
					+ 'stroke-linecap="round" stroke-dasharray="2 2.4" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/></svg>';
				select.addEventListener('click', () => app.GUI.run_target('edit/selection.load_channel', definition.channel));
				row.appendChild(select);
			}
			list.appendChild(row);
			this.rows[definition.channel] = {row, eye, thumb, name};
		});
		container.appendChild(list);

		//alpha channels of the document (saved selections that belong to the project)
		this.alpha_list = document.createElement('div');
		this.alpha_list.className = 'channels_list alpha_channels_list';
		this.alpha_list.setAttribute('role', 'group');
		this.alpha_list.setAttribute('aria-label', t('Alpha channels'));
		this.alpha_list.addEventListener('click', (event) => this.click_alpha(event));
		this.alpha_list.addEventListener('dblclick', (event) => {
			const name = event.target.closest('.channel_name[data-alpha]');
			if (name) {
				app.GUI.run_target('edit/selection.rename_alpha_channel', parseInt(name.dataset.alpha, 10));
			}
		});
		container.appendChild(this.alpha_list);

		const footer = document.createElement('div');
		footer.className = 'channels_footer';
		const save = document.createElement('button');
		save.type = 'button';
		save.className = 'channel_save';
		save.dataset.alphaAction = 'save';
		save.textContent = t('Save Selection as Channel');
		save.addEventListener('click', () => app.GUI.run_target('edit/selection.save_to_channel'));
		footer.appendChild(save);
		container.appendChild(footer);

		document.addEventListener('minipaint:history', () => this.schedule());
		document.addEventListener('minipaint:view-filter', () => this.apply());
		this.update_state();
		this.render();
	}

	/**
	 * Clicks on the rows of the alpha channels: the name or the dotted circle = load as selection,
	 * the arrow = replace with the current selection, × = delete
	 */
	click_alpha(event) {
		const button = event.target.closest('[data-alpha-action]');
		if (!button) {
			return;
		}
		const id = parseInt(button.dataset.alpha, 10);
		const targets = {
			load: 'edit/selection.load_alpha_channel',
			replace: 'edit/selection.replace_alpha_channel',
			delete: 'edit/selection.delete_alpha_channel',
		};
		const target = targets[button.dataset.alphaAction];
		if (target) {
			app.GUI.run_target(target, id);
		}
	}

	/**
	 * Rows of the alpha channels, rebuilt only when the list changes (the lists are replaced, never changed in place)
	 */
	render_alpha() {
		if (!this.alpha_list) {
			return;
		}
		const channels = Array.isArray(config.alpha_channels) ? config.alpha_channels : [];
		if (this.alpha_signature === channels && this.alpha_list.dataset.lang === config.LANG) {
			return;
		}
		this.alpha_signature = channels;
		this.alpha_list.dataset.lang = config.LANG;
		this.alpha_list.innerHTML = '';
		this.alpha_list.setAttribute('aria-label', t('Alpha channels'));
		const save = document.querySelector('#toggle_channels .channel_save');
		if (save) {
			save.textContent = t('Save Selection as Channel');
		}
		for (const channel of channels) {
			const row = document.createElement('div');
			row.className = 'channel_row alpha_channel_row';

			const spacer = document.createElement('span');
			spacer.className = 'channel_eye placeholder';
			spacer.setAttribute('aria-hidden', 'true');
			row.appendChild(spacer);

			const thumb = document.createElement('canvas');
			thumb.width = THUMB_WIDTH;
			thumb.height = THUMB_HEIGHT;
			thumb.className = 'channel_thumb';
			thumb.setAttribute('aria-hidden', 'true');
			row.appendChild(thumb);
			this.draw_alpha_thumb(thumb, channel);

			const name = document.createElement('button');
			name.type = 'button';
			name.className = 'channel_name';
			name.dataset.alpha = channel.id;
			name.dataset.alphaAction = 'load';
			name.textContent = channel.name;
			name.title = `${t('Load channel as selection')} (${t('double click renames')})`;
			row.appendChild(name);

			const replace = document.createElement('button');
			replace.type = 'button';
			replace.className = 'channel_select';
			replace.dataset.alpha = channel.id;
			replace.dataset.alphaAction = 'replace';
			replace.title = t('Replace with the current selection');
			replace.setAttribute('aria-label', `${channel.name}: ${t('Replace with the current selection')}`);
			replace.textContent = '\u21A7';
			row.appendChild(replace);

			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'channel_select';
			remove.dataset.alpha = channel.id;
			remove.dataset.alphaAction = 'delete';
			remove.title = t('Delete Channel');
			remove.setAttribute('aria-label', `${channel.name}: ${t('Delete Channel')}`);
			remove.textContent = '\u00D7';
			row.appendChild(remove);

			this.alpha_list.appendChild(row);
		}
	}

	/**
	 * @param {HTMLCanvasElement} thumb
	 * @param {object} channel
	 */
	draw_alpha_thumb(thumb, channel) {
		//a small picture is enough, the mask is decoded at a reduced size
		const scale = Math.min(1, 96 / Math.max(channel.width, channel.height));
		const width = Math.max(1, Math.round(channel.width * scale));
		const height = Math.max(1, Math.round(channel.height * scale));
		const mask = channel_to_mask(channel, width, height);
		if (!mask) {
			return;
		}
		const gray = document.createElement('canvas');
		gray.width = width;
		gray.height = height;
		const out = gray.getContext('2d').createImageData(width, height);
		for (let p = 0, i = 0; p < mask.data.length; p++, i += 4) {
			out.data[i] = out.data[i + 1] = out.data[i + 2] = mask.data[p];
			out.data[i + 3] = 255;
		}
		gray.getContext('2d').putImageData(out, 0, 0);
		this.draw_thumb(thumb, gray);
	}

	/**
	 * @param {object} view the new state of the view
	 */
	set_view(view) {
		this.view = view;
		this.update_state();
		this.apply();
	}

	/**
	 * Eyes and the highlighted row follow the state of the view
	 */
	update_state() {
		const solo = this.view.solo;
		Object.keys(this.rows).forEach((channel) => {
			const {row, eye, name} = this.rows[channel];
			const shown = solo == null ? !this.view.hidden.includes(channel) : solo == channel;
			eye.classList.toggle('off', COLOR_CHANNELS.includes(channel) && !shown);
			if (COLOR_CHANNELS.includes(channel)) {
				eye.setAttribute('aria-pressed', String(shown));
			}
			const current = (solo == null && channel == 'rgb') || solo == channel;
			row.classList.toggle('current', current);
			if (current) {
				name.setAttribute('aria-current', 'true');
			}
			else {
				name.removeAttribute('aria-current');
			}
		});
	}

	/**
	 * Puts the matrix of the view and the proof colors on the canvas as one CSS filter
	 */
	apply() {
		const canvas = document.getElementById('canvas_minipaint');
		if (!canvas) {
			return;
		}
		const matrix = view_matrix(this.view);
		if (matrix) {
			this.matrix_filter().setAttribute('values', matrix.join(' '));
		}
		canvas.style.filter = compose_filter([
			matrix ? 'url(#channel_view)' : '',
			config.proof ? `url(#proof_${config.proof})` : '',
		]);
	}

	/**
	 * @returns {Element} the feColorMatrix of the filter, created on first use
	 */
	matrix_filter() {
		if (this.matrix_node && this.matrix_node.isConnected) {
			return this.matrix_node;
		}
		const holder = document.createElementNS(SVG_NS, 'svg');
		holder.setAttribute('id', 'channel_filters');
		holder.setAttribute('width', '0');
		holder.setAttribute('height', '0');
		holder.setAttribute('aria-hidden', 'true');
		holder.style.position = 'absolute';
		const filter = document.createElementNS(SVG_NS, 'filter');
		filter.setAttribute('id', 'channel_view');
		filter.setAttribute('color-interpolation-filters', 'sRGB');
		const matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
		matrix.setAttribute('type', 'matrix');
		filter.appendChild(matrix);
		holder.appendChild(filter);
		document.body.appendChild(holder);
		this.matrix_node = matrix;
		return matrix;
	}

	/**
	 * The texts follow the language (the event that follows a change of the language also arrives here)
	 */
	update_texts() {
		const group = document.querySelector('#toggle_channels .channels_list');
		if (group) {
			group.setAttribute('aria-label', t('Channels'));
		}
		ROWS.forEach((definition) => {
			const entry = this.rows[definition.channel];
			if (!entry) {
				return;
			}
			entry.name.textContent = t(definition.label);
			entry.name.title = definition.channel == 'rgb' ? t('Show the whole picture') : t('Show only this channel');
			if (COLOR_CHANNELS.includes(definition.channel)) {
				entry.eye.title = t('Show / hide the channel in the view');
				entry.eye.setAttribute('aria-label', `${t(definition.label)}: ${t('Show / hide the channel in the view')}`);
			}
			const select = entry.row.querySelector('.channel_select');
			if (select) {
				select.title = t('Load channel as selection');
				select.setAttribute('aria-label', `${t(definition.label)}: ${t('Load channel as selection')}`);
			}
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
			this.render();
		}, 200);
	}

	/**
	 * The small pictures of the channels of the active layer
	 */
	render() {
		const block = document.getElementById('channels_base');
		const container = document.getElementById('toggle_channels');
		if (!block || !container || block.classList.contains('panel_hidden') || container.classList.contains('hidden')) {
			return;
		}
		this.render_alpha();
		const names = Object.keys(this.rows);
		names.forEach((channel) => {
			const thumb = this.rows[channel].thumb;
			thumb.getContext('2d').clearRect(0, 0, thumb.width, thumb.height);
		});
		if (!config.layer) {
			return;
		}
		let source;
		try {
			source = this.Base_layers.convert_layer_to_canvas();
		}
		catch {
			return;
		}
		if (!source || source.width < 1 || source.height < 1) {
			return;
		}
		//a small copy is enough for a thumbnail
		const scale = Math.min(1, 96 / Math.max(source.width, source.height));
		const small = document.createElement('canvas');
		small.width = Math.max(1, Math.round(source.width * scale));
		small.height = Math.max(1, Math.round(source.height * scale));
		const small_ctx = small.getContext('2d', {willReadFrequently: true});
		small_ctx.drawImage(source, 0, 0, small.width, small.height);
		const image = small_ctx.getImageData(0, 0, small.width, small.height);

		this.draw_thumb(this.rows.rgb.thumb, small);
		['red', 'green', 'blue', 'alpha'].forEach((channel) => {
			const mask = channel_mask(image, channel, false);
			const gray = document.createElement('canvas');
			gray.width = mask.width;
			gray.height = mask.height;
			const out = gray.getContext('2d').createImageData(mask.width, mask.height);
			for (let p = 0, i = 0; p < mask.data.length; p++, i += 4) {
				out.data[i] = out.data[i + 1] = out.data[i + 2] = mask.data[p];
				out.data[i + 3] = 255;
			}
			gray.getContext('2d').putImageData(out, 0, 0);
			this.draw_thumb(this.rows[channel].thumb, gray);
		});
	}

	/**
	 * @param {HTMLCanvasElement} thumb
	 * @param {HTMLCanvasElement} picture
	 */
	draw_thumb(thumb, picture) {
		const ctx = thumb.getContext('2d');
		const ratio = Math.min(thumb.width / picture.width, thumb.height / picture.height);
		const width = Math.max(1, Math.round(picture.width * ratio));
		const height = Math.max(1, Math.round(picture.height * ratio));
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(picture, Math.round((thumb.width - width) / 2), Math.round((thumb.height - height) / 2), width, height);
	}

	/**
	 * @returns {boolean} the view is not the plain picture
	 */
	is_filtered() {
		return !is_default_view(this.view);
	}
}

export default GUI_channels_class;
