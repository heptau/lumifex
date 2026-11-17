import config from './../config.js';
import { Base_action } from './base.js';

/**
 * Replaces the list of document paths (the Paths panel, config.paths) - every change of a path goes through it, so it
 * can be undone. The lists are never changed in place, the old one is kept for the undo.
 */
export class Set_paths_action extends Base_action {
	/**
	 * @param {object[]} paths the new list ({id, name, closed, anchors})
	 * @param {string} [description]
	 */
	constructor(paths, description) {
		super('set_paths', description || 'Paths');
		this.paths = paths;
		this.old_paths = null;
	}

	async do() {
		super.do();
		this.old_paths = Array.isArray(config.paths) ? config.paths : [];
		config.paths = this.paths;
		config.need_render = true;
	}

	async undo() {
		super.undo();
		config.paths = this.old_paths || [];
		this.old_paths = null;
		config.need_render = true;
	}

	free() {
		this.paths = null;
		this.old_paths = null;
	}
}
