import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';
import { export_as_json } from './../file/save-helpers.js';
import {
	add_snapshot, remove_snapshot, rename_snapshot, next_snapshot_name, clean_snapshot_name, valid_source, MAX_SNAPSHOTS,
} from './../../libs/history-snapshots.js';

let instance = null;

/**
 * Edit > History - list of the undo history; clicking a step jumps to the state after that step
 * (the steps after it stay available as redo, until a new action is done).
 */
class Edit_history_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Dialog = new Dialog_class();
		this.busy = false;
	}

	history() {
		this.Dialog.show({
			title: 'History',
			className: 'history',
			params: [],
			on_load: (params, popup) => {
				const list = document.createElement('div');
				list.className = 'history_list';
				list.style.maxHeight = '320px';
				list.style.overflowY = 'auto';
				list.style.minWidth = '260px';
				popup.el.querySelector('.dialog_content').appendChild(list);

				list.addEventListener('click', (event) => {
					if (this.handle_snapshot_click(event, list)) {
						return;
					}
					const item = event.target.closest('[data-step]');
					if (item) {
						this.go_to(parseInt(item.dataset.step), list);
					}
				});
				list.addEventListener('dblclick', (event) => {
					const row = event.target.closest('[data-snapshot-action="restore"]');
					if (row) {
						this.rename_snapshot_dialog(parseInt(row.dataset.snapshot, 10));
					}
				});
				this.render(list);
			},
		});
	}

	/**
	 * Edit > New Snapshot... - asks for a name and keeps the current state of the document as a snapshot
	 */
	new_snapshot() {
		this.Dialog.show({
			title: 'New Snapshot',
			params: [
				{name: 'name', title: 'Name:', value: next_snapshot_name(app.State.snapshots, t('Snapshot'))},
			],
			on_finish: (params) => {
				this.create_snapshot(params.name);
			},
		});
	}

	/**
	 * Keeps the whole document (project JSON) and its flattened picture (the source for the History Brush) under a
	 * name. Snapshots live only in the session and belong to the active document; they are not in the undo history.
	 *
	 * @param {string} [name] the default "Snapshot N" when empty
	 * @returns {object|null} the snapshot
	 */
	create_snapshot(name) {
		const state = app.State;
		let snapshot;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
			state.snapshot_counter++;
			snapshot = {
				id: state.snapshot_counter,
				name: clean_snapshot_name(name, next_snapshot_name(state.snapshots, t('Snapshot'))),
				json: export_as_json(),
				canvas,
			};
		}
		catch {
			alertify.error(t('The snapshot could not be created.'));
			return null;
		}
		const result = add_snapshot(state.snapshots, snapshot, MAX_SNAPSHOTS);
		state.snapshots = result.list;
		state.history_brush_source = valid_source(state.snapshots, state.history_brush_source);
		if (result.dropped.length) {
			alertify.warning(t('The oldest snapshot was removed (at most 20 are kept).'));
		}
		state.notify_history();
		return snapshot;
	}

	/**
	 * Puts the document back into the state of the snapshot as one undoable step (the steps of the history stay)
	 */
	async restore_snapshot(id) {
		const snapshot = app.State.snapshots.find((item) => item.id === id);
		if (!snapshot || this.busy) {
			return;
		}
		this.busy = true;
		try {
			const File_open_class = (await import('./../file/open.js')).default;
			await new File_open_class().load_json(snapshot.json, {
				action_id: 'restore_snapshot',
				description: 'Restore Snapshot',
				keep_zoom: true,
			});
		}
		catch {
			alertify.error(t('The snapshot could not be restored.'));
		}
		finally {
			this.busy = false;
			config.need_render = true;
		}
	}

	delete_snapshot(id) {
		const state = app.State;
		state.snapshots = remove_snapshot(state.snapshots, id);
		state.history_brush_source = valid_source(state.snapshots, state.history_brush_source);
		state.notify_history();
	}

	rename_snapshot_dialog(id) {
		const snapshot = app.State.snapshots.find((item) => item.id === id);
		if (!snapshot) {
			return;
		}
		this.Dialog.show({
			title: 'Rename Snapshot',
			params: [
				{name: 'name', title: 'Name:', value: snapshot.name},
			],
			on_finish: (params) => {
				app.State.snapshots = rename_snapshot(app.State.snapshots, id, params.name);
				app.State.notify_history();
			},
		});
	}

	/**
	 * The History Brush paints from the given snapshot; the same id again (or null) = from the state before
	 * the first change of the document
	 */
	set_brush_source(id) {
		const state = app.State;
		state.history_brush_source = state.history_brush_source === id ? null : valid_source(state.snapshots, id);
		state.notify_history();
	}

	/**
	 * The picture the History Brush paints back: the chosen snapshot, otherwise the original of the document
	 *
	 * @returns {{canvas: HTMLCanvasElement|null, snapshot: boolean}}
	 */
	get_brush_source() {
		const state = app.State;
		const snapshot = state.snapshots.find((item) => item.id === state.history_brush_source);
		if (snapshot) {
			return {canvas: snapshot.canvas, snapshot: true};
		}
		return {canvas: state.original_canvas, snapshot: false};
	}

	/**
	 * Clicks on the snapshot rows of a list made by render(); returns true when the click was handled
	 */
	handle_snapshot_click(event, list) {
		const target = event.target.closest('[data-snapshot-action]');
		if (!target || !list.contains(target)) {
			return false;
		}
		const id = parseInt(target.dataset.snapshot, 10);
		const action = target.dataset.snapshotAction;
		if (action == 'new') {
			if (event.altKey) {
				this.new_snapshot();
			}
			else {
				this.create_snapshot('');
			}
		}
		else if (action == 'restore') {
			this.restore_snapshot(id);
		}
		else if (action == 'delete') {
			this.delete_snapshot(id);
		}
		else if (action == 'source') {
			this.set_brush_source(id);
		}
		return true;
	}

	/**
	 * Names of the steps: step 0 is the state before the first action
	 *
	 * @returns {{step: number, name: string, active: boolean, undone: boolean}[]}
	 */
	/**
	 * File > Revert - goes back to the oldest step of the undo history (the state the history starts from); the
	 * steps stay available as redo, so Redo or the History panel brings the work back. Only as far as the history
	 * reaches (it keeps the last `action_history_max` steps).
	 */
	async revert() {
		if (app.State.action_history_index == 0) {
			alertify.warning(t('There is nothing to revert.'));
			return;
		}
		await this.go_to(0, null);
	}

	/**
	 * Edit > Purge > Undo History - forgets the steps that can be undone to free memory; the image stays as it is,
	 * the steps that can be redone are kept
	 */
	async purge() {
		const state = app.State;
		if (state.action_history_index == 0) {
			alertify.warning(t('There is no undo history to purge.'));
			return;
		}
		if (this.busy) {
			return;
		}
		this.busy = true;
		let failed = false;
		try {
			while (state.action_history_index > 0) {
				const action = state.action_history.shift();
				state.action_history_index--;
				try {
					await action.free();
				}
				catch {
					failed = true;
				}
			}
		}
		finally {
			this.busy = false;
			state.notify_history();
		}
		if (failed) {
			alertify.error(t('A problem occurred while removing undo history. It\'s suggested you save your work and refresh the page in order to free up memory.'));
		}
		else {
			alertify.success(t('Undo history purged.'));
		}
	}

	get_steps() {
		const state = app.State;
		const steps = [{step: 0, name: t('Initial state'), active: state.action_history_index == 0, undone: false}];
		state.action_history.forEach((action, i) => {
			steps.push({
				step: i + 1,
				name: t(action.action_description || action.action_id || 'Action'),
				active: state.action_history_index == i + 1,
				undone: i + 1 > state.action_history_index,
			});
		});
		return steps;
	}

	/**
	 * Rows of the snapshots (above the steps, as in Photoshop) and the New Snapshot button
	 */
	render_snapshots(list) {
		const state = app.State;
		for (const snapshot of state.snapshots) {
			const row = document.createElement('div');
			row.className = 'history_snapshot';

			const source = document.createElement('button');
			source.type = 'button';
			source.className = 'history_snapshot_source';
			source.dataset.snapshot = snapshot.id;
			source.dataset.snapshotAction = 'source';
			const pressed = state.history_brush_source === snapshot.id;
			source.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			source.title = t('Set the source for the History Brush');
			source.setAttribute('aria-label', `${t('Set the source for the History Brush')}: ${snapshot.name}`);
			source.textContent = pressed ? '\u25C9' : '\u25CB';

			const name = document.createElement('button');
			name.type = 'button';
			name.className = 'history_snapshot_name';
			name.dataset.snapshot = snapshot.id;
			name.dataset.snapshotAction = 'restore';
			name.title = t('Restore Snapshot');
			name.textContent = snapshot.name;

			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'history_snapshot_delete';
			remove.dataset.snapshot = snapshot.id;
			remove.dataset.snapshotAction = 'delete';
			remove.title = t('Delete Snapshot');
			remove.setAttribute('aria-label', `${t('Delete Snapshot')}: ${snapshot.name}`);
			remove.textContent = '\u00D7';

			row.append(source, name, remove);
			list.appendChild(row);
		}
		const create = document.createElement('button');
		create.type = 'button';
		create.className = 'history_snapshot_new';
		create.dataset.snapshotAction = 'new';
		create.textContent = `+ ${t('New Snapshot')}`;
		create.title = t('Alt + click asks for a name');
		list.appendChild(create);
	}

	render(list, scroll = true) {
		list.innerHTML = '';
		this.render_snapshots(list);
		this.get_steps().forEach((step) => {
			const item = document.createElement('button');
			item.type = 'button';
			item.dataset.step = step.step;
			item.textContent = step.name;
			item.style.display = 'block';
			item.style.width = '100%';
			item.style.textAlign = 'left';
			item.style.padding = '4px 8px';
			item.style.opacity = step.undone ? '0.45' : '1';
			item.style.fontWeight = step.active ? 'bold' : 'normal';
			item.setAttribute('aria-current', step.active ? 'true' : 'false');
			list.appendChild(item);
		});
		const active = list.querySelector('[aria-current="true"]');
		if (scroll && active && active.scrollIntoView) {
			active.scrollIntoView({block: 'nearest'});
		}
	}

	/**
	 * Undoes or redoes actions until the history is at the given step
	 */
	async go_to(step, list) {
		if (this.busy) {
			return;
		}
		this.busy = true;
		config.freeze_render = true;
		try {
			const state = app.State;
			step = Math.max(0, Math.min(step, state.action_history.length));
			while (state.action_history_index > step) {
				await state.undo_action();
			}
			while (state.action_history_index < step) {
				await state.redo_action();
			}
		}
		catch {
			alertify.error(t('History step could not be applied.'));
		}
		finally {
			config.freeze_render = false;
			config.need_render = true;
			this.busy = false;
			if (list && list.isConnected) {
				this.render(list);
			}
		}
	}

}

export default Edit_history_class;
