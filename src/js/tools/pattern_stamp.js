import Base_pixel_tool_class from './../core/base-pixel-tool.js';
import { get_pattern_canvas } from './../modules/edit/fill.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../modules/tools/translate.js';

/**
 * Pattern Stamp - paints with the pattern from Edit > Define Pattern; the pattern is tiled from the top left
 * corner of the layer, so strokes line up with each other.
 */
class Pattern_stamp_class extends Base_pixel_tool_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'pattern_stamp';
		this.history_name = 'Pattern Stamp';
		this.spacing_factor = 5;
	}

	mousedown(e) {
		if (!get_pattern_canvas()) {
			if (this.get_mouse_info(e).click_valid) {
				alertify.warning(t('Define a pattern first (Edit > Define Pattern).'));
			}
			this.started = false;
			return;
		}
		super.mousedown(e);
	}

	stamp(ctx, position, size, params) {
		const pattern = get_pattern_canvas();
		if (!pattern) {
			return;
		}
		const hardness = Math.min(100, Math.max(0, parseFloat(params.hardness) || 0)) / 100;
		const opacity = Math.min(100, Math.max(1, parseFloat(params.opacity) || 100)) / 100;
		const diameter = Math.max(1, Math.round(size));
		const radius = diameter / 2;
		const x = Math.round(position.x - radius);
		const y = Math.round(position.y - radius);

		//the pattern under the brush, in the coordinates of the layer so that it tiles from the corner
		const piece = document.createElement('canvas');
		piece.width = diameter;
		piece.height = diameter;
		const piece_ctx = piece.getContext('2d');
		piece_ctx.translate(-x, -y);
		piece_ctx.fillStyle = piece_ctx.createPattern(pattern, 'repeat');
		piece_ctx.fillRect(x, y, diameter, diameter);
		piece_ctx.setTransform(1, 0, 0, 1, 0, 0);

		//round, soft tip
		const tip = document.createElement('canvas');
		tip.width = diameter;
		tip.height = diameter;
		const tip_ctx = tip.getContext('2d');
		const gradient = tip_ctx.createRadialGradient(radius, radius, radius * hardness, radius, radius, radius);
		gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
		gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
		tip_ctx.fillStyle = gradient;
		tip_ctx.fillRect(0, 0, diameter, diameter);
		piece_ctx.globalCompositeOperation = 'destination-in';
		piece_ctx.drawImage(tip, 0, 0);

		ctx.drawImage(piece, x, y);
	}
}

export default Pattern_stamp_class;
