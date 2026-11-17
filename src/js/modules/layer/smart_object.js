import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';
import { validate_file, sanitize_filename } from './../../libs/input-validator.js';
import { save_blob } from './../../libs/file-save.js';
import { content_bounds } from './../../libs/psd-write.js';
import {
	is_smart_object, make_smart_object, contents_layer, build_project, picture_project, place_contents, fit_placed,
	scale_replaced, contents_file_name, MAX_SMART_DOCUMENT, MAX_SMART_SIDE,
} from './../../libs/smart-object.js';

//the work canvas of a converted vector layer
const MAX_WORK_PIXELS = 100 * 1000 * 1000;

/**
 * Layer > Smart Objects and File > Place Embedded. A smart object is an image layer whose picture is the flattened
 * render of a source document kept in `layer.smart_object` (libs/smart-object.js). Its pixels are not edited (the
 * guard is in Update_layer_image_action), smart filters, styles, masks and transformations work as on any picture.
 * Edit Contents opens the source in a new document tab; the tab keeps `smart_link = {parent, layer_id, synced}` and
 * GUI_documents.switch_to calls capture() / apply() when the parent tab is selected again.
 */
class Layer_smart_object_class {

	get docs() {
		return app.GUI.GUI_documents;
	}

	/**
	 * Layer > Smart Objects > Convert to Smart Object
	 */
	async convert() {
		const layer = config.layer;
		if (!layer || layer.type == null || layer.type == 'adjustment') {
			alertify.error(t('This layer cannot be converted to a smart object.'));
			return;
		}
		if (layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			return;
		}
		try {
			if (layer.type == 'image') {
				await this.convert_image(layer);
			}
			else {
				await this.convert_vector(layer);
			}
		}
		catch (error) {
			console.error(error);
			alertify.error(t('This layer cannot be converted to a smart object.'));
		}
	}

	/**
	 * A picture keeps its place and pixels, it only gets the source (itself at its natural size)
	 */
	async convert_image(layer) {
		const width = parseInt(layer.width_original, 10) || layer.link.naturalWidth || layer.link.width;
		const height = parseInt(layer.height_original, 10) || layer.link.naturalHeight || layer.link.height;
		if (!this.check_size(width, height)) {
			return;
		}
		const canvas = this.canvas(width, height);
		canvas.getContext('2d').drawImage(layer.link, 0, 0, width, height);
		const contents = contents_layer(this.plain(layer), 0, 0);
		Object.assign(contents, {width, height, width_original: width, height_original: height});
		const json = this.project(width, height, [contents], [{id: contents.id, data: canvas.toDataURL('image/png')}]);
		if (!this.check_document(json)) {
			return;
		}
		return app.State.do_action(
			new app.Actions.Bundle_action('smart_object_convert', 'Convert to Smart Object', [
				new app.Actions.Update_layer_action(layer.id, {
					smart_object: make_smart_object(json, width, height),
					width_original: width,
					height_original: height,
				}),
			])
		);
	}

	/**
	 * Text, shapes, strokes, paths: the layer goes into the contents (with its layer mask), a picture of it replaces
	 * it in the same place; the styles, opacity, blend mode, group and link stay with the smart object
	 */
	async convert_vector(layer) {
		const margin = Math.max(64, Math.min(2000, Math.round(Math.max(layer.width || 0, layer.height || 0) / 2)));
		const work_w = Math.ceil((layer.width || 0) + margin * 2);
		const work_h = Math.ceil((layer.height || 0) + margin * 2);
		if (work_w * work_h > MAX_WORK_PIXELS) {
			alertify.error(t('The smart object is too large.'));
			return;
		}
		const work = this.canvas(work_w, work_h);
		const ctx = work.getContext('2d', {willReadFrequently: true});
		const drawn = Object.assign({}, layer, {
			x: margin, y: margin, rotate: 0, filters: [], opacity: 100, fill_opacity: 100, composition: 'source-over',
			visible: true, blend_if: null,
		});
		app.Layers.render_object(ctx, drawn, false);
		const bounds = content_bounds(ctx.getImageData(0, 0, work_w, work_h).data, work_w, work_h);
		if (!bounds) {
			alertify.error(t('Layer is empty.'));
			return;
		}
		if (!this.check_size(bounds.width, bounds.height)) {
			return;
		}
		const picture = this.canvas(bounds.width, bounds.height);
		picture.getContext('2d').drawImage(work, -bounds.x, -bounds.y);
		work.width = 1;
		work.height = 1;

		const contents = contents_layer(this.plain(layer), margin - bounds.x, margin - bounds.y, {keep_mask: true});
		const json = this.project(bounds.width, bounds.height, [contents], []);
		if (!this.check_document(json)) {
			return;
		}
		const frame = place_contents(layer, margin, bounds);
		const settings = {
			name: layer.name,
			type: 'image',
			data: picture.toDataURL('image/png'),
			x: frame.x,
			y: frame.y,
			width: frame.width,
			height: frame.height,
			width_original: bounds.width,
			height_original: bounds.height,
			rotate: layer.rotate || 0,
			order: layer.order,
			smart_object: make_smart_object(json, bounds.width, bounds.height),
		};
		//how the layer is put into the document stays with the smart object
		for (const key of ['visible', 'opacity', 'fill_opacity', 'composition', 'group', 'group_opacity', 'group_props',
			'link_id', 'color_label', 'blend_if']) {
			if (layer[key] !== undefined) {
				settings[key] = JSON.parse(JSON.stringify(layer[key]));
			}
		}
		settings.filters = JSON.parse(JSON.stringify(layer.filters || []));
		return app.State.do_action(
			new app.Actions.Bundle_action('smart_object_convert', 'Convert to Smart Object', [
				new app.Actions.Insert_layer_action(settings, false),
				new app.Actions.Delete_layer_action(layer.id),
			])
		);
	}

