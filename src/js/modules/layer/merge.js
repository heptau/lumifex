import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_layers_class from './../../core/base-layers.js';
import { adjust_image, mix_adjusted } from './../../libs/adjustment-layers.js';
import { is_default as blend_if_is_default } from './../../libs/blend-if.js';
import { effective_alpha } from './../../libs/layer-groups.js';
import { is_custom_blend, canvas_operation } from './../../libs/custom-blend.js';
import { t } from '../tools/translate.js';
import Edit_selection_class from './../edit/selection.js';
import { selected_layers } from './../../core/layer-selection.js';
import { steps_to_place } from './../../libs/layer-multi.js';

class Layer_merge_class {

	/**
	 * Ctrl+E with several layers selected in the Layers panel: they become one picture layer in the place of the
	 * topmost of them (Photoshop: Merge Layers). The picture is drawn the way the canvas draws it, only with these layers.
	 */
	async merge_selected() {
		const chosen = selected_layers();
		const ids = chosen.map((layer) => layer.id);
		if (chosen.some((layer) => layer.locked === true)) {
			alertify.error(t('Layer is locked.'));
			return false;
		}
		//draw only the chosen layers: the others are hidden for a moment
		const hidden = config.layers.filter((layer) => !ids.includes(layer.id) && layer.visible);
		const shown = chosen.filter((layer) => !layer.visible);
		hidden.forEach((layer) => { layer.visible = false; });
		shown.forEach((layer) => { layer.visible = true; });
		let canvas;
		try {
			canvas = new Edit_selection_class().get_merged_canvas();
		}
		finally {
			hidden.forEach((layer) => { layer.visible = true; });
			shown.forEach((layer) => { layer.visible = false; });
		}
		const steps = steps_to_place(config.layers, ids);
		const top = chosen[chosen.length - 1];
		await app.State.do_action(
			new app.Actions.Bundle_action('merge_layers', 'Merge Layers', [
				new app.Actions.Insert_layer_action({
					name: top.name,
					type: 'image',
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					width_original: canvas.width,
					height_original: canvas.height,
					data: canvas.toDataURL('image/png'),
				}, false),
				...ids.map((id) => new app.Actions.Delete_layer_action(id)),
			])
		);
		//the new layer is on the top: move it to the place of the topmost merged layer, in the same history step
		if (steps > 0 && config.layer) {
			const merged_id = config.layer.id;
			const moves = [];
			for (let i = 0; i < steps; i++) {
				moves.push(new app.Actions.Reorder_layer_action(merged_id, -1));
			}
			await app.State.do_action(new app.Actions.Bundle_action('merge_layers', 'Merge Layers', moves), {merge_with_history: 'merge_layers'});
		}
		return true;
	}

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	merge() {
		if (selected_layers().length > 1) {
			return this.merge_selected();
		}
		if (this.Base_layers.find_previous(config.layer.id) == null) {
			alertify.error(t('There are no layers behind.'));
			return false;
		}

		//create tmp canvas
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext("2d");

		//first layer
		const previous_layer = this.Base_layers.find_previous(config.layer.id);
		const previous_id = previous_layer.id;
		if (previous_layer.type == 'adjustment') {
			alertify.error(t('Merge Down needs a picture layer below.'));
			return false;
		}
		if (is_custom_blend(previous_layer.composition)) {
			//over nothing the custom modes are Normal, only Dissolve changes the pixels
			this.Base_layers.render_blend_if(ctx, previous_layer, [], null, ctx);
		}
		else {
			ctx.globalAlpha = effective_alpha(previous_layer);
			ctx.globalCompositeOperation = canvas_operation(previous_layer.composition);
			this.Base_layers.render_object(ctx, previous_layer);
		}

		//second layer
		const current_id = config.layer.id;
		const current_order = config.layer.order;
		if (config.layer.type == 'adjustment') {
			//the adjustment is applied to the layer below (the layer mask is not used)
			const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const adjusted = adjust_image(original, config.layer.params.adjustment, config.layer.params.settings);
			mix_adjusted(original, adjusted, config.layer.opacity / 100, null);
			ctx.putImageData(new ImageData(adjusted.data, adjusted.width, adjusted.height), 0, 0);
		}
		else if (is_custom_blend(config.layer.composition) || (config.layer.blend_if && blend_if_is_default(config.layer.blend_if) == false)) {
			//Blend If and the custom blend modes look at the layer below, which is the one it is merged with (already
			//drawn on the canvas)
			ctx.globalAlpha = effective_alpha(config.layer);
			ctx.globalCompositeOperation = canvas_operation(config.layer.composition);
			this.Base_layers.render_blend_if(ctx, config.layer, [previous_layer], null, ctx);
		}
		else {
			ctx.globalAlpha = effective_alpha(config.layer);
			ctx.globalCompositeOperation = canvas_operation(config.layer.composition);
			this.Base_layers.render_object(ctx, config.layer);
		}

		//create requested layer
		const params = [];
		params.type = 'image';
		params.name = `${config.layer.name  } + merged`;
		params.order = current_order;
		params.data = canvas.toDataURL("image/png");
		app.State.do_action(
			new app.Actions.Bundle_action('merge_layers', 'Merge Layers', [
				new app.Actions.Insert_layer_action(params),
				new app.Actions.Delete_layer_action(current_id),
				new app.Actions.Delete_layer_action(previous_id)
			])
		);

		//free canvas data
		canvas.width = 1;
		canvas.height = 1;
	}

}

export default Layer_merge_class;
