/**
 * Image > Reveal All (Photoshop): the canvas grows so that every layer fits into it. Pure functions, no DOM.
 */

/**
 * The bounding box of a layer in document pixels, including its rotation around the center.
 *
 * @param {{x: *, y: *, width: *, height: *, rotate?: *}} layer
 * @returns {{left: number, top: number, right: number, bottom: number}|null} null for a layer without a size
 */
export function layer_box(layer) {
	if (!layer) {
		return null;
	}
	const x = Number(layer.x);
	const y = Number(layer.y);
	const w = Number(layer.width);
	const h = Number(layer.height);
	if (![x, y, w, h].every(isFinite) || w <= 0 || h <= 0) {
		return null;
	}
	const angle = (Number(layer.rotate) || 0) * Math.PI / 180;
	const cos = Math.abs(Math.cos(angle));
	const sin = Math.abs(Math.sin(angle));
	const half_w = (w * cos + h * sin) / 2;
	const half_h = (w * sin + h * cos) / 2;
	const cx = x + w / 2;
	const cy = y + h / 2;
	return {left: cx - half_w, top: cy - half_h, right: cx + half_w, bottom: cy + half_h};
}

/**
 * @param {Array} layers
 * @param {number} width current canvas width
 * @param {number} height current canvas height
 * @param {number} [max] the largest allowed canvas side
 * @returns {{width: number, height: number, dx: number, dy: number}} the new size and how far the layers move
 *   (the canvas only grows, a layer sticking out to the left / top moves the content right / down)
 */
export function reveal_all_size(layers, width, height, max = 20000) {
	let left = 0;
	let top = 0;
	let right = width;
	let bottom = height;
	for (const layer of layers || []) {
		const box = layer_box(layer);
		if (box) {
			left = Math.min(left, box.left);
			top = Math.min(top, box.top);
			right = Math.max(right, box.right);
			bottom = Math.max(bottom, box.bottom);
		}
	}
	left = Math.floor(left) || 0;
	top = Math.floor(top) || 0;
	const new_width = Math.min(max, Math.ceil(right) - left);
	const new_height = Math.min(max, Math.ceil(bottom) - top);
	return {width: new_width, height: new_height, dx: 0 - left, dy: 0 - top};
}