	/**
	 * Layer > Smart Objects > Edit Contents: the source in a new document tab
	 */
	async edit_contents() {
		const layer = this.smart_layer();
		if (!layer || !this.docs) {
			return;
		}
		const docs = this.docs;
		const parent = docs.documents[docs.active];
		const name = `${layer.name} (${t('Smart Object')})`.slice(0, 80);
		const link = {parent, layer_id: layer.id, synced: null};
		const opened = await docs.open_json_as_new(name, layer.smart_object.document, {smart_link: link});
		if (opened) {
			//what the tab looks like before any change (the JSON is written again in its own format)
			try {
				link.synced = (await import('./../file/save-helpers.js')).export_as_json();
			}
			catch {
				link.synced = null;
			}
		}
	}

	/**
	 * File > Save Smart Object (and the tab menu): the contents go back to the layer, the parent tab is selected
	 */
	save_contents() {
		const docs = this.docs;
		const doc = docs ? docs.documents[docs.active] : null;
		if (!doc || !doc.smart_link) {
			alertify.error(t('This document is not the contents of a smart object.'));
			return;
		}
		const index = docs.documents.indexOf(doc.smart_link.parent);
		if (index < 0) {
			alertify.error(t('The document of this smart object is closed.'));
			return;
		}
		return docs.switch_to(index);
	}

	/**
	 * Called by GUI_documents.switch_to while the contents are still the active document
	 *
	 * @param {object} doc the tab of the contents
	 * @param {string} json its current project JSON
	 * @returns {object|null} what apply() puts into the layer, null when nothing changed
	 */
	capture(doc, json) {
		const link = doc ? doc.smart_link : null;
		if (!link || json === link.synced) {
			return null;
		}
		if (json.length > MAX_SMART_DOCUMENT || !this.check_size(config.WIDTH, config.HEIGHT)) {
			alertify.error(t('The smart object is too large.'));
			return null;
		}
		const canvas = this.canvas(config.WIDTH, config.HEIGHT);
		app.Layers.convert_layers_to_canvas(canvas.getContext('2d'));
		return {doc, link, json, canvas, width: config.WIDTH, height: config.HEIGHT};
	}

	/**
	 * Called by GUI_documents.switch_to after the parent document was loaded: one undo step
	 *
	 * @param {object} update the result of capture()
	 */
	async apply(update) {
		const layer = app.Layers.get_layer(update.link.layer_id);
		if (!is_smart_object(layer)) {
			alertify.error(t('The smart object layer no longer exists.'));
			return;
		}
		const done = await this.replace(layer, update.canvas, update.json, update.width, update.height, 'Update Smart Object');
		if (done) {
			update.link.synced = update.json;
			update.doc.dirty = false;
			this.docs.render();
		}
	}

