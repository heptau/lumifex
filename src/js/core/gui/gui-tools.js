/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from './../../app.js';
import config from './../../config.js';
import { is_tool_disabled, needs_raster_layer } from './../../libs/raster-tools.js';
import Layer_raster_class from './../../modules/layer/raster.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class, { t } from './../../modules/tools/translate.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_gui_class from '../base-gui.js';
import { pick_shape, is_shape_module, sort_shapes, carry_shape_options, LAST_SHAPE_KEY } from './../../libs/shape-tools.js';

//a double click on these tools in the toolbar runs a command (Photoshop: Hand = Fit on Screen, Zoom = 100 %)
const DOUBLE_CLICK_TARGETS = {hand: 'view/zoom.auto', zoom: 'view/zoom.original'};

let instance = null;

/**
 * GUI class responsible for rendering left sidebar tools
 */
class GUI_tools_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Helper = new Helper_class();
		this.Tools_translate = new Tools_translate_class();
		this.Base_gui = new Base_gui_class();

		//active tool
		this.active_tool = 'brush';
		this.tools_modules = {};
	}

	load_plugins() {
		const ctx = document.getElementById('canvas_minipaint').getContext("2d");
		const plugins_context = require.context("./../../tools/", true, /\.js$/);
		plugins_context.keys().forEach((key) => {
			if (key.indexOf('Base' + '/') < 0) {
				let moduleKey = key.replace('./', '').replace('.js', '');
				const full_key = moduleKey;
				if (moduleKey.indexOf('/') > -1) {
					const parts = moduleKey.split("/");
					moduleKey = parts[parts.length - 1];
				}

				const classObj = plugins_context(key);
				const object = new classObj.default(ctx);

				let title = this.Helper.ucfirst(object.name);
				title = title.replace(/_/, ' ');

				this.tools_modules[moduleKey] = {
					key: moduleKey,
					full_key,
					name: object.name,
					title,
					object,
				};

				//init events once
				if(typeof object.load != "undefined") {
					object.load();
				}
			}
		});
	}

	render_main_tools() {
		this.load_plugins();

		this.render_tools();
	}

	render_tools() {
		let title;
		const target_id = "tools_container";
		let saved_tool = this.Helper.getCookie('active_tool');
		if(saved_tool == 'shape') {
			//bringing this back by default gives bad UX
			saved_tool = null
		}
		if (saved_tool != null) {
			this.active_tool = saved_tool;
		}

		const container = document.getElementById(target_id);
		container.setAttribute('role', 'toolbar');
		container.setAttribute('aria-label', 'Drawing tools');
		container.innerHTML = '';

		//left menu - tools in Photoshop-like groups
		const ordered = this.get_ordered_tools();
		let last_group = null;
		for (let i = 0; i < ordered.length; i++) {
			const item = ordered[i].tool;
			if (item.visible !== false) {
				if (last_group !== null && last_group !== ordered[i].group) {
					const separator = document.createElement('div');
					separator.className = 'separator';
					separator.setAttribute('role', 'separator');
					container.appendChild(separator);
				}
				last_group = ordered[i].group;
			}
			if(item.title)
				title = item.title;
			else
				title = this.Helper.ucfirst(item.name).replace(/_/, ' ');

			const itemDom = document.createElement('button');
			itemDom.type = 'button';
			itemDom.id = item.name;
			itemDom.setAttribute('aria-label', title);
			itemDom.title = title;
			itemDom.setAttribute('role', 'radio');
			itemDom.setAttribute('aria-checked', item.name == this.active_tool ? 'true' : 'false');
			itemDom.setAttribute('tabindex', item.name == this.active_tool ? '0' : '-1');

			if (item.name == this.active_tool) {
				itemDom.className = `item trn active ${  item.name}`;
			}
			else {
				itemDom.className = `item trn ${  item.name}`;
			}
			if(item.visible === false){
				itemDom.style.display = 'none';
			}

			//event
			itemDom.addEventListener('click', (event) => {
				this.activate_tool(event.currentTarget.id);
			});

			//a double click on the Hand fits the picture on the screen, on the Zoom it shows 100 % (Photoshop)
			const double_click_target = DOUBLE_CLICK_TARGETS[item.name];
			if (double_click_target) {
				itemDom.addEventListener('dblclick', () => {
					app.GUI.run_target(double_click_target);
				});
			}

			// Keyboard support
			itemDom.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					this.activate_tool(event.currentTarget.id);
				}
			});

			//register
			container.appendChild(itemDom);
		}

		//arrow keys move between tools (toolbar pattern), Enter / Space select
		container.addEventListener('keydown', (event) => {
			const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
			if (keys.indexOf(event.key) < 0 || !event.target.classList.contains('item')) {
				return;
			}
			const items = Array.from(container.querySelectorAll('.item')).filter((item) => {
				return item.style.display != 'none';
			});
			const index = items.indexOf(event.target);
			const step = (event.key == 'ArrowDown' || event.key == 'ArrowRight') ? 1 : -1;
			const next = event.key == 'Home' ? 0 : (event.key == 'End' ? items.length - 1 : (index + step + items.length) % items.length);
			event.preventDefault();
			items[index].setAttribute('tabindex', '-1');
			items[next].setAttribute('tabindex', '0');
			items[next].focus();
		});

		this.show_action_attributes();
		new app.Actions.Activate_tool_action(this.active_tool, true).do();
		this.Base_gui.check_canvas_offset();
	}

	/**
	 * tools in the order of the Photoshop toolbar. Unknown tools go to the end.
	 *
	 * @returns {{tool: object, group: number}[]}
	 */
	get_ordered_tools() {
		//the order of the Photoshop toolbar read row by row in two columns; the groups have an even number
		//of tools (the animation is the last one) so no hole is left before a separator
		const groups = [
			//Move, Marquee, Lasso, Quick Selection, Magic Wand, Quick Mask
			['select', 'selection', 'lasso', 'quick_select', 'magic_wand', 'quick_mask'],
			//Crop, Eyedropper, Ruler, Healing, Patch, Red Eye, Brush, Pencil, Clone Stamp, History Brush, Eraser,
			//Background Eraser, Magic Eraser, Gradient, Paint Bucket, Blur, Sharpen, Smudge, Dodge/Burn, Sponge,
			//Liquify, Bulge/Pinch
			['crop', 'pick_color', 'measure', 'heal', 'patch', 'red_eye', 'brush', 'pencil', 'clone', 'history_brush',
				'erase', 'background_eraser', 'magic_erase', 'gradient', 'fill', 'blur', 'sharpen', 'smudge', 'dodge_burn',
				'sponge', 'liquify', 'bulge_pinch'],
			//Pen, Type, Shapes, Hand
			['pen', 'text', 'shape', 'hand'],
			//Zoom, Animation
			['zoom', 'animation'],
		];
		const result = [];
		const used = {};
		for (let g = 0; g < groups.length; g++) {
			for (let k = 0; k < groups[g].length; k++) {
				for (const i in config.TOOLS) {
					if (config.TOOLS[i].name == groups[g][k]) {
						result.push({tool: config.TOOLS[i], group: g});
						used[config.TOOLS[i].name] = true;
					}
				}
			}
		}
		for (const j in config.TOOLS) {
			if (used[config.TOOLS[j].name] != true) {
				result.push({tool: config.TOOLS[j], group: groups.length});
			}
		}
		return result;
	}

	/**
	 * disables tools that work only with raster layers while a vector layer is active
	 */
	update_disabled_tools() {
		const container = document.getElementById('tools_container');
		if (!container) {
			return;
		}
		const layer = config.layer;
		container.querySelectorAll('.item').forEach((button) => {
			const disabled = is_tool_disabled(button.id, layer);
			button.classList.toggle('disabled', disabled);
			if (disabled) {
				button.setAttribute('aria-disabled', 'true');
			}
			else {
				button.removeAttribute('aria-disabled');
			}
		});
		//the empty first layer becomes a picture when the tool needs one
		if (needs_raster_layer(this.active_tool, layer) && this.tool_switching != true) {
			this.tool_switching = true;
			Promise.resolve(new Layer_raster_class().raster_empty()).finally(() => {
				this.tool_switching = false;
			});
			return;
		}
		//the active tool can not stay on a layer it does not work on
		if (is_tool_disabled(this.active_tool, layer) && this.tool_switching != true) {
			this.tool_switching = true;
			this.activate_tool('select').finally(() => {
				this.tool_switching = false;
			});
		}
	}

	async activate_tool(key) {
		if (is_tool_disabled(key, config.layer)) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (needs_raster_layer(key, config.layer)) {
			//the empty first layer has no pixels: it becomes a transparent picture and the tool is chosen, in one step of
			//the history (one Undo takes back both)
			const actions = new Layer_raster_class().empty_actions();
			actions.push(new app.Actions.Activate_tool_action(key));
			return app.State.do_action(new app.Actions.Bundle_action('convert_to_raster', 'Convert to Raster', actions));
		}
		return app.State.do_action(
			new app.Actions.Activate_tool_action(key)
		);
	}

	action_data() {
		for (const i in config.TOOLS) {
			if (config.TOOLS[i].name == this.active_tool)
				return config.TOOLS[i];
		}

		//something wrong - select first tool
		this.active_tool = config.TOOLS[0].name;
		return config.TOOLS[0];
	}

	/**
	 * @returns {{key: string, title: string}[]} the shape tools (rectangle, ellipse, star...), sorted by title
	 */
	get_shape_tools() {
		const list = [];
		for (const key in this.tools_modules) {
			const module = this.tools_modules[key];
			if (is_shape_module(module.full_key)) {
				list.push({key: module.name || key, title: module.title || key});
			}
		}
		return sort_shapes(list);
	}

	/**
	 * @param {string} key a tool
	 * @returns {boolean} the tool is one of the shapes
	 */
	is_shape_tool(key) {
		return this.get_shape_tools().some((shape) => shape.key == key);
	}

	/**
	 * @returns {string} the shape that the Shape button activates (the last used one, the rectangle at first)
	 */
	get_last_shape() {
		let stored = this.last_shape;
		if (stored === undefined) {
			try {
				stored = localStorage.getItem(LAST_SHAPE_KEY);
			}
			catch {
				stored = null;
			}
		}
		return pick_shape(stored, this.get_shape_tools().map((shape) => shape.key));
	}

	/**
	 * The Shape button stays pressed while any of the shapes is the active tool, and the shape is remembered
	 */
	sync_shape_button() {
		const button = document.querySelector('#tools_container .shape');
		if (!button) {
			return;
		}
		const on = this.is_shape_tool(this.active_tool) || this.active_tool == 'shape';
		button.classList.toggle('active', on);
		button.setAttribute('aria-checked', on ? 'true' : 'false');
		if (this.is_shape_tool(this.active_tool)) {
			this.last_shape = this.active_tool;
			try {
				localStorage.setItem(LAST_SHAPE_KEY, this.active_tool);
			}
			catch {
				//storage can be blocked, the shape is still remembered for the session
			}
		}
	}

	/**
	 * Chooses a shape; when another shape is active, its border and fill follow the user to the new one
	 *
	 * @param {string} key a shape tool
	 */
	switch_shape(key) {
		const next = config.TOOLS.find((tool) => tool.name == key);
		if (next && this.is_shape_tool(this.active_tool) && this.active_tool != key) {
			carry_shape_options(this.action_data().attributes, next.attributes);
		}
		return this.activate_tool(key);
	}

	/**
	 * The "Shape" picker at the start of the options bar of every shape: choose another shape without going back to
	 * the gallery, and a button that opens the gallery with previews.
	 *
	 * @param {HTMLElement} container the options bar
	 */
	render_shape_picker(container) {
		const wrapper = document.createElement('div');
		wrapper.className = 'item shape_picker';
		const label = document.createElement('label');
		label.className = 'trn';
		label.id = 'attribute_label_shape_picker';
		label.textContent = `${t('Shape')}:`;
		const select = document.createElement('select');
		select.id = 'shape_picker';
		select.setAttribute('aria-labelledby', label.id);
		this.get_shape_tools().forEach((shape) => {
			const option = document.createElement('option');
			option.value = shape.key;
			option.textContent = t(shape.title);
			option.selected = shape.key == this.active_tool;
			select.appendChild(option);
		});
		select.addEventListener('change', () => this.switch_shape(select.value));
		const gallery = document.createElement('button');
		gallery.type = 'button';
		gallery.className = 'trn';
		gallery.textContent = t('Shape Gallery…');
		gallery.addEventListener('click', () => this.tools_modules.shape.object.show_shapes());
		wrapper.append(label, select, gallery);
		container.appendChild(wrapper);
	}

	/**
	 * used strings:
	 * "Fill", "Square", "Circle", "Radial", "Anti aliasing", "Circle", "Strict", "Burn"
	 */
	show_action_attributes() {
		let elementTitle;
		const target_id = "action_attributes";

		const itemContainer = document.getElementById(target_id);

		itemContainer.innerHTML = "";

		const attributes = this.action_data().attributes;
		this.sync_shape_button();
		if (this.is_shape_tool(this.active_tool)) {
			this.render_shape_picker(itemContainer);
		}

		let itemDom;
		let currentButtonGroup = null;
		for (const k in attributes) {
			const item = attributes[k];

			let title = k[0].toUpperCase() + k.slice(1);
			title = title.replace("_", " ");

			if (typeof item == 'object' && typeof item.value == 'boolean' && item.icon) {
				if (currentButtonGroup == null) {
					currentButtonGroup = document.createElement('div');
					currentButtonGroup.className = 'ui_button_group no_wrap';
					itemDom = document.createElement('div');
					itemDom.className = `item ${  k}`;
					itemContainer.appendChild(itemDom);
					itemDom.appendChild(currentButtonGroup);
				} else {
					itemDom.classList.add(k);
				}
			} else {
				itemDom = document.createElement('div');
				itemDom.className = `item ${  k}`;
				itemContainer.appendChild(itemDom);
				currentButtonGroup = null;
			}

			if (typeof item == 'boolean' || (typeof item == 'object' && typeof item.value == 'boolean')) {
				//boolean - true, false

				let value = item;
				let icon = null;
				if (typeof item == 'object') {
					value = item.value;
					if (item.icon) {
						icon = item.icon;
					}
				}

				const element = document.createElement('button');
				element.className = 'trn';
				element.type = 'button';
				element.id = k;
				element.innerHTML = title;
				element.setAttribute('aria-pressed', value);
				if (icon) {
					element.classList.add('ui_icon_button');
					element.classList.add('input_height');
					element.innerHTML = icon;
					element.title = k;
					element.innerHTML = `<img style="width:16px;height:16px;" alt="${title}" src="images/icons/${icon}" />`;
				} else {
					element.classList.add('ui_toggle_button');
				}
				//event
				element.addEventListener('click', (event) => {
					//toggle boolean
					const new_value = element.getAttribute('aria-pressed') !== 'true';
					const actionData = this.action_data();
					const attributes = actionData.attributes;
					const id = event.target.closest('button').id;
					if (typeof attributes[id] === 'object') {
						attributes[id].value = new_value;
					} else {
						attributes[id] = new_value;
					}
					element.setAttribute('aria-pressed', new_value);
					if (actionData.on_update != undefined) {
						//send event
						const moduleKey = actionData.name;
						const functionName = actionData.on_update;
						this.tools_modules[moduleKey].object[functionName]({ key: id, value: new_value });
					}
				});

				if (currentButtonGroup) {
					currentButtonGroup.appendChild(element);
				} else {
					itemDom.appendChild(element);
				}
			}
			else if (typeof item == 'number' || (typeof item == 'object' && typeof item.value == 'number')) {
				//numbers
				let min = 1;
				let max = k === 'power' ? 100 : 999;
				let value = item;
				let step = null;
				if (typeof item == 'object') {
					value = item.value;
					if (item.min != null) {
						min = item.min;
					}
					if (item.max != null) {
						max = item.max;
					}
					if (item.step != null) {
						step = item.step;
					}
				}

				elementTitle = document.createElement('label');
				elementTitle.innerHTML = `${title  }:`;
				elementTitle.id = `attribute_label_${  k}`;
				elementTitle.className = 'trn';

				const elementInput = document.createElement('input');
				elementInput.type = 'number';
				elementInput.setAttribute('aria-labelledby', `attribute_label_${  k}`);
				const $numberInput = $(elementInput)
					.uiNumberInput({
						id: k,
						min,
						max,
						value,
						step: step || 1,
						exponentialStepButtons: !step
					})
					.on('input', () => {
						const value = $numberInput.uiNumberInput('get_value');
						const id = $numberInput.uiNumberInput('get_id');
						const actionData = this.action_data();
						const attributes = actionData.attributes;
						if (typeof attributes[id] === 'object') {
							attributes[id].value = value;
						} else {
							attributes[id] = value;
						}

						if (actionData.on_update != undefined) {
							//send event
							const moduleKey = actionData.name;
							const functionName = actionData.on_update;
							this.tools_modules[moduleKey].object[functionName]({ key: id, value });
						}
					});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild($numberInput[0]);
			}
			else if (typeof item == 'object') {
				//select

				elementTitle = document.createElement('label');
				elementTitle.innerHTML = `${title  }:`;
				elementTitle.for = k;
				elementTitle.className = 'trn';

				const selectList = document.createElement("select");
				selectList.id = k;
				const values = typeof item.values === 'function' ? item.values() : item.values;
				for (const j in values) {
					const option = document.createElement("option");
					if (item.value == values[j]) {
						option.selected = 'selected';
					}
					option.className = 'trn';
					option.name = values[j];
					option.value = values[j];
					option.text = values[j];
					selectList.appendChild(option);
				}
				//event
				selectList.addEventListener('change', (event) => {
					const actionData = this.action_data();
					actionData.attributes[event.target.id].value = event.target.value;

					if (actionData.on_update != undefined) {
						//send event
						const moduleKey = actionData.name;
						const functionName = actionData.on_update;
						const result = this.tools_modules[moduleKey].object[functionName]({ key: event.target.id, value: event.target.value });
						if (result) {
							// Allow the on_update function to modify the attribute value if necessary.
							if (result.new_values) {
								for (const key in result.new_values) {
									actionData.attributes[key].value = result.new_values[key];
								}
							}
						}
					}

					this.show_action_attributes();
				});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild(selectList);
			}
			else if (typeof item == 'string' && item[0] == '#') {
				//color

				elementTitle = document.createElement('label');
				elementTitle.innerHTML = `${title  }:`;
				elementTitle.for = k;
				elementTitle.className = 'trn';

				const colorInput = document.createElement('input');
				colorInput.type = 'color';
				const $colorInput = $(colorInput)
					.uiColorInput({
						id: k,
						value: item
					})
					.on('change', () => {
						const value = $colorInput.uiColorInput('get_value');
						const id = $colorInput.uiColorInput('get_id');
						const actionData = this.action_data();
						actionData.attributes[id] = value;
						if (actionData.on_update != undefined) {
							//send event
							const moduleKey = actionData.name;
							const functionName = actionData.on_update;
							this.tools_modules[moduleKey].object[functionName]({ key: id, value });
						}
					});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild($colorInput[0]);
			}
			else {
				alertify.error(`${t('Error: unsupported attribute type:') + typeof item  }, ${  k}`);
			}
		}

		//the Move tool also shows the numeric transform bar (X, Y, W, H, angle)
		if (app.GUI && app.GUI.GUI_transform_bar) {
			app.GUI.GUI_transform_bar.render();
		}

		if (config.LANG != 'en') {
			//retranslate
			this.Tools_translate.translate(config.LANG);
		}
	}

}

export default GUI_tools_class;
