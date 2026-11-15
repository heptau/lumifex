import config from './../config.js';
import Base_pixel_tool_class from './../core/base-pixel-tool.js';
import { recolor_dab, parse_paint_color } from './../libs/color-replace.js';

/**
 * Color Replacement - paints the foreground color over the picture but keeps its light and shade (see
 * libs/color-replace.js); pixels that are transparent stay transparent.
 */
class Color_replace_class extends Base_pixel_tool_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'color_replace';
		this.history_name = 'Color Replacement';
		this.spacing_factor = 5;
	}

	stamp(ctx, position, size, params) {
		const paint = parse_paint_color(config.COLOR);
		if (paint == null) {
			return;
		}
		this.with_region(ctx, position, size / 2 + 1, (image, x, y) => {
			recolor_dab(image, x, y, size / 2, params.hardness, params.opacity, paint);
		});
	}
}

export default Color_replace_class;
