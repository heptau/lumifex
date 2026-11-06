import app from './../app.js';
import config from './../config.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import image_store from './store/image-store.js';
import { Base_action } from './base.js';
import { t } from '../modules/tools/translate.js';
import { keep_alpha } from '../libs/alpha-lock.js';

const Helper = new Helper_class();

export class Update_layer_image_action extends Base_action {
	/**
	 * updates layer image data
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 * @param {{keep_alpha?: boolean}} options keep_alpha: a layer with Lock Transparency keeps its alpha channel
	 *        (set by tools that paint, fill or filter; not by operations that change the geometry)
	 */
	constructor(canvas, layer_id, options = {}) {
		super('update_layer_image', 'Update Layer Image');
		this.canvas = canvas;
		this.keep_alpha = options != null && options.keep_alpha === true;
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.reference_layer = null;
		this.old_image_id = null;
		this.new_image_id = null;
		this.old_link_database_id = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (this.reference_layer.locked === true) {
			alertify.error(t('Layer is locked.'));
			this.reference_layer = null;
			throw new Error('Aborted - layer is locked');
		}
		if (this.reference_layer.type != 'image'){
			alertify.error(t('Error: layer must be image.'));
			throw new Error('Aborted - layer is not an image');
		}

		if (this.keep_alpha && this.reference_layer.lock_alpha === true && this.canvas && !this.new_image_id) {
			this.apply_alpha_lock();
		}

		// Get data url representation of image
		let canvas_data_url;
		if (this.new_image_id) {
			try {
				canvas_data_url = await image_store.get(this.new_image_id);
			} catch (error) {
				throw new Error('Aborted - problem retrieving cached image from database', { cause: error });
			}
		} else if (this.canvas) {
			if (Helper.is_edge_or_ie() == false && typeof(FileReader) !== 'undefined') {
				// Update image using blob and FileReader (async)
				await new Promise((resolve) => {
					this.canvas.toBlob((blob) => {
						const reader = new FileReader();
						reader.onloadend = () => {
							canvas_data_url = reader.result;
							resolve();
						}
						reader.readAsDataURL(blob);
					}, 'image/png');
				});
			}
			else {
				// Slow way for IE, Edge
				canvas_data_url = this.canvas.toDataURL();
			}
		}

		// Store data url in database
		try {
			if (!this.old_image_id) {
				if (this.reference_layer._link_database_id) {
					this.old_image_id = this.reference_layer._link_database_id;
				} else {
					this.old_image_id = await image_store.add(this.reference_layer.link.src);
				}
			}
			if (!this.new_image_id) {
				this.new_image_id = await image_store.add(canvas_data_url);
			}
		} catch (error) {
			console.error(error);
			requestAnimationFrame(() => {
				app.State.free(0, this.database_estimate || 1)
			});
		}

		// Estimate storage size
		try {
			this.database_estimate = new Blob([await image_store.get(this.old_image_id)]).size;
		} catch {}

		// Assign layer properties
		this.reference_layer.link.src = canvas_data_url;
		this.old_link_database_id = this.reference_layer._link_database_id;
		this.reference_layer._link_database_id = this.new_image_id;

		this.canvas = null;
		config.need_render = true;
	}

	/**
	 * Lock Transparency: the alpha channel of the new image is replaced by the alpha of the current image
	 */
	apply_alpha_lock() {
		const source = this.reference_layer.link;
		const width = this.canvas.width;
		const height = this.canvas.height;
		if (!source || (source.naturalWidth || source.width) !== width || (source.naturalHeight || source.height) !== height) {
			return;
		}
		try {
			const old_canvas = document.createElement('canvas');
			old_canvas.width = width;
			old_canvas.height = height;
			const old_ctx = old_canvas.getContext('2d', {willReadFrequently: true});
			old_ctx.drawImage(source, 0, 0);
			const ctx = this.canvas.getContext('2d', {willReadFrequently: true});
			const next = ctx.getImageData(0, 0, width, height);
			if (keep_alpha(old_ctx.getImageData(0, 0, width, height).data, next.data)) {
				ctx.putImageData(next, 0, 0);
			}
		} catch (error) {
			console.warn('Lock Transparency could not be applied', error);
		}
	}

	async undo() {
		super.undo();

		// Estimate storage size
		try {
			this.database_estimate = new Blob([this.reference_layer.link.src]).size;
		} catch {}

		// Restore old image
		if (this.old_image_id != null) {
			try {
				this.reference_layer.link.src = await image_store.get(this.old_image_id);
			} catch (error) {
				throw new Error('Failed to retrieve image from store', { cause: error });
			}
		}
		this.reference_layer._link_database_id = this.old_link_database_id;
		this.reference_layer = null;
		config.need_render = true;
	}

	async free() {
		let has_error = false;
		if (this.new_image_id != null) {
			try {
				await image_store.delete(this.new_image_id);
			} catch {
				has_error = true;
			}
			this.new_image_id = null;
		}
		if (this.is_done || !this.old_link_database_id) {
			if (this.old_image_id != null) {
				try {
					await image_store.delete(this.old_image_id);
				} catch {
					has_error = true;
				}
				this.old_image_id = null;
			}
		}
		this.canvas = null;
		this.old_link_database_id = null;
		this.reference_layer = null;
		if (has_error) {
			alertify.error(t('A problem occurred while removing undo history. It\'s suggested you save your work and refresh the page in order to free up memory.'));
		}
	}
}
