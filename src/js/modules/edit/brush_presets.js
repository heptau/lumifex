import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Dialog_class from './../../libs/popup.js';
import { STORAGE_KEY, snapshot_attributes, apply_preset, parse_presets, add_preset, remove_preset } from './../../libs/brush-presets.js';
import { t } from '../tools/translate.js';

/**
 * Edit > Save Brush Preset… / Load Brush Preset… - the options of the Brush (size, hardness, spacing, scatter, jitter,
 * symmetry...) kept under a name in localStorage, so a favourite brush is one choice away.
 */
class Edit_brush_presets_class {

	/**
	 * @returns {object|undefined} the Brush in the list of tools
	 */
	brush() {
		return config.TOOLS.find((tool) => tool.name == 'brush');
	}

	read() {
		try {
			return parse_presets(localStorage.getItem(STORAGE_KEY));
		}
		catch {
			return [];
		}
	}

	write(list) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
			return true;
		}
		catch {
			alertify.error(t('Brush presets could not be saved.'));
			return false;
		}
	}

	/**
	 * Saves the current options of the Brush under a name (the same name replaces the preset)
	 */
	save() {
		const brush = this.brush();
		if (!brush) {
			return;
		}
		new Dialog_class().show({
			title: 'Save Brush Preset',
			params: [
				{name: 'name', title: 'Name:', value: t('My brush')},
			],
			on_finish: (params) => {
				const list = add_preset(this.read(), params.name, snapshot_attributes(brush.attributes));
				if (list == null) {
					alertify.error(t('Enter a name for the preset.'));
					return;
				}
				if (this.write(list)) {
					alertify.success(t('Brush preset saved.'));
				}
			},
		});
	}

	/**
	 * Chooses a preset: the Brush gets its options and becomes the active tool
	 */
	load() {
		const brush = this.brush();
		const list = this.read();
		if (!brush) {
			return;
		}
		if (list.length == 0) {
			alertify.warning(t('There are no brush presets yet. Use Edit > Save Brush Preset.'));
			return;
		}
		new Dialog_class().show({
			title: 'Load Brush Preset',
			params: [
				{name: 'name', title: 'Preset:', values: list.map((item) => item.name), value: list[0].name},
				{name: 'remove', title: 'Delete this preset instead:', value: false},
			],
			on_finish: async (params) => {
				if (params.remove === true) {
					this.write(remove_preset(list, params.name));
					return;
				}
				const preset = list.find((item) => item.name == params.name);
				if (!preset) {
					return;
				}
				apply_preset(brush.attributes, preset.values);
				if (brush.attributes.tip && brush.attributes.tip.value == 'Custom' && !config.brush_tip) {
					brush.attributes.tip.value = 'Round'; //there is no custom tip in this session
				}
				await app.State.do_action(new app.Actions.Activate_tool_action('brush'));
				app.GUI.GUI_tools.show_action_attributes();
				config.need_render = true;
			},
		});
	}
}

export default Edit_brush_presets_class;
