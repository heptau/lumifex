/**
 * Content-Aware Scale (Photoshop) by seam carving: the picture gets narrower or lower by removing, one at a time,
 * the connected path of pixels (a seam) that carries the least detail, so faces and edges survive while flat areas
 * shrink. Pure functions on {data, width, height} (RGBA), no DOM.
 *
 * @typedef {{data: Uint8ClampedArray, width: number, height: number}} Image_data
 */

/** The most pixels that are carved (the cost grows with pixels x removed seams) */
export const MAX_CARVE_PIXELS = 2000000;

/**
 * Energy of every pixel: the sum of the absolute differences of brightness and alpha to the four neighbors
 *
 * @param {Uint8ClampedArray} data RGBA
 * @param {number} width the current width of the rows in `data`
 * @param {number} height
 * @returns {Float32Array}
 */
export function seam_energy(data, width, height) {
	const energy = new Float32Array(width * height);
	const value = (x, y, i) => {
		const p = (y * width + x) * 4;
		return i == 3 ? data[p + 3] : data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
	};
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - 1);
		const y1 = Math.min(height - 1, y + 1);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - 1);
			const x1 = Math.min(width - 1, x + 1);
			//the differences to both neighbors (not left against right), so a thin line is not invisible
			let sum = 0;
			for (const i of [0, 3]) {
				const here = value(x, y, i);
				sum += Math.abs(here - value(x0, y, i)) + Math.abs(here - value(x1, y, i))
					+ Math.abs(here - value(x, y0, i)) + Math.abs(here - value(x, y1, i));
			}
			energy[y * width + x] = sum;
		}
	}
	return energy;
}

/**
 * The cheapest vertical seam (dynamic programming from the top row down)
 *
 * @param {Float32Array} energy
 * @param {number} width
 * @param {number} height
 * @returns {Int32Array} for every row the column of the seam
 */
export function find_vertical_seam(energy, width, height) {
	const cost = new Float32Array(width * height);
	cost.set(energy.subarray(0, width));
	for (let y = 1; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let best = cost[(y - 1) * width + x];
			if (x > 0 && cost[(y - 1) * width + x - 1] < best) {
				best = cost[(y - 1) * width + x - 1];
			}
			if (x < width - 1 && cost[(y - 1) * width + x + 1] < best) {
				best = cost[(y - 1) * width + x + 1];
			}
			cost[y * width + x] = energy[y * width + x] + best;
		}
	}
	const seam = new Int32Array(height);
	let x = 0;
	for (let i = 1; i < width; i++) {
		if (cost[(height - 1) * width + i] < cost[(height - 1) * width + x]) {
			x = i;
		}
	}
	seam[height - 1] = x;
	for (let y = height - 1; y > 0; y--) {
		let next = x;
		let best = cost[(y - 1) * width + x];
		if (x > 0 && cost[(y - 1) * width + x - 1] < best) {
			best = cost[(y - 1) * width + x - 1];
			next = x - 1;
		}
		if (x < width - 1 && cost[(y - 1) * width + x + 1] < best) {
			next = x + 1;
		}
		x = next;
		seam[y - 1] = x;
	}
	return seam;
}

/**
 * Removes `count` vertical seams
 *
 * @param {Image_data} image
 * @param {number} count how many columns to take away (limited so that at least one column stays)
 * @returns {Image_data} a new image, the input is not changed
 */
export function carve_width(image, count) {
	const remove = Math.min(Math.max(0, Math.floor(count) || 0), image.width - 1);
	let width = image.width;
	const height = image.height;
	let data = new Uint8ClampedArray(image.data);
	for (let n = 0; n < remove; n++) {
		const seam = find_vertical_seam(seam_energy(data, width, height), width, height);
		const next = new Uint8ClampedArray((width - 1) * height * 4);
		for (let y = 0; y < height; y++) {
			const cut = seam[y];
			const row = y * width * 4;
			const out = y * (width - 1) * 4;
			next.set(data.subarray(row, row + cut * 4), out);
			next.set(data.subarray(row + (cut + 1) * 4, row + width * 4), out + cut * 4);
		}
		data = next;
		width--;
	}
	return {data, width, height};
}

