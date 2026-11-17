import config from './../../config.js';
import { trace_path, path_bounds } from './../../libs/document-paths.js';
import { t } from './../../modules/tools/translate.js';

const THUMB_WIDTH = 40;
const THUMB_HEIGHT = 30;

//the buttons at the bottom of the panel: [command of modules/edit/paths.js, title, SVG content]
const BUTTONS = [
	['fill_path', 'Fill Path with Foreground Color', '<path d="M8 2.5c2.5 2 4.5 4.5 4.5 7a4.5 4.5 0 0 1-9 0c0-2.5 2-5 4.5-7z" fill="currentColor"/>'],
	['stroke_path', 'Stroke Path with Brush', '<circle cx="8" cy="8" r="5"/>'],
	['load_selection', 'Load Path as Selection', '<circle cx="8" cy="8" r="5" stroke-dasharray="2 2.4"/>'],
	['make_work_path', 'Make Work Path from Selection', '<rect x="3" y="3" width="10" height="10" stroke-dasharray="2 2.4"/><rect x="1.5" y="1.5" width="3" height="3" fill="currentColor"/><rect x="11.5" y="11.5" width="3" height="3" fill="currentColor"/>'],
	['add_vector_mask', 'Add Vector Mask', '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M5 11c0-4 2-6 6-6"/>'],
	['new_path', 'New Path', '<path d="M3.5 2.5h6l3 3v8h-9z"/><path d="M8 7v4M6 9h4"/>'],
	['delete_path', 'Delete Path', '<path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9"/>'],
];

/**
 * Paths panel (Photoshop): the paths of the document (config.paths) with a thumbnail and the name. A click selects a
 * path (it is drawn on the canvas), a double click renames it, the buttons fill / stroke it, turn it into a selection
 * or a vector mask and back. The commands are in modules/edit/paths.js, which also owns the selected path.
 */
class GUI_paths_class {

	/**
	 * @param {object} owner modules/edit/paths.js
	 */
	constructor(owner) {
		this.owner = owner;
		this.list = null;
		this.buttons = [];
		this.pending = false;
		this.signature = '';
	}

	render_main() {
		const container = document.getElementById('toggle_paths');
		if (!container || this.list) {
			return;
		}
		this.list = document.createElement('div');
		this.list.className = 'paths_list';
		this.list.setAttribute('role', 'listbox');
		container.appendChild(this.list);

		const bar = document.createElement('div');
		bar.className = 'paths_buttons';
		bar.setAttribute('role', 'toolbar');
		BUTTONS.forEach(([command, title, shape]) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'paths_button';
			button.dataset.command = command;
			button.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
			button.addEventListener('click', () => this.owner[command]());
			bar.appendChild(button);
			this.buttons.push({button, title});
		});
		container.appendChild(bar);

