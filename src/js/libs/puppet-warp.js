/**
 * Puppet Warp (Edit > Puppet Warp): pure geometry, no DOM.
 *
 * - The mesh is a regular grid laid over the opaque pixels of the layer: a cell is kept when it contains a pixel with
 *   alpha (or, with Expansion, when such a pixel lies within that many pixels of the cell), and every kept cell is cut
 *   into two triangles. The vertices are the corners of the kept cells.
 * - The deformation is the rigid Moving Least Squares of Schaefer, McPhail and Warren (2006): every vertex gets the
 *   rotation and the shift that best carry the pins around it (weighted by 1 / distance^2) to their new places.
 *   The distance is measured along the mesh (Dijkstra over its edges), not straight, so two legs that are close to
 *   each other but not joined do not pull each other. One pin only moves the picture, no pin leaves it as it is.
 * - Each triangle is then drawn from its place in the source to its deformed place with an affine transformation.
 */

export const PUPPET_DENSITIES = ['Fewer Points', 'Normal', 'More Points'];

/** cells along the longer side of the layer for every density */
const CELLS = {'Fewer Points': 12, 'Normal': 20, 'More Points': 32};

export const MAX_EXPANSION = 100;

/**
 * @param {number} width
 * @param {number} height
 * @param {string} density one of PUPPET_DENSITIES
 * @returns {number} the distance of the grid lines in pixels
 */
export function mesh_spacing(width, height, density) {
	const cells = CELLS[density] || CELLS['Normal'];
	const longer = Math.max(1, Math.round(width) || 1, Math.round(height) || 1);
	return Math.max(4, Math.ceil(longer / cells));
}

/**
 * @param {number|string} value
 * @returns {number} Expansion in whole pixels, 0..MAX_EXPANSION
 */
export function clean_expansion(value) {
	const number = parseInt(value, 10);
	if (!Number.isFinite(number)) {
		return 0;
	}
	return Math.max(0, Math.min(MAX_EXPANSION, number));
}

/**
 * A triangle mesh over the opaque pixels.
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} image
 * @param {{spacing?: number, density?: string, expansion?: number, threshold?: number}} [options]
 * @returns {{vertices: Float64Array, triangles: Uint32Array, edges: Array<number[]>, spacing: number}|null}
 *   vertices = x, y pairs in the pixels of the image; null when no pixel has alpha
 */
export function build_mesh(image, options = {}) {
	const width = Math.max(0, Math.floor(image.width));
	const height = Math.max(0, Math.floor(image.height));
	if (width == 0 || height == 0) {
		return null;
	}
	const spacing = Math.max(2, Math.floor(options.spacing || mesh_spacing(width, height, options.density)));
	const expansion = clean_expansion(options.expansion || 0);
	const threshold = Math.max(0, Math.min(254, options.threshold === undefined ? 8 : options.threshold));
	const pad = Math.ceil(expansion / spacing) * spacing;
	const cols = Math.ceil((width + 2 * pad) / spacing);
	const rows = Math.ceil((height + 2 * pad) / spacing);
	const right = width + pad; //the last grid line is not further than this
	const bottom = height + pad;
	const grid_x = (i) => Math.min(-pad + i * spacing, right);
	const grid_y = (j) => Math.min(-pad + j * spacing, bottom);

	//the box of the opaque pixels in every cell (without expansion)
	const min_x = new Float64Array(cols * rows).fill(Infinity);
	const min_y = new Float64Array(cols * rows).fill(Infinity);
	const max_x = new Float64Array(cols * rows).fill(-Infinity);
	const max_y = new Float64Array(cols * rows).fill(-Infinity);
	const data = image.data;
	let any = false;
	for (let y = 0; y < height; y++) {
		const row = Math.floor((y + pad) / spacing);
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > threshold) {
				const cell = row * cols + Math.floor((x + pad) / spacing);
				any = true;
				if (x < min_x[cell]) min_x[cell] = x;
				if (x + 1 > max_x[cell]) max_x[cell] = x + 1;
				if (y < min_y[cell]) min_y[cell] = y;
				if (y + 1 > max_y[cell]) max_y[cell] = y + 1;
			}
		}
	}
	if (!any) {
		return null;
	}

	//a cell is kept when the box of opaque pixels of a cell near it, grown by the expansion, reaches into it
	const reach = Math.ceil(expansion / spacing);
	const kept = new Uint8Array(cols * rows);
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			const x0 = grid_x(i);
			const x1 = grid_x(i + 1);
			const y0 = grid_y(j);
			const y1 = grid_y(j + 1);
			search:
			for (let b = Math.max(0, j - reach); b <= Math.min(rows - 1, j + reach); b++) {
				for (let a = Math.max(0, i - reach); a <= Math.min(cols - 1, i + reach); a++) {
					const cell = b * cols + a;
					if (min_x[cell] === Infinity) {
						continue;
					}
					if (min_x[cell] - expansion < x1 && max_x[cell] + expansion > x0
						&& min_y[cell] - expansion < y1 && max_y[cell] + expansion > y0) {
						kept[j * cols + i] = 1;
						break search;
					}
				}
			}
		}
	}

	//vertices of the kept cells, numbered in the order they are met
	const index = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
	const vertices = [];
	const triangles = [];
	const vertex = (i, j) => {
		const key = j * (cols + 1) + i;
		if (index[key] < 0) {
			index[key] = vertices.length / 2;
			vertices.push(grid_x(i), grid_y(j));
		}
		return index[key];
	};
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			if (kept[j * cols + i] == 0) {
				continue;
			}
			const a = vertex(i, j);
			const b = vertex(i + 1, j);
			const c = vertex(i + 1, j + 1);
			const d = vertex(i, j + 1);
			triangles.push(a, b, c, a, c, d);
		}
	}
	const mesh = {
		vertices: Float64Array.from(vertices),
		triangles: Uint32Array.from(triangles),
		spacing,
	};
	mesh.edges = mesh_edges(mesh);
	return mesh;
}

