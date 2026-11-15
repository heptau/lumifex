import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Edit_selection_class from './../edit/selection.js';
import { t } from '../tools/translate.js';

/**
 * Layer > Stamp Visible - a new layer with the merged picture of all visible layers; the layers stay as they are
 */
class Layer_stamp_class {

	stamp_visible() {
		const canvas = new Edit_selection_class().get_merged_canvas();
		app.State.do_action(
			new app.Actions.Bundle_action('stamp_visible', 'Stamp Visible', [
				new app.Actions.Insert_layer_action({
					name: t('Stamp'),
					type: 'image',
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
					data: canvas.toDataURL('image/png'),
				}, false),
			])
		);
	}

	/**
	 * Layer > Merge Visible - the visible layers are replaced by one layer with their merged picture; hidden
	 * layers stay. One undo step.
	 */
	merge_visible() {
		const visible = config.layers.filter((layer) => layer.visible);
		if (visible.length < 2) {
			alertify.warning(t('There are fewer than two visible layers.'));
			return;
		}
		const canvas = new Edit_selection_class().get_merged_canvas();
		app.State.do_action(
			new app.Actions.Bundle_action('merge_visible', 'Merge Visible', [
				new app.Actions.Insert_layer_action({
					name: t('Merged'),
					type: 'image',
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
					data: canvas.toDataURL('image/png'),
				}, false),
				...visible.map((layer) => new app.Actions.Delete_layer_action(layer.id)),
			])
		);
	}
}

export default Layer_stamp_class;
