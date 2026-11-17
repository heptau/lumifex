import config from './../config.js';
import { Base_action } from './base.js';

/**
 * Replaces the list of alpha channels of the document (the Channels panel, config.alpha_channels) - every change
 * goes through it, so it can be undone. The lists are never changed in place, the old one is kept for the undo.
 */
export class Set_alpha_channels_action extends Base_action {
	/**
	 * @param {object[]} channels the new list ({id, name, width, height, values, counts})
	 * @param {string} [description]
	 */
	constructor(channels, description) {
		super('set_alpha_channels', description || 'Channels');
		this.channels = channels;
		this.old_channels = null;
	}

	async do() {
		super.do();
		this.old_channels = Array.isArray(config.alpha_channels) ? config.alpha_channels : [];
		config.alpha_channels = this.channels;
	}

	async undo() {
		super.undo();
		config.alpha_channels = this.old_channels || [];
		this.old_channels = null;
	}

	free() {
		this.channels = null;
		this.old_channels = null;
	}
}
