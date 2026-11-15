import config from './../config.js';
import Base_pixel_tool_class from './../core/base-pixel-tool.js';
import { recolor_dab, parse_paint_color } from './../libs/color-replace.js';

/**
 * Color Replacement - paints the foreground color over the picture but keeps its light and shade (see
 * libs/color-replace.js); pixels that are transparent stay transparent. Only colors close to the one under the center
 * of the brush are changed (Tolerance), so a stroke can recolor a shirt without touching the skin next to it.
 */
class Color_replace_class extends Base_pixel_tool_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'color_replace';
		this.history_name = 'Color Replacement';
		this.spacing_factor = 5;
		this.reference = null;
	}

	/**
	 * "Once" sampling: the color under the first click is the one that is replaced for the whole stroke
	 */
	begin(ctx, position) {
		this.reference = null;
		const x = Math.round(position.x);
		const y = Math.round(position.y);
		if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
			const pixel = ctx.getImageData(x, y, 1, 1).data;
			this.reference = [pixel[0], pixel[1], pixel[2]];
		}
	}

	end() {
		this.reference = null;
	}

	stamp(ctx, position, size, params) {
		const paint = parse_paint_color(config.COLOR);
		if (paint == null) {
			return;
		}
		this.with_region(ctx, position, size / 2 + 1, (image, x, y) => {
			recolor_dab(image, x, y, size / 2, params.hardness, params.opacity, paint, params.tolerance, params.sampling == 'Continuous' ? null : this.reference);
		});
	}
}

export default Color_replace_class;
