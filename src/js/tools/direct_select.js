import config from './../config.js';
import Base_path_tool_class from './../core/base-path-tool.js';
import { hit_path, move_part } from './../libs/pen-path.js';
import { pick_path } from './../libs/document-paths.js';

/**
 * Direct Selection tool (Photoshop, Shift+A): drags single anchors and handles of the selected path of the Paths panel
 * (or of the active Pen layer). A dragged handle turns the opposite one with it, Alt breaks the pair. A click on another
 * path selects it.
 */
class Direct_select_class extends Base_path_tool_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'direct_select';
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		const point = {x: mouse.x, y: mouse.y};
		const target = this.get_target();
		const hit = target ? hit_path(target.anchors, point, this.tolerance()) : null;
		if (target && hit) {
			this.drag = Object.assign(target, {hit, moved: false, saved: null});
			return;
		}
		//another path of the panel, or nothing
		const paths = this.paths();
		const id = pick_path(paths.get_paths(), point, this.tolerance());
		if (id != paths.selected_id) {
			paths.select(id);
		}
		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		if (this.drag == null || mouse.is_drag == false) {
			return;
		}
		const anchor = this.drag.anchors[this.drag.hit.index];
		if (anchor == null) {
			return;
		}
		move_part(anchor, this.drag.hit.part, {x: mouse.x, y: mouse.y}, e.altKey === true);
		this.drag.moved = true;
		if (this.drag.kind == 'layer') {
			this.preview_layer(this.drag.layer, this.drag.anchors, this.drag.closed);
		}
		config.need_render = true;
	}

	mouseup() {
		this.commit(this.drag && this.drag.hit && this.drag.hit.part == 'anchor' ? 'Move Anchor' : 'Move Handle');
	}

	render_overlay(ctx) {
		this.draw_path(ctx, true);
	}
}

export default Direct_select_class;