/**
 * @param {{vertices: Float64Array, triangles: Uint32Array}} mesh
 * @returns {Array<number[]>} for every vertex the list of its neighbors
 */
export function mesh_edges(mesh) {
	const count = mesh.vertices.length / 2;
	const sets = [];
	for (let i = 0; i < count; i++) {
		sets.push(new Set());
	}
	const tri = mesh.triangles;
	for (let t = 0; t < tri.length; t += 3) {
		for (let k = 0; k < 3; k++) {
			const a = tri[t + k];
			const b = tri[t + (k + 1) % 3];
			sets[a].add(b);
			sets[b].add(a);
		}
	}
	return sets.map((set) => Array.from(set));
}

/**
 * @param {Float64Array|number[]} vertices x, y pairs
 * @param {Uint32Array|number[]} triangles
 * @param {number} x
 * @param {number} y
 * @returns {{triangle: number, weights: number[]}|null} the first triangle that holds the point (slightly
 *   tolerant at the edges) and the barycentric weights of its three corners
 */
export function locate_point(vertices, triangles, x, y) {
	const tolerance = -1e-6;
	for (let t = 0; t < triangles.length; t += 3) {
		const weights = barycentric(vertices, triangles[t], triangles[t + 1], triangles[t + 2], x, y);
		if (weights && weights[0] >= tolerance && weights[1] >= tolerance && weights[2] >= tolerance) {
			return {triangle: t / 3, weights};
		}
	}
	return null;
}

function barycentric(vertices, a, b, c, x, y) {
	const ax = vertices[a * 2];
	const ay = vertices[a * 2 + 1];
	const bx = vertices[b * 2];
	const by = vertices[b * 2 + 1];
	const cx = vertices[c * 2];
	const cy = vertices[c * 2 + 1];
	const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
	if (Math.abs(det) < 1e-12) {
		return null;
	}
	const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
	const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
	return [u, v, 1 - u - v];
}

/**
 * @param {Float64Array|number[]} vertices
 * @param {Uint32Array|number[]} triangles
 * @param {{triangle: number, weights: number[]}} place
 * @returns {{x: number, y: number}} the point with these barycentric weights in the triangle
 */
export function point_at(vertices, triangles, place) {
	let x = 0;
	let y = 0;
	for (let k = 0; k < 3; k++) {
		const v = triangles[place.triangle * 3 + k];
		x += vertices[v * 2] * place.weights[k];
		y += vertices[v * 2 + 1] * place.weights[k];
	}
	return {x, y};
}

/**
 * The distance from a point in the mesh to every vertex, measured along the edges of the mesh (Dijkstra).
 * Vertices that can not be reached (another island of the mesh) get Infinity.
 *
 * @param {{vertices: Float64Array, triangles: Uint32Array, edges: Array<number[]>}} mesh
 * @param {{triangle: number}} place where the point lies
 * @param {number} x
 * @param {number} y
 * @returns {Float64Array}
 */
