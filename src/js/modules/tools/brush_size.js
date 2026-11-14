import config from './../../config.js';
import GUI_tools_class from './../../core/gui/gui-tools.js';

/**
 * Change size of active tool with [ and ] keys (Photoshop style)
 */
class Tools_brush_size_class {

	constructor() {
		this.GUI_tools = new GUI_tools_class();
	}

	increase() {
		this.change(1);
	}

	decrease() {
		this.change(-1);
	}

	/**
	 * Shift + ] (Photoshop): a harder brush (only tools with the option "hardness")
	 */
	increase_hardness() {
		this.change_hardness(1);
	}

	/**
	 * Shift + [ (Photoshop): a softer brush
	 */
	decrease_hardness() {
		this.change_hardness(-1);
	}

	/**
	 * @param {int} direction 1 or -1
	 */
	change_hardness(direction) {
		const attribute = config.TOOL && config.TOOL.attributes ? config.TOOL.attributes.hardness : null;
		if (attribute == null || typeof attribute != 'object') {
			return;
		}
		const min = attribute.min != null ? attribute.min : 0;
		const max = attribute.max != null ? attribute.max : 100;
		const current = parseFloat(attribute.value);
		attribute.value = Math.min(max, Math.max(min, Math.round(((isFinite(current) ? current : max) + direction * 10) / 10) * 10));
		this.GUI_tools.show_action_attributes();
	}

	/**
	 * @param {int} direction 1 or -1
	 */
	change(direction) {
		const attributes = config.TOOL ? config.TOOL.attributes : null;
		if (attributes == null || attributes.size == undefined) {
			return;
		}
		const is_object = typeof attributes.size == 'object';
		let size = parseFloat(is_object ? attributes.size.value : attributes.size) || 1;
		const min = is_object && attributes.size.min != null ? attributes.size.min : 1;
		const max = is_object && attributes.size.max != null ? attributes.size.max : 999;

		//bigger steps for bigger brushes, like in Photoshop
		const step = size < 10 ? 1 : (size < 50 ? 5 : 10);
		size = Math.min(max, Math.max(min, Math.round(size + direction * step)));

		if (is_object) {
			attributes.size.value = size;
		}
		else {
			attributes.size = size;
		}
		if (config.TOOL.on_update != undefined) {
			const tool = this.GUI_tools.tools_modules[config.TOOL.name];
			if (tool && tool.object[config.TOOL.on_update]) {
				tool.object[config.TOOL.on_update]({key: 'size', value: size});
			}
		}
		this.GUI_tools.show_action_attributes();
	}
}

export default Tools_brush_size_class;
