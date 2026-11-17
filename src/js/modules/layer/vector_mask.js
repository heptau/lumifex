import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Edit_paths_class from './../edit/paths.js';
import { create_mask, polygon_mask, invert_mask, resize_mask } from './../../libs/selection-mask.js';
import { flatten_path } from './../../libs/pen-path.js';
import { serialize_layer_mask, deserialize_layer_mask } from './../../libs/layer-mask.js';
import { clean_vector_mask, vector_mask_from_path, vector_mask_anchors_for_size, multiply_masks } from './../../libs/document-paths.js';
import { t } from '../tools/translate.js';

let instance = null;

/**
 * Layer > Vector Mask (Photoshop): a path that cuts the layer, sharp at any size. It is stored in the layer as
 * `vector_mask = {closed, anchors, width, height, invert}` in the coordinates of the layer (see libs/document-paths.js),
 * so it moves, stretches and turns with the layer; `vector_mask_enabled === false` turns it off. Base_layers.render_object
 * clips the layer with it (together with the layer mask). Every change is one Update_layer_action.
 */
class Layer_vector_mask_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
		if (typeof document != 'undefined') {
			//the "Vector Mask" row of the Layers panel: a click on the name turns it off / on, the cross deletes it
			document.addEventListener('click', (event) => {
				const target = event.target instanceof Element ? event.target.closest('#vector_mask_toggle, #delete_vector_mask') : null;
				if (target == null || !target.closest('#layers_base')) {
					return;
				}
				const id = parseInt(target.getAttribute('data-pid'), 10);
				if (target.id == 'vector_mask_toggle') {
					this.toggle(id);
				}
				else {
					this.remove(id);
				}
			});
		}
	}

	/**
	 * @param {number} [id]
	 * @returns {object|null} the layer that can get a vector mask
	 */
	get_layer(id) {
		const layer = id == null || isNaN(id) ? config.layer : app.Layers.get_layer(id);
		if (layer == null || layer.type == null || !(layer.width > 0) || !(layer.height > 0)) {
			alertify.error(t('Layer is empty.'));
			return null;
		}
		return layer;
	}

	/**
	 * @param {object} layer
	 * @param {object} settings
	 * @param {string} name of the history step
	 */
	update(layer, settings, name) {
		return app.State.do_action(
			new app.Actions.Bundle_action('vector_mask', name, [
				//the Layers panel shows the "Vector Mask" row (also after an undo)
				new app.Actions.Refresh_layers_gui_action('undo'),
				new app.Actions.Update_layer_action(layer.id, settings),
				new app.Actions.Refresh_layers_gui_action('do'),
			])
		);
	}

	/**
	 * Layer > Vector Mask > Reveal All - an empty mask that shows everything (a path can be put in later)
	 */
	reveal_all() {
		const layer = this.get_layer();
		if (layer) {
			return this.update(layer, {vector_mask: {closed: true, anchors: [], width: layer.width, height: layer.height, invert: false}, vector_mask_enabled: true}, 'Reveal All');
		}
	}

	/**
	 * Layer > Vector Mask > Hide All
	 */
	hide_all() {
		const layer = this.get_layer();
		if (layer) {
			return this.update(layer, {vector_mask: {closed: true, anchors: [], width: layer.width, height: layer.height, invert: true}, vector_mask_enabled: true}, 'Hide All');
		}
	}

	/**
	 * Layer > Vector Mask > Current Path - the path selected in the Paths panel shows the layer inside of it
	 */
	current_path() {
		const layer = this.get_layer();
		if (layer == null) {
			return;
		}
		const path = new Edit_paths_class().get_selected();
		if (path == null) {
			alertify.error(t('Select a path in the Paths panel first.'));
			return;
		}
		if (path.anchors.length < 3) {
			alertify.error(t('A path needs at least 3 points.'));
			return;
		}
		return this.update(layer, {vector_mask: vector_mask_from_path(path.anchors, layer), vector_mask_enabled: true}, 'Vector Mask');
	}

	/**
	 * Layer > Vector Mask > Delete
	 *
	 * @param {number} [id]
	 */
	remove(id) {
		const layer = this.get_layer(id);
		if (layer == null) {
			return;
		}
		if (!layer.vector_mask) {
			alertify.error(t('The layer has no vector mask.'));
			return;
		}
		return this.update(layer, {vector_mask: null}, 'Delete Vector Mask');
	}

	/**
	 * Layer > Vector Mask > Disable / Enable
	 *
	 * @param {number} [id]
	 */
	toggle(id) {
		const layer = this.get_layer(id);
		if (layer == null) {
			return;
		}
		if (!layer.vector_mask) {
			alertify.error(t('The layer has no vector mask.'));
			return;
		}
		return this.update(layer, {vector_mask_enabled: layer.vector_mask_enabled === false}, 'Toggle Vector Mask');
	}

	/**
	 * Layer > Vector Mask > Rasterize - the path becomes (a part of) the layer mask in pixels
	 */
	rasterize() {
		const layer = this.get_layer();
		if (layer == null) {
			return;
		}
		const vector = clean_vector_mask(layer.vector_mask);
		if (vector == null) {
			alertify.error(t('The layer has no vector mask.'));
			return;
		}
		const width = Math.max(1, Math.round(layer.width));
		const height = Math.max(1, Math.round(layer.height));
		let mask;
		if (vector.anchors.length < 2) {
			mask = create_mask(width, height, vector.invert ? 0 : 255);
		}
		else {
			mask = polygon_mask(flatten_path(vector_mask_anchors_for_size(vector, width, height), true, 32), width, height);
			if (vector.invert) {
				mask = invert_mask(mask);
			}
		}
		//an existing layer mask keeps hiding what it hid
		const existing = layer.mask && layer.mask_enabled !== false ? deserialize_layer_mask(layer.mask) : null;
		if (existing) {
			const resized = resize_mask(existing, width, height);
			mask = {width, height, data: multiply_masks(mask.data, resized.data)};
		}
		return this.update(layer, {
			mask: serialize_layer_mask(mask), mask_enabled: true, vector_mask: null,
		}, 'Rasterize Vector Mask');
	}
}

export default Layer_vector_mask_class;