		const header = document.querySelector('[data-target="toggle_paths"]');
		if (header) {
			//the panel is drawn when it is opened (the base GUI toggles it first)
			header.addEventListener('click', () => setTimeout(() => this.render(true), 0));
		}
		document.addEventListener('minipaint:history', () => this.schedule());
		this.render(true);
	}

	schedule() {
		if (this.pending) {
			return;
		}
		this.pending = true;
		setTimeout(() => {
			this.pending = false;
			this.render();
		}, 100);
	}

	/**
	 * @returns {boolean} the panel can be seen
	 */
	is_open() {
		const block = document.getElementById('paths_base');
		const container = document.getElementById('toggle_paths');
		return !!block && !!container && !block.classList.contains('panel_hidden') && !container.classList.contains('hidden');
	}

	/**
	 * @param {boolean} [force] draw also when nothing changed
	 */
	render(force) {
		if (!this.list) {
			return;
		}
		this.update_texts();
		if (!this.is_open()) {
			return;
		}
		const paths = Array.isArray(config.paths) ? config.paths : [];
		const selected = this.owner.get_selected();
		const signature = `${config.LANG}|${config.WIDTH}x${config.HEIGHT}|${selected ? selected.id : ''}|${paths.map((p) => `${p.id}:${p.name}:${p.anchors.length}`).join(',')}`;
		if (!force && signature == this.signature && this.list.childElementCount == paths.length) {
			//the same paths, only the shapes may differ
			this.draw_thumbs(paths);
			return;
		}
		this.signature = signature;
		this.list.textContent = '';
		if (paths.length == 0) {
			const empty = document.createElement('div');
			empty.className = 'paths_empty';
			empty.textContent = t('No paths. Draw one with the Pen in Path mode.');
			this.list.appendChild(empty);
		}
		paths.forEach((path) => {
			const row = document.createElement('div');
			row.className = 'path_row';
			row.dataset.id = String(path.id);
			const is_selected = selected != null && selected.id == path.id;
			row.classList.toggle('current', is_selected);

			const thumb = document.createElement('canvas');
			thumb.width = THUMB_WIDTH;
			thumb.height = THUMB_HEIGHT;
			thumb.className = 'path_thumb';
			thumb.setAttribute('aria-hidden', 'true');
			row.appendChild(thumb);

			const name = document.createElement('button');
			name.type = 'button';
			name.className = 'path_name';
			name.setAttribute('role', 'option');
			name.setAttribute('aria-selected', String(is_selected));
			name.textContent = path.name;
			name.title = t('Double click to rename');
			name.addEventListener('click', () => this.owner.select(is_selected ? null : path.id));
			name.addEventListener('dblclick', () => this.start_rename(row, name, path));
			name.addEventListener('keydown', (event) => {
				if (event.key == 'F2' || (event.key == 'Enter' && event.altKey)) {
					event.preventDefault();
					this.start_rename(row, name, path);
				}
			});
			row.appendChild(name);
			this.list.appendChild(row);
		});
		this.draw_thumbs(paths);
	}

	/**
	 * @param {object[]} paths
	 */
	draw_thumbs(paths) {
		const rows = this.list.querySelectorAll('.path_row');
		rows.forEach((row, index) => {
			const path = paths[index];
			const thumb = row.querySelector('canvas');
			if (!path || !thumb) {
				return;
			}
			const ctx = thumb.getContext('2d');
			ctx.clearRect(0, 0, thumb.width, thumb.height);
			const width = Math.max(1, config.WIDTH || 1);
			const height = Math.max(1, config.HEIGHT || 1);
			const scale = Math.min(thumb.width / width, thumb.height / height);
			ctx.save();
			ctx.translate((thumb.width - width * scale) / 2, (thumb.height - height * scale) / 2);
			ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.fillRect(0, 0, width * scale, height * scale);
			ctx.scale(scale, scale);
			if (path.anchors.length > 0 && path_bounds(path.anchors, path.closed)) {
				ctx.beginPath();
				trace_path(ctx, path.anchors, path.closed);
				if (path.closed) {
					ctx.fillStyle = 'rgba(90, 90, 90, 0.8)';
					ctx.fill();
				}
				ctx.lineWidth = 1.5 / scale;
				ctx.strokeStyle = '#333333';
				ctx.stroke();
			}
			ctx.restore();
		});
	}

	/**
	 * Renaming in the row: Enter keeps the new name, Esc cancels
	 */
	start_rename(row, name, path) {
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'path_rename';
		input.value = path.name;
		input.maxLength = 100;
		input.setAttribute('aria-label', t('Path name'));
		row.replaceChild(input, name);
		input.focus();
		input.select();
		let done = false;
		const finish = (save) => {
			if (done) {
				return;
			}
			done = true;
			if (save && input.value.trim() != '' && input.value.trim() != path.name) {
				this.owner.rename_path(path.id, input.value.trim());
			}
			else {
				this.render(true);
			}
		};
		input.addEventListener('keydown', (event) => {
			event.stopPropagation();
			if (event.key == 'Enter') {
				finish(true);
			}
			else if (event.key == 'Escape') {
				finish(false);
			}
		});
		input.addEventListener('blur', () => finish(true));
	}

	update_texts() {
		if (this.list) {
			this.list.setAttribute('aria-label', t('Paths'));
		}
		this.buttons.forEach(({button, title}) => {
			button.title = t(title);
			button.setAttribute('aria-label', t(title));
		});
	}
}

export default GUI_paths_class;
