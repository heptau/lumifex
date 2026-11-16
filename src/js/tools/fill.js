import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import { fill_region } from './../libs/flood-fill.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../modules/tools/translate.js';

class Fill_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'fill';
		this.working = false;
	}

	dragStart(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousedown(event);
	}

	load() {

		//mouse events
		document.addEventListener('mousedown', (event) => {
			this.dragStart(event);
		});

		// collect touch events
		document.addEventListener('touchstart', (event) => {
			this.dragStart(event);
		});
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error(t('Erase on rotate object is disabled. Please rasterize first.'));
			return;
		}

		this.fill(mouse);
	}

	async fill(mouse) {
		let params = this.getParams();

		if(this.working == true){
			return;
		}

		if (config.layer.type != 'image' && config.layer.type !== null) {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (config.layer.is_vector == true) {
			alertify.error(t('Layer is vector, convert it to raster to apply this tool.'));
			return;
		}
		if (config.ALPHA == 0) {
			alertify.error(t('Color alpha value can not be zero.'));
			return;
		}

		//get canvas from layer
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext("2d");
		if (config.layer.type !== null) {
			canvas.width = config.layer.width_original;
			canvas.height = config.layer.height_original;
			ctx.drawImage(config.layer.link, 0, 0);
		}
		else {
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
		}

		let mouse_x = Math.round(mouse.x) - config.layer.x;
		let mouse_y = Math.round(mouse.y) - config.layer.y;

		//adapt to origin size
		mouse_x = this.adaptSize(mouse_x, 'width');
		mouse_y = this.adaptSize(mouse_y, 'height');

		//convert float coords to integers
		mouse_x = Math.round(mouse_x);
		mouse_y = Math.round(mouse_y);

		const color_to = this.Helper.hexToRgb(config.COLOR);
		color_to.a = config.ALPHA;

		//change
		this.working = true;
		this.fill_general(ctx, mouse_x, mouse_y, color_to, params.power, params.anti_aliasing, params.contiguous);

		if (config.layer.type != null) {
			//update
			app.State.do_action(
				new app.Actions.Bundle_action('fill_tool', 'Fill Tool', [
					new app.Actions.Update_layer_image_action(canvas, null, {keep_alpha: true})
				])
			);
		}
		else {
			//create new
			params = [];
			params.type = 'image';
			params.name = 'Fill';
			params.data = canvas.toDataURL("image/png");
			params.x = parseInt(canvas.dataset.x) || 0;
			params.y = parseInt(canvas.dataset.y) || 0;
			params.width = canvas.width;
			params.height = canvas.height;
			app.State.do_action(
				new app.Actions.Bundle_action('fill_tool', 'Fill Tool', [
					new app.Actions.Insert_layer_action(params)
				])
			);
		}

		//prevent crash bug on touch screen - hard to explain and debug
		await new Promise(r => setTimeout(r, 10));
		this.working = false;
	}

	/**
	 * Paints the color over the pixels that fill_region picks (the ones like the clicked pixel), on the picture of the layer
	 *
	 * @param {CanvasRenderingContext2D} context the layer picture
	 * @param {number} x the click in pixels of the layer picture
	 * @param {number} y
	 * @param {{r: number, g: number, b: number, a: number}} color_to
	 * @param {number} tolerance 0-100 %
	 * @param {boolean} anti_aliasing soften the edge of the filled area
	 * @param {boolean} contiguous only the area connected with the click
	 * @returns {boolean} false when the clicked pixel already has the color
	 */
	fill_general(context, x, y, color_to, tolerance, anti_aliasing, contiguous) {
		const W = context.canvas.width;
		const H = context.canvas.height;
		x = Math.round(x);
		y = Math.round(y);
		const img = context.getImageData(0, 0, W, H);
		const k = (y * W + x) * 4;
		if (x >= 0 && y >= 0 && x < W && y < H
			&& img.data[k] == color_to.r && img.data[k + 1] == color_to.g && img.data[k + 2] == color_to.b && img.data[k + 3] == color_to.a) {
			return false;
		}
		const mask = fill_region(img.data, W, H, x, y, tolerance, contiguous);
		const painted = new ImageData(W, H);
		for (let p = 0; p < mask.length; p++) {
			if (mask[p]) {
				painted.data[p * 4] = color_to.r;
				painted.data[p * 4 + 1] = color_to.g;
				painted.data[p * 4 + 2] = color_to.b;
				painted.data[p * 4 + 3] = color_to.a;
			}
		}
		const canvasTemp = document.createElement('canvas');
		canvasTemp.width = W;
		canvasTemp.height = H;
		canvasTemp.getContext('2d').putImageData(painted, 0, 0);
		if (anti_aliasing == true) {
			context.filter = 'blur(1px)';
		}
		context.drawImage(canvasTemp, 0, 0);
		return true;
	}

}
export default Fill_class;