/**
 * Adds `count` columns: the seams that would be removed first are found on a working copy (every seam is followed
 * back to the original columns), and each of them is duplicated in the original, the copy being the mean of the
 * pixel and its right neighbor so that it blends in. At most width - 1 columns are added.
 *
 * @param {Image_data} image
 * @param {number} count how many columns to add
 * @returns {Image_data} a new image, the input is not changed
 */
export function enlarge_width(image, count) {
	const add = Math.min(Math.max(0, Math.floor(count) || 0), image.width - 1);
	const width = image.width;
	const height = image.height;
	if (add == 0) {
		return {data: new Uint8ClampedArray(image.data), width, height};
	}
	let current = image.width;
	let data = new Uint8ClampedArray(image.data);
	//origin[y * width + x] = the column of the original that is now at x
	let origin = new Int32Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			origin[y * width + x] = x;
		}
	}
	//marked[y * width + c] = the original column c is on a seam
	const marked = new Uint8Array(width * height);
	for (let n = 0; n < add; n++) {
		const seam = find_vertical_seam(seam_energy(data, current, height), current, height);
		const next = new Uint8ClampedArray((current - 1) * height * 4);
		const next_origin = new Int32Array((current - 1) * height);
		for (let y = 0; y < height; y++) {
			const cut = seam[y];
			marked[y * width + origin[y * current + cut]] = 1;
			const row = y * current * 4;
			const out = y * (current - 1) * 4;
			next.set(data.subarray(row, row + cut * 4), out);
			next.set(data.subarray(row + (cut + 1) * 4, row + current * 4), out + cut * 4);
			for (let x = 0; x < current - 1; x++) {
				next_origin[y * (current - 1) + x] = origin[y * current + (x < cut ? x : x + 1)];
			}
		}
		data = next;
		origin = next_origin;
		current--;
	}
	const result = new Uint8ClampedArray((width + add) * height * 4);
	for (let y = 0; y < height; y++) {
		let out = y * (width + add) * 4;
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			result.set(image.data.subarray(from, from + 4), out);
			out += 4;
			if (marked[y * width + x]) {
				const right = (y * width + Math.min(width - 1, x + 1)) * 4;
				for (let c = 0; c < 4; c++) {
					result[out + c] = Math.round((image.data[from + c] + image.data[right + c]) / 2);
				}
				out += 4;
			}
		}
	}
	return {data: result, width: width + add, height};
}

/**
 * @param {Image_data} image
 * @returns {Image_data} the picture turned over its diagonal (rows become columns), so a vertical seam of the
 *  transposed picture is a horizontal seam of the original; transposing twice gives the original back
 */
export function transpose(image) {
	const {width, height} = image;
	const data = new Uint8ClampedArray(image.data.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			const to = (x * height + y) * 4;
			data[to] = image.data[from];
			data[to + 1] = image.data[from + 1];
			data[to + 2] = image.data[from + 2];
			data[to + 3] = image.data[from + 3];
		}
	}
	return {data, width: height, height: width};
}

/**
 * Resizes one axis of the picture: carving when it gets smaller, seam insertion when it gets larger
 */
function resize_axis(image, target) {
	return target < image.width ? carve_width(image, image.width - target) : enlarge_width(image, target - image.width);
}

/**
 * Scales the picture by seam carving (smaller) or seam insertion (larger, just under twice the size on an axis)
 *
 * @param {Image_data} image
 * @param {number} new_width the wanted width
 * @param {number} new_height the wanted height
 * @returns {Image_data|null} a new image, null when the picture has more than MAX_CARVE_PIXELS pixels
 */
export function content_aware_scale(image, new_width, new_height) {
	if (image.width * image.height > MAX_CARVE_PIXELS) {
		return null;
	}
	const target_width = Math.min(image.width * 2, Math.max(1, Math.round(new_width) || image.width));
	const target_height = Math.min(image.height * 2, Math.max(1, Math.round(new_height) || image.height));
	let result = resize_axis(image, target_width);
	if (target_height != image.height) {
		result = transpose(resize_axis(transpose(result), target_height));
	}
	return result;
}
