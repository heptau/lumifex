import config from './../config.js';
import Helper_class from './../libs/helpers.js';
import Base_mask_tool_class from './../core/base-mask-tool.js';
import { object_in_rect_mask } from './../libs/object-select.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../modules/tools/translate.js';

/**
 * Object Selection (Photoshop): drag a rectangle around an object, the object inside is selected. The tool reads the
 * visible picture, so it works on any layer. Shift adds to the selection, Alt subtracts, Shift+Alt intersects.
 */
class Object_select_class extends Base_mask_tool_class {

	constructor(ctx) {
		super(ctx, 'object_select');
		this.Helper = new Helper_class();
		this.start = null; //{x, y, shiftKey, altKey}
		this.current = null;
		this.working = false;
	}

	load() {
		document.addEventListener('mousedown', (event) => {
			if (config.TOOL.name == this.name) {
				this.mousedown(event);
			}
		});
		document.addEventListener('mousemove', (event) => {
			if (config.TOOL.name == this.name) {
				this.mousemove(event);
			}
		});
		document.addEventListener('mouseup', (event) => {
			if (config.TOOL.name == this.name) {
				this.mouseup(event);
			}
		});
		document.addEventListener('keydown', (event) => {
			if (config.TOOL.name != this.name || this.Helper.is_input(event.target)) {
				return;
			}
			if (event.key == 'Escape' && this.start) {
				this.start = null;
				this.current = null;
				config.need_render = true;
			}
			else if (event.keyCode == 46) {
				this.Selection.delete_selection();
			}
		}, false);
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false || mouse.valid == false || this.working || e.button !== 0) {
			return;
		}
		this.start = {x: mouse.x, y: mouse.y, shiftKey: e.shiftKey, altKey: e.altKey};
		this.current = {x: mouse.x, y: mouse.y};
	}

	mousemove(e) {
		if (!this.start) {
			return;
		}
		const mouse = this.get_mouse_info(e);
		this.current = {x: mouse.x, y: mouse.y};
		config.need_render = true;
	}

	async mouseup() {
		if (!this.start || this.working) {
			return;
		}
		const start = this.start;
		const end = this.current || start;
		this.start = null;
		this.current = null;
		config.need_render = true;
		const rect = {x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y};
		if (Math.abs(rect.width) < 4 || Math.abs(rect.height) < 4) {
			return; //a click: nothing to look into
		}
		if (config.WIDTH * config.HEIGHT > 40000000) {
			alertify.error(t('The image is too large for this tool.'));
			return;
		}
		this.working = true;
		try {
			const params = this.getParams();
			const mask = object_in_rect_mask(this.visible_picture(), rect, params.tolerance);
			if (!mask.data.some((value) => value > 0)) {
				alertify.warning(t('No object was found in the rectangle.'));
				return;
			}
			await this.commit_mask(mask, {shiftKey: start.shiftKey, altKey: start.altKey});
		}
		finally {
			this.working = false;
		}
	}

	render_overlay(ctx) {
		this.render_mask_overlay(ctx);
		if (this.start && this.current) {
			const x = Math.min(this.start.x, this.current.x);
			const y = Math.min(this.start.y, this.current.y);
			const w = Math.abs(this.current.x - this.start.x);
			const h = Math.abs(this.current.y - this.start.y);
			ctx.save();
			ctx.lineWidth = 1 / config.ZOOM;
			ctx.setLineDash([4 / config.ZOOM, 4 / config.ZOOM]);
			ctx.strokeStyle = '#ffffff';
			ctx.strokeRect(x, y, w, h);
			ctx.lineDashOffset = 4 / config.ZOOM;
			ctx.strokeStyle = '#000000';
			ctx.strokeRect(x, y, w, h);
			ctx.restore();
		}
	}
}

export default Object_select_class;
