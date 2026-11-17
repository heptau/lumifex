/**
 * Object Selection (Photoshop): a rectangle drawn around an object selects the object inside it. The part of the
 * picture inside the rectangle is cut out, its background is found from the edges of the rectangle
 * (`select_subject_mask`) and only the largest region that is left is kept. Pure functions.
 */
import { create_mask, select_subject_mask } from './selection-mask.js';

/**
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {number} width of the picture
 * @param {number} height of the picture
 * @returns {{x: number, y: number, width: number, height: number}|null} the rectangle inside the picture
 */
export function clip_rect(rect, width, height) {
	const x0 = Math.max(0, Math.floor(Math.min(rect.x, rect.x + rect.width)));
	const y0 = Math.max(0, Math.floor(Math.min(rect.y, rect.y + rect.height)));
	const x1 = Math.min(width, Math.ceil(Math.max(rect.x, rect.x + rect.width)));
	const y1 = Math.min(height, Math.ceil(Math.max(rect.y, rect.y + rect.height)));
	if (x1 - x0 < 3 || y1 - y0 < 3) {
		return null;
	}
	return {x: x0, y: y0, width: x1 - x0, height: y1 - y0};
}

/**
 * Keeps only the largest connected region of the mask (values >= 128 count as inside); soft edges around it stay.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} mask
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function largest_region(mask) {
	const {width, height} = mask;
	const labels = new Int32Array(width * height);
	let best = 0;
	let best_size = 0;
	let label = 0;
	const stack = [];
	for (let start = 0; start < labels.length; start++) {
		if (labels[start] !== 0 || mask.data[start] < 128) {
			continue;
		}
		label++;
		let size = 0;
		labels[start] = label;
		stack.push(start);
		while (stack.length) {
			const p = stack.pop();
			size++;
			const x = p % width;
			const y = (p - x) / width;
			const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
			for (const q of neighbours) {
				if (q >= 0 && labels[q] === 0 && mask.data[q] >= 128) {
					labels[q] = label;
					stack.push(q);
				}
			}
		}
		if (size > best_size) {
			best_size = size;
			best = label;
		}
	}
	const result = create_mask(width, height);
	if (best === 0) {
		return result;
	}
	//the soft edge (values below 128) next to the kept region stays, other regions are dropped
	for (let p = 0; p < labels.length; p++) {
		if (labels[p] === best) {
			result.data[p] = mask.data[p];
		}
		else if (mask.data[p] > 0 && mask.data[p] < 128) {
			const x = p % width;
			const near = (x > 0 && labels[p - 1] === best) || (x < width - 1 && labels[p + 1] === best)
				|| (p >= width && labels[p - width] === best) || (p + width < labels.length && labels[p + width] === best);
			if (near) {
				result.data[p] = mask.data[p];
			}
		}
	}
	return result;
}

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image the whole picture
 * @param {{x: number, y: number, width: number, height: number}} rect drawn around the object (picture coordinates)
 * @param {number} tolerance 0-255 how different from the edge colors the background may be
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} a mask of the size of the picture
 */
export function object_in_rect_mask(image, rect, tolerance) {
	const result = create_mask(image.width, image.height);
	const box = clip_rect(rect, image.width, image.height);
	if (!box) {
		return result;
	}
	const crop = {width: box.width, height: box.height, data: new Uint8ClampedArray(box.width * box.height * 4)};
	for (let y = 0; y < box.height; y++) {
		const from = ((box.y + y) * image.width + box.x) * 4;
		crop.data.set(image.data.subarray(from, from + box.width * 4), y * box.width * 4);
	}
	const tol = Math.min(255, Math.max(0, Number.isFinite(Number(tolerance)) ? Number(tolerance) : 32));
	const subject = largest_region(select_subject_mask(crop, tol, 1));
	for (let y = 0; y < box.height; y++) {
		result.data.set(subject.data.subarray(y * box.width, (y + 1) * box.width), (box.y + y) * image.width + box.x);
	}
	return result;
}
