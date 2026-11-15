import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Dialog_class from './../../libs/popup.js';
import { scale_style_params } from './../../libs/layer-styles.js';
import { t } from '../tools/translate.js';

/**
 * Layer > Layer Style > Copy / Paste Layer Style - the live effects of a layer (shadow, glow, stroke, overlays...)
 * go to another layer; the effects the other layer had are replaced.
 */
class Layer_style_class {

	constructor() {
		this.copied = null;
	}

	copy() {
		const layer = config.layer;
		if (layer == null || !layer.filters || layer.filters.length == 0) {
			alertify.warning(t('This layer has no layer style.'));
			return;
		}
		this.copied = JSON.parse(JSON.stringify(layer.filters.map((filter) => ({name: filter.name, params: filter.params}))));
		alertify.success(t('Layer style copied.'));
	}

	/**
	 * Layer > Layer Style > Clear Layer Style - removes the live effects (shadows, glows, strokes, overlays, CSS
	 * filters) in one undo step; smart filters stay, they have their own commands
	 */
	clear() {
		const layer = config.layer;
		const styles = layer && layer.filters ? layer.filters.filter((filter) => filter.name != 'smart') : [];
		if (styles.length == 0) {
			alertify.warning(t('This layer has no layer style.'));
			return;
		}
		const actions = styles.map((filter) => new app.Actions.Delete_layer_filter_action(layer.id, filter.id));
		return app.State.do_action(
			new app.Actions.Bundle_action('clear_layer_style', 'Clear Layer Style', actions)
		);
	}

	/**
	 * Layer > Layer Style > Hide / Show All Effects - turns the drawing of the styles off and on without losing them
	 * (smart filters are not affected); one undo step
	 */
	toggle_effects() {
		const layer = config.layer;
		const has_styles = layer && layer.filters && layer.filters.some((filter) => filter.name != 'smart');
		if (!has_styles) {
			alertify.warning(t('This layer has no layer style.'));
			return;
		}
		return app.State.do_action(
			new app.Actions.Update_layer_action(layer.id, {effects_hidden: !layer.effects_hidden})
		);
	}

	/**
	 * Layer > Layer Style > Scale Effects - multiplies the pixel sizes of the styles (offsets, radii, widths) by a
	 * percentage, for example after the layer was resized; one undo step
	 */
	scale() {
		const layer = config.layer;
		const styles = layer && layer.filters ? layer.filters.filter((filter) => scale_style_params(filter.name, filter.params, 100)) : [];
		if (styles.length == 0) {
			alertify.warning(t('This layer has no layer style.'));
			return;
		}
		new Dialog_class().show({
			title: 'Scale Effects',
			params: [
				{name: 'percent', title: 'Scale:', value: 100, range: [1, 1000]},
			],
			on_finish: (params) => {
				//a new array through Update_layer_action: undo restores the old one (Add_layer_filter_action's undo only pops the last filter)
				const filters = layer.filters.map((filter) => {
					const scaled = scale_style_params(filter.name, filter.params, params.percent);
					return scaled ? {...filter, params: scaled} : filter;
				});
				return app.State.do_action(
					new app.Actions.Update_layer_action(layer.id, {filters})
				);
			},
		});
	}

	paste() {
		const layer = config.layer;
		if (this.copied == null) {
			alertify.warning(t('Copy a layer style first.'));
			return;
		}
		if (layer == null || layer.type == null) {
			alertify.error(t('Layer is empty.'));
			return;
		}
		const actions = (layer.filters || []).map((filter) => new app.Actions.Delete_layer_filter_action(layer.id, filter.id));
		this.copied.forEach((filter) => {
			actions.push(new app.Actions.Add_layer_filter_action(layer.id, filter.name, JSON.parse(JSON.stringify(filter.params))));
		});
		return app.State.do_action(
			new app.Actions.Bundle_action('paste_layer_style', 'Paste Layer Style', actions)
		);
	}
}

export default Layer_style_class;
