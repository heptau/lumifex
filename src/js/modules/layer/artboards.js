import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Edit_selection_class from './../edit/selection.js';
import Tools_settings_class from './../tools/settings.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { build_zip } from './../../libs/zip.js';
import { save_blob } from './../../libs/file-save.js';
import { mask_bounds } from './../../libs/selection-mask.js';
import { ARTBOARD_PRESETS, MAX_ARTBOARDS, add_artboard, next_artboard_place, canvas_for_artboards, artboard_file_names } from './../../libs/artboards.js';
import { t } from '../tools/translate.js';

/**
 * Layer > Artboards (Photoshop, simplified): named rectangles of the document (`config.artboards`, project JSON
 * `info.artboards`) drawn as frames with names; File > Export > Artboards to Files saves each one as a PNG in a ZIP.
 * Every change is one undo step (Update_config_action); a new artboard that does not fit makes the canvas bigger.
 */
class Layer_artboards_class {

	constructor() {
		this.Dialog = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	list() {
		return Array.isArray(config.artboards) ? config.artboards : [];
	}

	/**
	 * Layer > Artboards > New Artboard… - from the selection, or a size placed right of the other artboards
	 */
	new_artboard() {
		const list = this.list();
		if (list.length >= MAX_ARTBOARDS) {
			alertify.error(t('Too many artboards.'));
			return;
		}
		const selection = new Edit_selection_class().get_mask();
		const rect = selection ? (selection.kind == 'custom' ? mask_bounds(selection.mask) : selection.rect) : null;
		const presets = Object.keys(ARTBOARD_PRESETS);
		const params = [
			{name: 'name', title: 'Name:', value: `${t('Artboard')} ${list.length + 1}`},
		];
		if (rect) {
			params.push({name: 'from_selection', title: 'From selection', value: true});
		}
		params.push(
			{name: 'preset', title: 'Size:', values: presets, value: presets[0]},
			{name: 'width', title: 'Width:', value: list.length ? list[list.length - 1].width : config.WIDTH, range: [1, 30000]},
			{name: 'height', title: 'Height:', value: list.length ? list[list.length - 1].height : config.HEIGHT, range: [1, 30000]}
		);
		this.Dialog.show({
			title: 'New Artboard',
			params,
			on_finish: (values) => {
				let box;
				if (rect && values.from_selection === true) {
					box = {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
				}
				else {
					const preset = ARTBOARD_PRESETS[values.preset];
					const width = preset ? preset[0] : parseInt(values.width, 10);
					const height = preset ? preset[1] : parseInt(values.height, 10);
					//the first artboard starts at the corner of the document, the next ones go to the right
					box = {...next_artboard_place(list), width, height};
				}
				const next = add_artboard(list, box, String(values.name || '').trim());
				if (next.length == list.length) {
					alertify.error(t('Wrong size.'));
					return;
				}
				this.save(next, 'New Artboard');
			},
		});
	}

	/**
	 * Layer > Artboards > Rename Artboard…
	 */
	rename_artboard() {
		this.choose('Rename Artboard', [{name: 'new_name', title: 'Name:', value: ''}], (item, values) => {
			const name = String(values.new_name || '').trim();
			if (!name) {
				alertify.error(t('Name is required.'));
				return;
			}
			this.save(this.list().map((other) => (other.id == item.id ? {...other, name: name.slice(0, 100)} : other)), 'Rename Artboard');
		});
	}

	/**
	 * Layer > Artboards > Delete Artboard… (the layers stay)
	 */
	delete_artboard() {
		this.choose('Delete Artboard', [], (item) => {
			this.save(this.list().filter((other) => other.id != item.id), 'Delete Artboard');
		});
	}

	choose(title, extra, done) {
		const list = this.list();
		if (!list.length) {
			alertify.warning(t('There are no artboards.'));
			return;
		}
		const names = list.map((item, index) => `${index + 1}. ${item.name}`);
		this.Dialog.show({
			title,
			params: [{name: 'artboard', title: 'Artboard:', values: names, value: names[0]}].concat(extra),
			on_finish: (values) => {
				const item = list[names.indexOf(values.artboard)];
				if (item) {
					done(item, values);
				}
			},
		});
	}

	/**
	 * One undo step; the canvas grows when an artboard does not fit
	 */
	save(next, name) {
		const size = canvas_for_artboards(next, config.WIDTH, config.HEIGHT);
		const actions = [];
		if (size.width != config.WIDTH || size.height != config.HEIGHT) {
			actions.push(
				new app.Actions.Prepare_canvas_action('undo'),
				new app.Actions.Update_config_action({WIDTH: size.width, HEIGHT: size.height, artboards: next}),
				new app.Actions.Prepare_canvas_action('do')
			);
		}
		else {
			actions.push(new app.Actions.Update_config_action({artboards: next}));
		}
		return app.State.do_action(new app.Actions.Bundle_action('artboards', name, actions));
	}

	/**
	 * File > Export > Artboards to Files - every artboard as a PNG of the visible picture, in one ZIP
	 */
	async export_artboards() {
		const list = this.list();
		if (!list.length) {
			alertify.warning(t('There are no artboards.'));
			return;
		}
		try {
			const picture = document.createElement('canvas');
			picture.width = config.WIDTH;
			picture.height = config.HEIGHT;
			this.Base_layers.convert_layers_to_canvas(picture.getContext('2d'), null, false);
			const names = artboard_file_names(list);
			const files = [];
			for (let i = 0; i < list.length; i++) {
				const item = list[i];
				const canvas = document.createElement('canvas');
				canvas.width = item.width;
				canvas.height = item.height;
				canvas.getContext('2d').drawImage(picture, -item.x, -item.y);
				const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
				files.push({name: names[i], data: new Uint8Array(await blob.arrayBuffer())});
			}
			const use_picker = Boolean(new Tools_settings_class().get_setting('use_file_picker'));
			await save_blob(new Blob([build_zip(files)], {type: 'application/zip'}), 'artboards.zip', use_picker);
		}
		catch {
			alertify.error(t('Export failed.'));
		}
	}
}

export default Layer_artboards_class;
