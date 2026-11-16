import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import { fill_region } from './../libs/flood-fill.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../modules/tools/translate.js';

class Magic_erase_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'magic_erase';
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

		this.magic_erase(mouse);
	}

	async magic_erase(mouse) {
		const params = this.getParams();

		if(this.working == true){
			return;
		}

		if (config.layer.type != 'image') {
			alertify.error(t('This layer must contain an image. Please convert it to raster to apply this tool.'));
			return;
		}
		if (config.layer.is_vector == true) {
			alertify.error(t('Layer is vector, convert it to raster to apply this tool.'));
			return;
		}

		//get canvas from layer
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext("2d");
		canvas.width = config.layer.width_original;
		canvas.height = config.layer.height_original;
		ctx.drawImage(config.layer.link, 0, 0);

		let mouse_x = Math.round(mouse.x) - config.layer.x;
		let mouse_y = Math.round(mouse.y) - config.layer.y;

		//adapt to origin size
		mouse_x = this.adaptSize(mouse_x, 'width');
		mouse_y = this.adaptSize(mouse_y, 'height');

		//convert float coords to integers
		mouse_x = Math.round(mouse_x);
		mouse_y = Math.round(mouse_y);

		//change
		this.working = true;
		this.magic_erase_general(ctx, mouse_x, mouse_y, params.power, params.anti_aliasing, params.contiguous);

		app.State.do_action(
			new app.Actions.Bundle_action('magic_erase_tool', 'Magic Eraser Tool', [
				new app.Actions.Update_layer_image_action(canvas, null, {keep_alpha: true})
			])
		);
		//prevent crash bug on touch screen - hard to explain and debug
		await new Promise(r => setTimeout(r, 10));
		this.working = false;
	}

	/**
	 * apply magic erase: the pixels like the clicked one (see libs/flood-fill.js) become transparent
	 *
	 * @param {CanvasRenderingContext2D} context the layer picture
	 * @param {int} x the click in pixels of the layer picture
	 * @param {int} y
	 * @param {int} tolerance max 100
	 * @param {Boolean} anti_aliasing soften the edge of the erased area
	 * @param {Boolean} contiguous only the area connected with the click
	 * @returns {boolean} false when there was nothing to erase
	 */
	magic_erase_general(context, x, y, tolerance, anti_aliasing, contiguous) {
		const W = context.canvas.width;
		const H = context.canvas.height;
		x = Math.round(x);
		y = Math.round(y);
		const img = context.getImageData(0, 0, W, H);
		if (x < 0 || y < 0 || x >= W || y >= H || img.data[(y * W + x) * 4 + 3] == 0) {
			return false; //outside, or already transparent
		}
		const mask = fill_region(img.data, W, H, x, y, tolerance, contiguous);
		const erased = new ImageData(W, H);
		for (let p = 0; p < mask.length; p++) {
			if (mask[p]) {
				erased.data[p * 4 + 3] = 255;
			}
		}
		//destination-out + blur = anti-aliasing
		const canvasTemp = document.createElement('canvas');
		canvasTemp.width = W;
		canvasTemp.height = H;
		canvasTemp.getContext('2d').putImageData(erased, 0, 0);
		context.globalCompositeOperation = "destination-out";
		if (anti_aliasing == true) {
			context.filter = 'blur(1px)';
		}
		context.drawImage(canvasTemp, 0, 0);
		return true;
	}

}
export default Magic_erase_class;
