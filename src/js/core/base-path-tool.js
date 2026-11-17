import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './base-tools.js';
import Edit_paths_class from './../modules/edit/paths.js';
import { trace_path, pen_layer_anchors, pen_layer_geometry, copy_anchors } from './../libs/document-paths.js';

const LAYER_KEYS = ['x', 'y', 'width', 'height', 'width_original', 'height_original', 'data'];

/**
 * The common part of the Path Selection and Direct Selection tools. They work on the path selected in the Paths panel
 * (config.paths, modules/edit/paths.js) or, when no path is selected, on the path of the active Pen layer
 * (`type: 'pen'`). A drag is one undo step: Set_paths_action for a document path, Update_layer_action for a layer.
 */
class Base_path_tool_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.drag = null;
	}

	load() {
		this.default_events();
	}

	paths() {
		return new Edit_paths_class();
	}

	/**
	 * @returns {number} the reach of the pointer in document pixels
	 */
	tolerance() {
		return 6 / (config.ZOOM || 1);
	}

	/**
	 * @param {object|null} layer
	 * @returns {boolean} a Pen layer whose anchors can be edited
	 */
	is_pen_layer(layer) {
		return layer != null && layer.type == 'pen' && !(layer.rotate) && layer.locked !== true && layer.visible !== false;
	}

	/**
	 * What the tool works on: the selected document path, otherwise the active Pen layer
	 *
	 * @returns {{kind: 'path'|'layer', id: number, anchors: object[], closed: boolean, layer?: object}|null}
	 */
	get_target() {
		const path = this.paths().get_selected();
		if (path) {
			return {kind: 'path', id: path.id, anchors: copy_anchors(path.anchors), closed: path.closed};
		}
		const layer = config.layer;
		if (this.is_pen_layer(layer)) {
			return {kind: 'layer', id: layer.id, layer, anchors: pen_layer_anchors(layer), closed: !!(layer.params && layer.params.closed)};
		}
		return null;
	}

	/**
	 * Shows the changed anchors of a Pen layer while dragging (the old values are kept and put back before the action)
	 *
	 * @param {object} layer
	 * @param {object[]} anchors document pixels
	 * @param {boolean} closed
	 */
	preview_layer(layer, anchors, closed) {
		if (this.drag.saved == null) {
			this.drag.saved = {};
			LAYER_KEYS.forEach((key) => {
				this.drag.saved[key] = layer[key];
			});
		}
		Object.assign(layer, pen_layer_geometry(anchors, closed, layer.params && layer.params.size));
	}

	/**
	 * @param {object|null} drag puts back the values of the layer that were changed for the preview
	 */
	restore_layer(drag) {
		if (drag && drag.saved && drag.layer) {
			Object.assign(drag.layer, drag.saved);
			drag.saved = null;
		}
	}

	/**
	 * One undo step for the finished drag
	 *
	 * @param {string} description
	 */
	commit(description) {
		const drag = this.drag;
		this.drag = null;
		config.need_render = true;
		if (drag == null) {
			return;
		}
		this.restore_layer(drag);
		if (drag.moved == false) {
			return;
		}
		if (drag.kind == 'path') {
			return this.paths().update_anchors(drag.id, drag.anchors, description);
		}
		const layer = drag.layer;
		const settings = pen_layer_geometry(drag.anchors, drag.closed, layer.params && layer.params.size);
		return app.State.do_action(
			new app.Actions.Bundle_action('edit_pen_layer', description, [
				new app.Actions.Update_layer_action(layer.id, settings),
			])
		);
	}

	on_leave() {
		this.restore_layer(this.drag);
		this.drag = null;
		config.need_render = true;
		return [];
	}

	/**
	 * @returns {{anchors: object[], closed: boolean}|null} what is drawn over the picture
	 */
	overlay_path() {
		if (this.drag) {
			return {anchors: this.drag.anchors, closed: this.drag.closed};
		}
		const target = this.get_target();
		return target ? {anchors: target.anchors, closed: target.closed} : null;
	}

	/**
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {boolean} handles draw the handles and hollow anchors (Direct Selection)
	 */
	draw_path(ctx, handles) {
		const path = this.overlay_path();
		if (path == null || path.anchors.length == 0) {
			return;
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
		path.anchors.forEach((anchor) => {
			if (handles) {
				[anchor.in, anchor.out].forEach((handle) => {
					if (handle == null) {
						return;
					}
					ctx.beginPath();
					ctx.moveTo(anchor.x, anchor.y);
					ctx.lineTo(handle.x, handle.y);
					ctx.lineWidth = scale;
					ctx.strokeStyle = '#0a84ff';
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(handle.x, handle.y, 3 * scale, 0, Math.PI * 2);
					ctx.fillStyle = '#ffffff';
					ctx.fill();
					ctx.stroke();
				});
			}
			const half = 3.5 * scale;
			ctx.fillStyle = handles ? '#ffffff' : '#0a84ff';
			ctx.lineWidth = scale;
			ctx.strokeStyle = '#0a84ff';
			ctx.fillRect(anchor.x - half, anchor.y - half, half * 2, half * 2);
			ctx.strokeRect(anchor.x - half, anchor.y - half, half * 2, half * 2);
		});
		ctx.restore();
	}
}

export default Base_path_tool_class;