export function mesh_distances(mesh, place, x, y) {
	const vertices = mesh.vertices;
	const count = vertices.length / 2;
	const distance = new Float64Array(count).fill(Infinity);
	const done = new Uint8Array(count);
	const heap = [];
	const push = (d, v) => {
		heap.push([d, v]);
		let i = heap.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (heap[parent][0] <= heap[i][0]) {
				break;
			}
			[heap[parent], heap[i]] = [heap[i], heap[parent]];
			i = parent;
		}
	};
	const pop = () => {
		const top = heap[0];
		const last = heap.pop();
		if (heap.length > 0) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const l = i * 2 + 1;
				const r = l + 1;
				let m = i;
				if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
				if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
				if (m == i) {
					break;
				}
				[heap[m], heap[i]] = [heap[i], heap[m]];
				i = m;
			}
		}
		return top;
	};
	for (let k = 0; k < 3; k++) {
		const v = mesh.triangles[place.triangle * 3 + k];
		const d = Math.hypot(vertices[v * 2] - x, vertices[v * 2 + 1] - y);
		if (d < distance[v]) {
			distance[v] = d;
			push(d, v);
		}
	}
	while (heap.length > 0) {
		const [d, v] = pop();
		if (done[v]) {
			continue;
		}
		done[v] = 1;
		for (const n of mesh.edges[v]) {
			const next = d + Math.hypot(vertices[v * 2] - vertices[n * 2], vertices[v * 2 + 1] - vertices[n * 2 + 1]);
			if (next < distance[n]) {
				distance[n] = next;
				push(next, n);
			}
		}
	}
	return distance;
}

/**
 * Rigid Moving Least Squares (Schaefer et al. 2006) of the points by the pins. In 2D the rigid solution is the
 * rotation that best turns the centered pin sources onto the centered pin targets (weighted), applied around the
 * weighted centers.
 *
 * @param {Float64Array|number[]} points x, y pairs
 * @param {Array<{x: number, y: number, tx: number, ty: number, distances?: Float64Array|number[]}>} pins
 *   x, y = the place of the pin on the source, tx, ty = where it is now; distances (optional) = the distance of every
 *   point from the pin (along the mesh), otherwise the straight distance is used
 * @returns {Float64Array} the moved points
 */
export function mls_rigid(points, pins) {
	const count = points.length / 2;
	const result = Float64Array.from(points);
	if (pins.length == 0) {
		return result;
	}
	if (pins.length == 1) {
		const dx = pins[0].tx - pins[0].x;
		const dy = pins[0].ty - pins[0].y;
		for (let i = 0; i < count; i++) {
			result[i * 2] += dx;
			result[i * 2 + 1] += dy;
		}
		return result;
	}
	const n = pins.length;
	const w = new Float64Array(n);
	for (let i = 0; i < count; i++) {
		const vx = points[i * 2];
		const vy = points[i * 2 + 1];
		let exact = -1;
		let finite = false;
		for (let k = 0; k < n; k++) {
			const pin = pins[k];
			let d = pin.distances ? pin.distances[i] : Math.hypot(pin.x - vx, pin.y - vy);
			if (!Number.isFinite(d)) {
				//not joined through the mesh: a far, straight distance keeps the weight small
				d = Math.hypot(pin.x - vx, pin.y - vy) * 4 + 1e3;
			}
			else {
				finite = true;
			}
			if (d < 1e-9) {
				exact = k;
				break;
			}
			w[k] = 1 / (d * d);
		}
		if (exact >= 0) {
			result[i * 2] = pins[exact].tx;
			result[i * 2 + 1] = pins[exact].ty;
			continue;
		}
		if (!finite && pins.some((pin) => pin.distances)) {
			//an island without pins follows all pins by the straight distance
			for (let k = 0; k < n; k++) {
				const d = Math.hypot(pins[k].x - vx, pins[k].y - vy);
				w[k] = 1 / Math.max(1e-12, d * d);
			}
		}
		let sum = 0;
		let px = 0;
		let py = 0;
		let qx = 0;
		let qy = 0;
		for (let k = 0; k < n; k++) {
			sum += w[k];
			px += w[k] * pins[k].x;
			py += w[k] * pins[k].y;
			qx += w[k] * pins[k].tx;
			qy += w[k] * pins[k].ty;
		}
		px /= sum;
		py /= sum;
		qx /= sum;
		qy /= sum;
		let dot = 0;
		let cross = 0;
		for (let k = 0; k < n; k++) {
			const ax = pins[k].x - px;
			const ay = pins[k].y - py;
			const bx = pins[k].tx - qx;
			const by = pins[k].ty - qy;
			dot += w[k] * (ax * bx + ay * by);
			cross += w[k] * (ax * by - ay * bx);
		}
		let cos = 1;
		let sin = 0;
		const length = Math.hypot(dot, cross);
		if (length > 1e-12) {
			cos = dot / length;
			sin = cross / length;
		}
		const rx = vx - px;
		const ry = vy - py;
		result[i * 2] = cos * rx - sin * ry + qx;
		result[i * 2 + 1] = sin * rx + cos * ry + qy;
	}
	return result;
}

