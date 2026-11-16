import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import Helper_class from './../../libs/helpers.js';
import Edit_selection_class from './selection.js';
import { blend_with_mask } from './../../libs/selection-mask.js';
import Dialog_class from './../../libs/popup.js';
import { FILL_CONTENTS, FILL_MODES, fill_operation, fill_color, clean_fill_options } from './../../libs/fill-options.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';

let instance = null;

//picture used by Edit > Fill with Pattern (set by Edit > Define Pattern)
let pattern_canvas = null;

/**
 * Edit > Fill with foreground color (Alt+Backspace, as in Photoshop).
 * Fills active selection, or whole layer if nothing is selected.
 */
/**
 * @returns {HTMLCanvasElement|null} the pattern defined by Edit > Define Pattern (null when there is none)
 */
export function get_pattern_canvas() {
	return pattern_canvas;
}

class Edit_fill_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
		this.Helper = new Helper_class();
		this.Edit_selection = new Edit_selection_class();
	}

	/**
	 * Edit > Define Pattern - the selected part of the picture becomes the pattern for Fill with Pattern
	 */
	define_pattern() {
		const part = this.Edit_selection.get_selection_canvas(null, true);
		if (part == null) {
			alertify.error(t('Select a part of the picture first.'));
			return;
		}
		pattern_canvas = part.canvas;
		alertify.success(t('Pattern defined.'));
	}

	/**
	 * Edit > Fill with Pattern
	 */
	fill_pattern() {
		if (pattern_canvas == null) {
			alertify.warning(t('Define a pattern first (Edit > Define Pattern).'));
			return;
		}
		this.use_pattern = true;
		try {
			return this.fill();
		}
		finally {
			this.use_pattern = false;
		}
	}

	/**
	 * Edit > Fill... (Photoshop): the contents (the colors, the pattern, black, white, 50 % gray), the blend mode and the
	 * opacity of the fill, then the same fill as the quick commands (selection, soft masks, empty layer)
	 */
	fill_dialog() {
		new Dialog_class().show({
			title: 'Fill',
			params: [
				{name: 'contents', title: 'Contents:', type: 'select', values: FILL_CONTENTS, value: FILL_CONTENTS[0]},
				{name: 'mode', title: 'Mode:', type: 'select', values: FILL_MODES, value: FILL_MODES[0]},
				{name: 'opacity', title: 'Opacity:', value: 100, range: [1, 100]},
			],
			on_finish: (params) => {
				this.options = clean_fill_options(params);
				try {
					return this.fill();
				}
				finally {
					this.options = null;
				}
			},
		});
	}

	/**
	 * Edit > Fill with Background Color (Ctrl+Backspace)
	 */
	fill_background() {
		this.use_background = true;
		try {
			this.fill();
		}
		finally {
			this.use_background = false;
		}
	}

	/**
	 * @param {object|null} [mask] fill through this mask instead of the current selection (Edit > Stroke Selection)
	 * @param {object|null} [extra] contents / color, mode and opacity as the Fill dialog returns them (cleaned here)
	 */
	fill(mask, extra) {
		const layer = config.layer;
		if (layer.type != 'image' && layer.type !== null) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (layer.is_vector == true) {
			alertify.error(t('Layer is vector, convert it to raster to apply this tool.'));
			return;
		}

		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext("2d");
		let scale_x = 1;
		let scale_y = 1;
		let offset_x = 0;
		let offset_y = 0;
		if (layer.type !== null) {
			canvas.width = layer.width_original;
			canvas.height = layer.height_original;
			ctx.drawImage(layer.link, 0, 0);
			scale_x = layer.width_original / layer.width;
			scale_y = layer.height_original / layer.height;
			offset_x = layer.x;
			offset_y = layer.y;
		}
		else {
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
		}

		//the dialog sets this.options, the quick commands use the colors with their own opacity
		const options = extra ? clean_fill_options(extra) : (this.options || null);
		const use_background = options ? options.contents == 'Background Color' : this.use_background;
		const own = options ? (options.color || fill_color(options.contents, config.COLOR, config.COLOR_BG)) : null;
		const color = this.Helper.hexToRgb(own || (use_background ? config.COLOR_BG : config.COLOR));
		const alpha = options ? 1 : (this.use_background ? 1 : config.ALPHA / 255);
		ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
		if ((options ? options.contents == 'Pattern' : this.use_pattern) && pattern_canvas) {
			ctx.fillStyle = ctx.createPattern(pattern_canvas, 'repeat');
		}
		else if (options && options.contents == 'Pattern') {
			alertify.warning(t('Define a pattern first (Edit > Define Pattern).'));
			return;
		}
		if (options) {
			ctx.globalAlpha = options.opacity / 100;
			ctx.globalCompositeOperation = fill_operation(options.mode);
		}

		const selection = this.Selection.selection;
		const current = mask && mask.data ? {kind: 'custom', mask} : this.Edit_selection.get_mask();
		if (current != null && current.kind == 'custom') {
			//soft or non rectangular selection - fill, then blend through the mask
			const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			const filled = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const geometry = layer.type !== null
				? layer
				: {x: 0, y: 0, width: canvas.width, height: canvas.height};
			ctx.putImageData(blend_with_mask(original, filled, current.mask, geometry), 0, 0);
		}
		else if (selection != null && selection.width && selection.height) {
			ctx.fillRect(
				(selection.x - offset_x) * scale_x,
				(selection.y - offset_y) * scale_y,
				selection.width * scale_x,
				selection.height * scale_y
			);
		}
		else {
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		if (layer.type !== null) {
			return app.State.do_action(
				new app.Actions.Bundle_action('fill', 'Fill', [
					new app.Actions.Update_layer_image_action(canvas, null, {keep_alpha: true})
				])
			);
		}

		//empty layer - create new image layer
		const params = {
			type: 'image',
			name: 'Fill',
			data: canvas.toDataURL("image/png"),
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
		};
		return app.State.do_action(
			new app.Actions.Bundle_action('fill', 'Fill', [
				new app.Actions.Insert_layer_action(params)
			])
		);
	}

}

export default Edit_fill_class;
