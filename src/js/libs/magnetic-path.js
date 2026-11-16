/**
 * Magnetic Lasso (Photoshop): between two clicks the selection path does not run straight but follows the strongest
 * edge of the picture. The cheapest path is found with Dijkstra's algorithm over a window around the last click, where
 * crossing flat areas is expensive and walking along an edge is cheap. Pure functions, no DOM.
 *
 * @typedef {{data: ArrayLike<number>, width: number, height: number}} Pixels RGBA
 * @typedef {{x0: number, y0: number, width: number, height: number, ax: number, ay: number, parent: Int32Array}} Path_tree
 */

/** How much more a step over a flat area costs than a step along the strongest edge */
export const FLAT_PENALTY = 14;

/**
 * Edge strength of every pixel (Sobel on the brightness), scaled so that the strong edges are 1
 *
 * @param {Pixels} image
 * @returns {Float32Array} width * height values 0-1
 */
export function edge_strength(image) {
	const w = image.width;
	const h = image.height;
	const luma = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) {
		luma[p] = image.data[p * 4] * 0.299 + image.data[p * 4 + 1] * 0.587 + image.data[p * 4 + 2] * 0.114;
	}
	const at = (x, y) => luma[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
	const magnitude = new Float32Array(w * h);
	let strongest = 0;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
			const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
			const m = Math.hypot(gx, gy);
			magnitude[y * w + x] = m;
			if (m > strongest) {
				strongest = m;
			}
		}
	}
	//half of the strongest edge already counts as a full one, so a picture with one soft edge still has a clear path
	const scale = strongest > 0 ? 1 / (strongest * 0.5) : 0;
	for (let p = 0; p < magnitude.length; p++) {
		magnitude[p] = Math.min(1, magnitude[p] * scale);
	}
	return magnitude;
}

/**
 * Cheapest paths from one pixel to every pixel of a window around it
 *
 * @param {Float32Array} strength from edge_strength
 * @param {number} width the width of the picture
 * @param {number} height the height of the picture
 * @param {number} ax the start (the last click), pixels
 * @param {number} ay
 * @param {number} radius half the size of the window in pixels (1-500)
 * @returns {Path_tree}
 */
export function build_path_tree(strength, width, height, ax, ay, radius) {
	const r = Math.min(500, Math.max(1, Math.round(radius) || 1));
	const sx = Math.min(width - 1, Math.max(0, Math.round(ax)));
	const sy = Math.min(height - 1, Math.max(0, Math.round(ay)));
	const x0 = Math.max(0, sx - r);
	const y0 = Math.max(0, sy - r);
	const x1 = Math.min(width - 1, sx + r);
	const y1 = Math.min(height - 1, sy + r);
	const w = x1 - x0 + 1;
	const h = y1 - y0 + 1;
	const parent = new Int32Array(w * h).fill(-2);
	const cost = new Float64Array(w * h).fill(Infinity);
	const start = (sy - y0) * w + (sx - x0);
	cost[start] = 0;
	parent[start] = -1;

	//a binary heap of [cost, index] pairs kept in two arrays
	const heap_cost = [];
	const heap_index = [];
	const push = (c, i) => {
		let k = heap_cost.length;
		heap_cost.push(c);
		heap_index.push(i);
		while (k > 0) {
			const up = (k - 1) >> 1;
			if (heap_cost[up] <= c) {
				break;
			}
			heap_cost[k] = heap_cost[up];
			heap_index[k] = heap_index[up];
			k = up;
		}
		heap_cost[k] = c;
		heap_index[k] = i;
	};
	const pop = () => {
		const top_cost = heap_cost[0];
		const top_index = heap_index[0];
		const last_cost = heap_cost.pop();
		const last_index = heap_index.pop();
		const n = heap_cost.length;
		if (n > 0) {
			let k = 0;
			for (;;) {
				let child = 2 * k + 1;
				if (child >= n) {
					break;
				}
				if (child + 1 < n && heap_cost[child + 1] < heap_cost[child]) {
					child++;
				}
				if (heap_cost[child] >= last_cost) {
					break;
				}
				heap_cost[k] = heap_cost[child];
				heap_index[k] = heap_index[child];
				k = child;
			}
			heap_cost[k] = last_cost;
			heap_index[k] = last_index;
		}
		return [top_cost, top_index];
	};

	push(0, start);
	while (heap_cost.length > 0) {
		const [c, i] = pop();
		if (c > cost[i]) {
			continue;
		}
		const px = i % w;
		const py = (i - px) / w;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx == 0 && dy == 0) {
					continue;
				}
				const nx = px + dx;
				const ny = py + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
					continue;
				}
				const j = ny * w + nx;
				const edge = strength[(y0 + ny) * width + (x0 + nx)];
				const step = (dx != 0 && dy != 0 ? Math.SQRT2 : 1) * (1 + FLAT_PENALTY * (1 - edge));
				const next = c + step;
				if (next < cost[j]) {
					cost[j] = next;
					parent[j] = i;
					push(next, j);
				}
			}
		}
	}
	return {x0, y0, width: w, height: h, ax: sx, ay: sy, parent};
}

/**
 * The path from the start of the tree to a point
 *
 * @param {Path_tree} tree
 * @param {number} x the target in pixels of the picture
 * @param {number} y
 * @returns {{x: number, y: number}[]} from the start to the target (excluding neither); a target outside the window
 *  is joined with a straight line
 */
export function trace_path(tree, x, y) {
	const tx = Math.round(x);
	const ty = Math.round(y);
	const lx = tx - tree.x0;
	const ly = ty - tree.y0;
	if (lx < 0 || ly < 0 || lx >= tree.width || ly >= tree.height || tree.parent[ly * tree.width + lx] == -2) {
		return [{x: tree.ax, y: tree.ay}, {x: tx, y: ty}];
	}
	const points = [];
	let i = ly * tree.width + lx;
	while (i >= 0) {
		const px = i % tree.width;
		points.push({x: tree.x0 + px, y: tree.y0 + (i - px) / tree.width});
		i = tree.parent[i];
	}
	return points.reverse();
}

/**
 * Backspace while a polygonal or magnetic path is being drawn takes back the last anchor: the path goes back to
 * how long it was after the anchor before it.
 *
 * @param {number[]} marks the length of the path after every anchor, the first is the start (1)
 * @returns {{marks: number[], length: number}|null} the shorter list and the length the path is cut to; null when only
 *  the start is left (nothing to take back)
 */
export function take_back_anchor(marks) {
	if (!Array.isArray(marks) || marks.length < 2) {
		return null;
	}
	const rest = marks.slice(0, -1);
	return {marks: rest, length: rest[rest.length - 1]};
}
