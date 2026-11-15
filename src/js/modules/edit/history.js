import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

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
					const item = event.target.closest('[data-step]');
					if (item) {
						this.go_to(parseInt(item.dataset.step), list);
					}
				});
				this.render(list);
			},
		});
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

	render(list, scroll = true) {
		list.innerHTML = '';
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