/**
 * The affine transformation that carries the triangle s onto the triangle d, in the order of canvas setTransform:
 * x' = a x + c y + e, y' = b x + d y + f.
 *
 * @param {number[]} s [x0, y0, x1, y1, x2, y2]
 * @param {number[]} d [x0, y0, x1, y1, x2, y2]
 * @returns {number[]|null} [a, b, c, d, e, f], null for a flat source triangle
 */
export function triangle_affine(s, d) {
	const ux = s[2] - s[0];
	const uy = s[3] - s[1];
	const vx = s[4] - s[0];
	const vy = s[5] - s[1];
	const det = ux * vy - vx * uy;
	if (Math.abs(det) < 1e-12) {
		return null;
	}
	const px = d[2] - d[0];
	const py = d[3] - d[1];
	const qx = d[4] - d[0];
	const qy = d[5] - d[1];
	//[a c; b d] * [ux vx; uy vy] = [px qx; py qy]
	const a = (px * vy - qx * uy) / det;
	const c = (qx * ux - px * vx) / det;
	const b = (py * vy - qy * uy) / det;
	const dd = (qy * ux - py * vx) / det;
	const e = d[0] - a * s[0] - c * s[1];
	const f = d[1] - b * s[0] - dd * s[1];
	return [a, b, c, dd, e, f];
}

/**
 * The triangle moved away from its center by `amount` pixels at every corner (hides the hair-line seams between
 * triangles drawn separately with anti-aliasing).
 *
 * @param {number[]} t [x0, y0, x1, y1, x2, y2]
 * @param {number} amount
 * @returns {number[]}
 */
export function expand_triangle(t, amount) {
	const cx = (t[0] + t[2] + t[4]) / 3;
	const cy = (t[1] + t[3] + t[5]) / 3;
	const out = [];
	for (let k = 0; k < 3; k++) {
		const dx = t[k * 2] - cx;
		const dy = t[k * 2 + 1] - cy;
		const length = Math.hypot(dx, dy);
		const grow = length > 1e-9 ? (length + amount) / length : 1;
		out.push(cx + dx * grow, cy + dy * grow);
	}
	return out;
}

/**
 * @param {Float64Array|number[]} vertices
 * @returns {{x: number, y: number, width: number, height: number}} the box of the points in whole pixels
 */
export function mesh_bounds(vertices) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < vertices.length; i += 2) {
		x0 = Math.min(x0, vertices[i]);
		x1 = Math.max(x1, vertices[i]);
		y0 = Math.min(y0, vertices[i + 1]);
		y1 = Math.max(y1, vertices[i + 1]);
	}
	if (x0 === Infinity) {
		return {x: 0, y: 0, width: 0, height: 0};
	}
	x0 = Math.floor(x0);
	y0 = Math.floor(y0);
	return {x: x0, y: y0, width: Math.max(1, Math.ceil(x1) - x0), height: Math.max(1, Math.ceil(y1) - y0)};
}

/**
 * @param {Array<{tx: number, ty: number}>} pins
 * @param {number} x
 * @param {number} y
 * @param {number} reach
 * @returns {number} the index of the nearest pin within the reach, -1 when none
 */
export function find_pin(pins, x, y, reach) {
	let best = -1;
	let best_distance = reach;
	pins.forEach((pin, i) => {
		const d = Math.hypot(pin.tx - x, pin.ty - y);
		if (d <= best_distance) {
			best = i;
			best_distance = d;
		}
	});
	return best;
}
