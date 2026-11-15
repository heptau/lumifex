import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { SMART_FILTERS, is_smart_filter, is_smart_entry, default_smart_settings, clean_smart_settings, make_smart_filter } from './../../libs/smart-filters.js';
import { t } from '../tools/translate.js';
import Edit_selection_class from './../edit/selection.js';
import { serialize_layer_mask, deserialize_layer_mask, layer_mask_from_selection, layer_mask_to_selection, shape_layer_mask } from './../../libs/layer-mask.js';
import { invert_mask } from './../../libs/selection-mask.js';

/**
 * Layer > Smart Filter > ... A smart filter is a pixel filter kept on the layer with its settings (it is not baked
 * into the picture), so it can be edited (a click on its name in the Layers panel), switched off or deleted later.
 * The undo steps go through Update_layer_action, which swaps the whole list of filters.
 */
class Layer_smart_filter_class {

	/**
	 * Adds a smart filter to the active layer and opens its settings
	 *
	 * @param {string} key one of SMART_FILTERS
	 */
	async add(key) {
		const layer = config.layer;
		if (!is_smart_filter(key) || !this.can_use(layer)) {
			return;
		}
		const filter = make_smart_filter(key, default_smart_settings(key));
		if (SMART_FILTERS[key].params.length == 0) {
			return this.save(layer, (layer.filters || []).concat([filter]));
		}
		this.open_dialog(layer, filter, true);
	}

	/**
	 * Opens the settings of a smart filter of the active layer
	 *
	 * @param {number|string} filter_id
	 */
	edit(filter_id) {
		const layer = config.layer;
		const filter = layer && (layer.filters || []).find((item) => is_smart_entry(item) && String(item.id) === String(filter_id));
		if (!filter || !is_smart_filter(filter.params.key)) {
			alertify.warning(t('Select a layer with a smart filter first.'));
			return;
		}
		if (SMART_FILTERS[filter.params.key].params.length == 0) {
			return;
		}
		this.open_dialog(layer, filter, false);
	}

	/**
	 * Switches a smart filter on or off (one undo step)
	 *
	 * @param {number|string} filter_id
	 * @param {number|string} [layer_id] the layer of the filter, the active one by default
	 */
	toggle(filter_id, layer_id) {
		const layer = layer_id === undefined ? config.layer : app.Layers.get_layer(parseInt(String(layer_id)));
		if (!layer) {
			return;
		}
		const filters = (layer.filters || []).map((item) => {
			if (is_smart_entry(item) && String(item.id) === String(filter_id)) {
				return make_smart_filter(item.params.key, item.params.settings, item.id, item.params.enabled === false);
			}
			return item;
		});
		return this.save(layer, filters);
	}

	/**
	 * Layer > Smart Filter > Filter Mask from Selection: the smart filters of the layer apply only to the selected
	 * part (soft edges give a soft transition); the rest of the layer keeps its original look
	 */
	mask_from_selection() {
		const layer = config.layer;
		if (!this.can_use(layer)) {
			return;
		}
		if (layer.rotate) {
			alertify.error(t('Rotate is not supported on this type of object. Convert to raster?'));
			return;
		}
		const current = new Edit_selection_class().get_mask();
		if (current == null) {
			alertify.error(t('Empty selection'));
			return;
		}
		return this.save_mask(layer, {smart_mask: serialize_layer_mask(layer_mask_from_selection(current.mask, layer)), smart_mask_enabled: true, smart_mask_density: 100, smart_mask_feather: 0});
	}

	/**
	 * Layer > Smart Filter > Filter Mask to Selection: the part where the filters apply (with the Density and
	 * Feather of the mask) becomes the selection
	 */
	mask_to_selection() {
		const layer = config.layer;
		const mask = this.stored_mask(layer);
		if (mask) {
			const shaped = shape_layer_mask(mask, layer.smart_mask_density, layer.smart_mask_feather);
			return new Edit_selection_class().set_mask(layer_mask_to_selection(shaped, layer, config.WIDTH, config.HEIGHT), true);
		}
	}

	/**
	 * Layer > Smart Filter > Invert Filter Mask
	 */
	mask_invert() {
		const layer = config.layer;
		const mask = this.stored_mask(layer);
		if (mask) {
			return this.save_mask(layer, {smart_mask: serialize_layer_mask(invert_mask(mask)), smart_mask_enabled: true});
		}
	}

	/**
	 * Layer > Smart Filter > Disable / Enable Filter Mask
	 *
	 * @param {number|string} [layer_id] the layer, the active one by default
	 */
	mask_toggle(layer_id) {
		const layer = layer_id === undefined ? config.layer : app.Layers.get_layer(parseInt(String(layer_id)));
		if (this.stored_mask(layer)) {
			return this.save_mask(layer, {smart_mask_enabled: layer.smart_mask_enabled === false});
		}
	}

	/**
	 * Layer > Smart Filter > Delete Filter Mask
	 *
	 * @param {number|string} [layer_id] the layer, the active one by default
	 */
	mask_remove(layer_id) {
		const layer = layer_id === undefined ? config.layer : app.Layers.get_layer(parseInt(String(layer_id)));
		if (this.stored_mask(layer)) {
			return this.save_mask(layer, {smart_mask: null, smart_mask_enabled: true, smart_mask_density: 100, smart_mask_feather: 0});
		}
	}

	stored_mask(layer) {
		const mask = layer ? deserialize_layer_mask(layer.smart_mask) : null;
		if (!mask) {
			alertify.error(t('This layer has no filter mask.'));
		}
		return mask;
	}

	save_mask(layer, settings) {
		return app.State.do_action(
			new app.Actions.Bundle_action('smart_filter_mask', 'Filter Mask', [
				new app.Actions.Update_layer_action(layer.id, settings),
			])
		);
	}

	can_use(layer) {
		if (layer == null || layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return false;
		}
		return true;
	}

	/**
	 * @param {object} layer
	 * @param {object[]} filters the new list (a new array, not the changed old one)
	 */
	save(layer, filters) {
		return app.State.do_action(
			new app.Actions.Bundle_action('smart_filter', 'Smart Filter', [
				new app.Actions.Update_layer_action(layer.id, {filters}),
			])
		);
	}

	/**
	 * The dialog changes the filter list of the layer while it is open (so the picture shows the result);
	 * Cancel puts it back.
	 */
	open_dialog(layer, filter, is_new) {
		const key = filter.params.key;
		const definition = SMART_FILTERS[key];
		const original = layer.filters || [];
		const current = clean_smart_settings(key, filter.params.settings);
		const build = (values) => {
			const next = make_smart_filter(key, values, filter.id, filter.params.enabled !== false);
			return is_new ? original.concat([next]) : original.map((item) => (item === filter ? next : item));
		};

		new Dialog_class().show({
			title: definition.title,
			params: definition.params.map((param) => (param.name ? Object.assign({}, param, {value: current[param.name]}) : param)),
			on_change: (values) => {
				layer.filters = build(values);
				config.need_render = true;
			},
			on_finish: (values) => {
				layer.filters = original;
				return this.save(layer, build(values));
			},
			on_cancel: () => {
				layer.filters = original;
				config.need_render = true;
			},
		});
	}
}

export default Layer_smart_filter_class;