	/**
	 * Puts new contents into a smart object; the layer keeps its scale and center
	 *
	 * @returns {Promise<boolean>}
	 */
	async replace(layer, canvas, json, width, height, history_name) {
		const old = layer.smart_object;
		const frame = scale_replaced(layer, old.width, old.height, width, height);
		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('smart_object_update', history_name, [
					new app.Actions.Update_layer_image_action(canvas, layer.id, {allow_smart: true}),
					new app.Actions.Update_layer_action(layer.id, {
						smart_object: make_smart_object(json, width, height),
						x: frame.x,
						y: frame.y,
						width: frame.width,
						height: frame.height,
						width_original: width,
						height_original: height,
					}),
				])
			);
			return true;
		}
		catch (error) {
			console.error(error);
			return false;
		}
	}

	/**
	 * Layer > Smart Objects > Rasterize: the picture stays, the source is dropped
	 */
	rasterize() {
		const layer = this.smart_layer();
		if (!layer) {
			return;
		}
		return app.State.do_action(
			new app.Actions.Bundle_action('smart_object_rasterize', 'Rasterize Smart Object', [
				new app.Actions.Update_layer_action(layer.id, {smart_object: null}),
			])
		);
	}

	/**
	 * Layer > Smart Objects > Replace Contents...: an image file becomes the new source
	 */
	async replace_contents() {
		const layer = this.smart_layer();
		if (!layer) {
			return;
		}
		const file = await this.choose_file();
		const picture = file ? await this.read_picture(file) : null;
		if (!picture || !app.Layers.get_layer(layer.id)) {
			return;
		}
		const json = picture_project(sanitize_filename(file.name), picture.toDataURL('image/png'), picture.width, picture.height, VERSION);
		if (this.check_document(json)) {
			await this.replace(layer, picture, json, picture.width, picture.height, 'Replace Contents');
		}
	}

	/**
	 * Layer > Smart Objects > Export Contents...: the source as a project file (.json, opened by File > Open)
	 */
	export_contents() {
		const layer = this.smart_layer();
		if (!layer) {
			return;
		}
		const blob = new Blob([layer.smart_object.document], {type: 'application/json'});
		return save_blob(blob, contents_file_name(layer.name), true);
	}

	/**
	 * File > Place Embedded...: an image file as a new smart object in the middle of the document
	 */
	async place_embedded() {
		const file = await this.choose_file();
		const picture = file ? await this.read_picture(file) : null;
		if (!picture) {
			return;
		}
		const name = sanitize_filename(file.name);
		const json = picture_project(name, picture.toDataURL('image/png'), picture.width, picture.height, VERSION);
		if (!this.check_document(json)) {
			return;
		}
		const frame = fit_placed(picture.width, picture.height, config.WIDTH, config.HEIGHT);
		return app.State.do_action(
			new app.Actions.Bundle_action('place_embedded', 'Place Embedded', [
				new app.Actions.Insert_layer_action({
					name,
					type: 'image',
					data: picture.toDataURL('image/png'),
					x: frame.x,
					y: frame.y,
					width: frame.width,
					height: frame.height,
					width_original: picture.width,
					height_original: picture.height,
					smart_object: make_smart_object(json, picture.width, picture.height),
				}, false),
			])
		);
	}

	/**
	 * @returns {Promise<File|null>}
	 */
	choose_file() {
		return new Promise((resolve) => {
			const tmp = document.getElementById('tmp');
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/*';
			if (tmp) {
				tmp.innerHTML = '';
				tmp.appendChild(input);
			}
			input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), false);
			input.addEventListener('cancel', () => resolve(null), false);
			input.click();
		});
	}

	/**
	 * Decodes an image file the way File > Open as Layer does (validated, no blob: URLs because of the CSP)
	 *
	 * @param {File} file
	 * @returns {Promise<HTMLCanvasElement|null>}
	 */
	async read_picture(file) {
		const validation = validate_file(file);
		if (!validation.valid) {
			alertify.error(validation.error);
			return null;
		}
		try {
			let source;
			if (file.type == 'image/svg+xml' || String(file.name).toLowerCase().endsWith('.svg')) {
				const data = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result);
					reader.onerror = () => reject(reader.error);
					reader.readAsDataURL(file);
				});
				source = await new Promise((resolve, reject) => {
					const image = new Image();
					image.onload = () => resolve(image);
					image.onerror = reject;
					image.src = data;
				});
			}
			else {
				source = await createImageBitmap(file);
			}
			const width = source.naturalWidth || source.width;
			const height = source.naturalHeight || source.height;
			if (!this.check_size(width, height)) {
				return null;
			}
			const canvas = this.canvas(width, height);
			canvas.getContext('2d').drawImage(source, 0, 0, width, height);
			if (source.close) {
				source.close();
			}
			return canvas;
		}
		catch {
			alertify.error(t('Sorry, image could not be loaded.'));
			return null;
		}
	}

	/**
	 * @returns {object|null} the active layer when it is a smart object
	 */
	smart_layer() {
		if (!is_smart_object(config.layer)) {
			alertify.error(t('This layer is not a smart object.'));
			return null;
		}
		return config.layer;
	}

	check_size(width, height) {
		if (!(width >= 1 && height >= 1 && width <= MAX_SMART_SIDE && height <= MAX_SMART_SIDE)) {
			alertify.error(t('The smart object is too large.'));
			return false;
		}
		return true;
	}

	check_document(json) {
		if (json.length > MAX_SMART_DOCUMENT) {
			alertify.error(t('The smart object is too large.'));
			return false;
		}
		return true;
	}

	project(width, height, layers, data) {
		return build_project({width, height, version: VERSION, layers, data, resolution: config.RESOLUTION, units: config.UNITS});
	}

	/**
	 * a copy of a layer without its private data and the picture element
	 */
	plain(layer) {
		const copy = {};
		for (const key in layer) {
			if (key[0] != '_' && key != 'link' && key != 'link_canvas') {
				copy[key] = layer[key];
			}
		}
		return JSON.parse(JSON.stringify(copy));
	}

	canvas(width, height) {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(width));
		canvas.height = Math.max(1, Math.round(height));
		return canvas;
	}
}

export default Layer_smart_object_class;
