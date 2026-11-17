import config from './../config.js';
import Base_path_tool_class from './../core/base-path-tool.js';
import { pick_path, hit_outline, pen_layer_anchors, translate_anchors, copy_anchors } from './../libs/document-paths.js';

/**
 * Path Selection tool (Photoshop, A): a click on a path of the Paths panel selects it, a drag moves the whole path.
 * On the path of the active Pen layer it moves the path (the layer). A click on nothing deselects the path.
 */
class Path_select_class extends Base_path_tool_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'path_select';
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		const point = {x: mouse.x, y: mouse.y};
		const paths = this.paths();
		const id = pick_path(paths.get_paths(), point, this.tolerance());
		if (id != null) {
			if (paths.selected_id != id) {
				paths.select(id);
			}
			const path = paths.get_selected();
			this.drag = {kind: 'path', id, start: point, original: copy_anchors(path.anchors), anchors: copy_anchors(path.anchors), closed: path.closed, moved: false};
			return;
		}
		if (paths.selected_id != null) {
			paths.select(null);
		}
		const layer = config.layer;
		if (this.is_pen_layer(layer)) {
			const anchors = pen_layer_anchors(layer);
			const closed = !!(layer.params && layer.params.closed);
			if (hit_outline(anchors, closed, point, this.tolerance())) {
				this.drag = {kind: 'layer', id: layer.id, layer, start: point, original: anchors, anchors: copy_anchors(anchors), closed, moved: false, saved: null};
			}
		}
		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		if (this.drag == null || mouse.is_drag == false) {
			return;
		}
		const dx = mouse.x - this.drag.start.x;
		const dy = mouse.y - this.drag.start.y;
		if (this.drag.moved == false && Math.hypot(dx, dy) < 1 / (config.ZOOM || 1)) {
			return;
		}
		this.drag.moved = true;
		this.drag.anchors = translate_anchors(this.drag.original, dx, dy);
		if (this.drag.kind == 'layer') {
			this.preview_layer(this.drag.layer, this.drag.anchors, this.drag.closed);
		}
		config.need_render = true;
	}

	mouseup() {
		this.commit('Move Path');
	}

	render_overlay(ctx) {
		this.draw_path(ctx, false);
	}
}

export default Path_select_class;
