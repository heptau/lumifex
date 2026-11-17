import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import GUI_paths_class from './../../core/gui/gui-paths.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { path_mask } from './../../libs/pen-path.js';
import { mask_outline } from './../../libs/mask-contour.js';
import { MAX_PATHS, copy_anchors, next_path_id, next_path_name, trace_path } from './../../libs/document-paths.js';
import { t } from '../tools/translate.js';

let instance = null;

/**
 * Document paths (Photoshop's Paths panel): config.paths = [{id, name, closed, anchors}] in document pixels, saved in
 * the project. Every change goes through Set_paths_action (undo). This module owns the selected path (the session only),
 * the panel (core/gui/gui-paths.js) and its commands; the Pen tool in Path mode, the Path Selection and Direct Selection
 * tools and Layer > Vector Mask use it.
 */
class Edit_paths_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
		this.selected_id = null;
		this.panel = new GUI_paths_class(this);
		this.Helper = new Helper_class();
		//the panel is collapsed by default (the base GUI reads the cookie when it starts)
		if (typeof document != 'undefined') {
			if (this.Helper.getCookie('toggle_paths') === null) {
				this.Helper.setCookie('toggle_paths', 0);
			}
			setTimeout(() => this.panel.render_main(), 0);
		}
		//the selected path is drawn over the picture (core/base-layers.js render_overlay)
		config.paths_overlay = (ctx) => this.draw_overlay(ctx);
	}

	/**
	 * @returns {object[]}
	 */
	get_paths() {
		return Array.isArray(config.paths) ? config.paths : [];
	}

	/**
	 * @returns {object|null} the selected path (it may have been removed by an undo)
	 */
	get_selected() {
		if (this.selected_id == null) {
			return null;
		}
		return this.get_paths().find((path) => path.id == this.selected_id) || null;
	}

	/**
	 * @param {number|null} id
	 */
	select(id) {
		this.selected_id = id == null ? null : Number(id);
		config.need_render = true;
		this.panel.render(true);
	}

	/**
	 * @param {object[]} paths the new list (never the old one changed in place)
	 * @param {string} description the name of the history step
	 */
	set_paths(paths, description) {
		return app.State.do_action(new app.Actions.Set_paths_action(paths, description));
	}

	/**
	 * @returns {object|null} the selected path with at least `count` anchors, or null with a message
	 */
	require_path(count) {
		const path = this.get_selected();
		if (path == null) {
			alertify.error(t('Select a path in the Paths panel first.'));
			return null;
		}
		if (path.anchors.length < count) {
			alertify.error(t(count >= 3 ? 'A path needs at least 3 points.' : 'A path needs at least 2 points.'));
			return null;
		}
		return path;
	}

	/**
	 * @param {object} path
	 * @returns {boolean} the temporary path that a new one replaces
	 */
	is_work_path(path) {
		return path.name == 'Work Path' || path.name == t('Work Path');
	}

	/**
	 * A path finished by the Pen tool in Path mode (or made from a selection). An empty selected path receives it, a
	 * selected work path (or none) is replaced by the new work path, otherwise the path is added after the selected one.
	 *
	 * @param {object[]} anchors document pixels
	 * @param {boolean} closed
	 */
	store_path(anchors, closed) {
		const paths = this.get_paths();
		const selected = this.get_selected();
		const data = {closed: closed === true, anchors: copy_anchors(anchors)};
		let list;
		let id;
		if (selected && selected.anchors.length == 0) {
			id = selected.id;
			list = paths.map((path) => (path.id == id ? Object.assign({}, path, data) : path));
		}
		else if (selected && this.is_work_path(selected) == false) {
			if (paths.length >= MAX_PATHS) {
				alertify.error(t('Too many paths.'));
				return null;
			}
			id = next_path_id(paths);
			const index = paths.indexOf(selected);
			list = paths.slice();
			list.splice(index + 1, 0, Object.assign({id, name: next_path_name(paths, t('Path'))}, data));
		}
		else {
			const work = paths.find((path) => this.is_work_path(path));
			if (work) {
				id = work.id;
				list = paths.map((path) => (path.id == id ? Object.assign({}, path, data) : path));
			}
			else {
				if (paths.length >= MAX_PATHS) {
					alertify.error(t('Too many paths.'));
					return null;
				}
				id = next_path_id(paths);
				list = paths.concat([Object.assign({id, name: t('Work Path')}, data)]);
			}
		}
		this.selected_id = id;
		return this.set_paths(list, 'Work Path');
	}

	/**
	 * Replaces the anchors of one path (the path selection tools)
	 *
	 * @param {number} id
	 * @param {object[]} anchors
	 * @param {string} description
	 */
	update_anchors(id, anchors, description) {
		const list = this.get_paths().map((path) => (path.id == id ? Object.assign({}, path, {anchors}) : path));
		return this.set_paths(list, description);
	}

	new_path() {
		const paths = this.get_paths();
		if (paths.length >= MAX_PATHS) {
			alertify.error(t('Too many paths.'));
			return;
		}
		const id = next_path_id(paths);
		this.selected_id = id;
		return this.set_paths(paths.concat([{id, name: next_path_name(paths, t('Path')), closed: false, anchors: []}]), 'New Path');
	}

	delete_path() {
		const path = this.get_selected();
		if (path == null) {
			alertify.error(t('Select a path in the Paths panel first.'));
			return;
		}
		this.selected_id = null;
		return this.set_paths(this.get_paths().filter((item) => item.id != path.id), 'Delete Path');
	}

	/**
	 * @param {number} id
	 * @param {string} name
	 */
	rename_path(id, name) {
		const text = String(name).trim().slice(0, 100);
		if (text == '') {
			return;
		}
		return this.set_paths(this.get_paths().map((path) => (path.id == id ? Object.assign({}, path, {name: text}) : path)), 'Rename Path');
	}

	/**
	 * Fill Path with the foreground color: into the pixels of the active image layer (an open path is closed by a line)
	 */
	async fill_path() {
		const path = this.require_path(3);
		if (path == null) {
			return;
		}
		const Edit_fill_class = (await import('./fill.js')).default;
		return new Edit_fill_class().fill(path_mask(path.anchors, config.WIDTH, config.HEIGHT), {color: config.COLOR, mode: 'Normal', opacity: 100});
	}

	/**
	 * Stroke Path with the size of the Brush and the foreground color
	 */
	async stroke_path() {
		const path = this.require_path(2);
		if (path == null) {
			return;
		}
		const brush = config.TOOLS.find((tool) => tool.name == 'brush');
		const raw = brush && brush.attributes ? brush.attributes.size : 1;
		const size = Math.max(1, Math.min(1000, Number(raw && raw.value !== undefined ? raw.value : raw) || 1));
		const width = Math.max(1, config.WIDTH);
		const height = Math.max(1, config.HEIGHT);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		ctx.lineWidth = size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#000';
		ctx.beginPath();
		trace_path(ctx, path.anchors, path.closed);
		ctx.stroke();
		const pixels = ctx.getImageData(0, 0, width, height).data;
		const data = new Uint8ClampedArray(width * height);
		for (let i = 0; i < data.length; i++) {
			data[i] = pixels[i * 4 + 3];
		}
		canvas.width = canvas.height = 1;
		const Edit_fill_class = (await import('./fill.js')).default;
		return new Edit_fill_class().fill({width, height, data}, {color: config.COLOR, mode: 'Normal', opacity: 100});
	}

	/**
	 * Load Path as Selection
	 */
	async load_selection() {
		const path = this.require_path(3);
		if (path == null) {
			return;
		}
		const Edit_selection_class = (await import('./selection.js')).default;
		return new Edit_selection_class().set_mask(path_mask(path.anchors, config.WIDTH, config.HEIGHT), true);
	}

	/**
	 * Make Work Path from Selection: the outline of the largest part of the selection (corner points)
	 */
	async make_work_path() {
		const Edit_selection_class = (await import('./selection.js')).default;
		const current = new Edit_selection_class().get_mask();
		const outline = current ? mask_outline(current.mask) : [];
		if (outline.length < 3) {
			alertify.error(t('Empty selection'));
			return;
		}
		//a new work path, whatever is selected
		this.selected_id = null;
		return this.store_path(outline.map((p) => ({x: p.x, y: p.y, in: null, out: null})), true);
	}

	/**
	 * Add Vector Mask: the selected path becomes the vector mask of the active layer
	 */
	add_vector_mask() {
		return app.GUI.run_target('layer/vector_mask.current_path');
	}

	/**
	 * The selected path over the picture (document coordinates)
	 */
	draw_overlay(ctx) {
		const path = this.get_selected();
		if (path == null || path.anchors.length == 0 || (config.TOOL && ['path_select', 'direct_select'].includes(config.TOOL.name))) {
			return; //the path selection tools draw it themselves (also while it is dragged)
		}
		const scale = 1 / (config.ZOOM || 1);
		ctx.save();
		ctx.beginPath();
		trace_path(ctx, path.anchors, path.closed);
		ctx.lineWidth = 3 * scale;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.stroke();
		ctx.lineWidth = scale;
		ctx.strokeStyle = '#0a84ff';
		ctx.stroke();
		ctx.restore();
	}
}

export default Edit_paths_class;
