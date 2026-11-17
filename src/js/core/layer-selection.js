import config from './../config.js';
import { clean_selection } from './../libs/layer-multi.js';

/**
 * The layers selected in the Layers panel (the active layer and the ones added with Ctrl/Cmd or Shift + click), kept
 * in `config.layer_selection`. The selection is not part of the history, as in Photoshop.
 *
 * @returns {number[]} ids, the active layer always among them
 */
export function selected_layer_ids() {
	const active = config.layer ? config.layer.id : null;
	const ids = clean_selection(config.layer_selection || [], active, (config.layers || []).map((layer) => layer.id));
	config.layer_selection = ids;
	return ids;
}

/**
 * @returns {object[]} the selected layers from the bottom to the top
 */
export function selected_layers() {
	const ids = selected_layer_ids();
	return (config.layers || []).filter((layer) => ids.includes(layer.id)).sort((a, b) => a.order - b.order);
}

/**
 * @returns {boolean} more than one layer is selected
 */
export function has_multi_selection() {
	return selected_layer_ids().length > 1;
}

/**
 * @param {number[]} ids
 */
export function set_layer_selection(ids) {
	config.layer_selection = ids.slice();
}
