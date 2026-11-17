import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { capture_comp, comp_changes, step_comp, snapshot_layers, MAX_COMPS } from './../../libs/layer-comps.js';
import { t } from '../tools/translate.js';

/**
 * Layer > Layer Comps (Photoshop): snapshots of the visibility, position and appearance of the layers, saved in the
 * document (`config.layer_comps`, project JSON `info.layer_comps`). Applying a comp is one undo step; creating,
 * updating and deleting comps is not part of the history (like guides).
 */
class Layer_comps_class {

	constructor() {
		this.Dialog = new Dialog_class();
	}

	comps() {
		if (!Array.isArray(config.layer_comps)) {
			config.layer_comps = [];
		}
		return config.layer_comps;
	}

	/**
	 * Layer > Layer Comps > New Layer Comp…
	 */
	new_comp() {
		const comps = this.comps();
		if (comps.length >= MAX_COMPS) {
			alertify.error(t('Too many layer comps.'));
			return;
		}
		this.Dialog.show({
			title: 'New Layer Comp',
			params: [
				{name: 'name', title: 'Name:', value: `${t('Layer Comp')} ${comps.length + 1}`},
				{name: 'visibility', title: 'Visibility', value: true},
				{name: 'position', title: 'Position', value: true},
				{name: 'appearance', title: 'Appearance (Layer Style)', value: true},
				{name: 'comment', title: 'Comment:', value: ''},
			],
			on_finish: (params) => {
				const comp = capture_comp(comps, config.layers, params.name, {
					visibility: params.visibility === true,
					position: params.position === true,
					appearance: params.appearance === true,
				}, params.comment);
				comps.push(comp);
				config.layer_comp_current = comp.id;
				alertify.success(`${t('Layer comp saved:')} ${comp.name}`);
			},
		});
	}

	/**
	 * Layer > Layer Comps > Apply Layer Comp… - a list of the comps, the choice is shown right away
	 */
	apply_comp() {
		const comps = this.comps();
		if (!comps.length) {
			alertify.warning(t('There are no layer comps yet.'));
			return;
		}
		const names = comps.map((comp, index) => `${index + 1}. ${comp.name}`);
		const current = comps.findIndex((comp) => comp.id === config.layer_comp_current);
		this.Dialog.show({
			title: 'Apply Layer Comp',
			params: [
				{name: 'comp', title: 'Layer comp:', values: names, value: names[Math.max(0, current)]},
			],
			on_finish: (params) => {
				const comp = comps[names.indexOf(params.comp)];
				if (comp) {
					this.apply(comp);
				}
			},
		});
	}

	previous() {
		this.apply(step_comp(this.comps(), config.layer_comp_current, -1));
	}

	next() {
		this.apply(step_comp(this.comps(), config.layer_comp_current, 1));
	}

	/**
	 * Layer > Layer Comps > Update Layer Comp - the last applied comp takes the current state
	 */
	update_comp() {
		const comp = this.comps().find((item) => item.id === config.layer_comp_current);
		if (!comp) {
			alertify.warning(t('Apply a layer comp first.'));
			return;
		}
		comp.layers = snapshot_layers(config.layers, comp.options);
		alertify.success(`${t('Layer comp saved:')} ${comp.name}`);
	}

	/**
	 * Layer > Layer Comps > Delete Layer Comp…
	 */
	delete_comp() {
		const comps = this.comps();
		if (!comps.length) {
			alertify.warning(t('There are no layer comps yet.'));
			return;
		}
		const names = comps.map((comp, index) => `${index + 1}. ${comp.name}`);
		this.Dialog.show({
			title: 'Delete Layer Comp',
			params: [
				{name: 'comp', title: 'Layer comp:', values: names, value: names[0]},
			],
			on_finish: (params) => {
				const index = names.indexOf(params.comp);
				if (index >= 0) {
					const [removed] = comps.splice(index, 1);
					if (removed && removed.id === config.layer_comp_current) {
						config.layer_comp_current = null;
					}
				}
			},
		});
	}

	apply(comp) {
		if (!comp) {
			alertify.warning(t('There are no layer comps yet.'));
			return;
		}
		config.layer_comp_current = comp.id;
		//a locked layer keeps its place (its other properties may change, as the lock allows)
		const changes = comp_changes(config.layers, comp).map((change) => {
			const layer = app.Layers.get_layer(change.id);
			if (layer && layer.locked === true) {
				delete change.settings.x;
				delete change.settings.y;
			}
			return change;
		}).filter((change) => Object.keys(change.settings).length > 0);
		if (!changes.length) {
			alertify.success(comp.name);
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('apply_layer_comp', 'Apply Layer Comp', changes.map((change) => {
				return new app.Actions.Update_layer_action(change.id, change.settings);
			}))
		);
		alertify.success(comp.name);
	}
}

export default Layer_comps_class;
