import {
	mesh_spacing, clean_expansion, build_mesh, locate_point, point_at, mesh_distances, mls_rigid, triangle_affine,
	expand_triangle, mesh_bounds, find_pin,
} from '../src/js/libs/puppet-warp.js';

function image(width: number, height: number, opaque: (x: number, y: number) => boolean) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (opaque(x, y)) {
				data[(y * width + x) * 4 + 3] = 255;
			}
		}
	}
	return {data, width, height};
}

describe('puppet warp mesh', () => {
	test('spacing by density', () => {
		expect(mesh_spacing(200, 100, 'Normal')).toBe(10);
		expect(mesh_spacing(200, 100, 'Fewer Points')).toBeGreaterThan(mesh_spacing(200, 100, 'More Points'));
		expect(mesh_spacing(10, 10, 'More Points')).toBe(4);
		expect(mesh_spacing(200, 100, 'unknown')).toBe(10);
	});

	test('clean_expansion', () => {
		expect(clean_expansion('7')).toBe(7);
		expect(clean_expansion(-3)).toBe(0);
		expect(clean_expansion(1000)).toBe(100);
		expect(clean_expansion('x')).toBe(0);
	});

	test('a full picture gives two triangles per cell', () => {
		const mesh = build_mesh(image(40, 20, () => true), {spacing: 10});
		expect(mesh).not.toBeNull();
		expect(mesh!.triangles.length / 3).toBe(4 * 2 * 2);
		expect(mesh!.vertices.length / 2).toBe(5 * 3);
		expect(mesh_bounds(mesh!.vertices)).toEqual({x: 0, y: 0, width: 40, height: 20});
	});

	test('transparent cells are left out, an empty picture has no mesh', () => {
		const mesh = build_mesh(image(40, 20, (x) => x < 10), {spacing: 10});
		expect(mesh!.triangles.length / 3).toBe(2 * 2);
		expect(build_mesh(image(10, 10, () => false), {spacing: 5})).toBeNull();
	});

	test('expansion grows the mesh past the opaque pixels and the picture', () => {
		const plain = build_mesh(image(40, 40, (x, y) => x >= 15 && x < 25 && y >= 15 && y < 25), {spacing: 10});
		const grown = build_mesh(image(40, 40, (x, y) => x >= 15 && x < 25 && y >= 15 && y < 25), {spacing: 10, expansion: 30});
		expect(grown!.triangles.length).toBeGreaterThan(plain!.triangles.length);
		const bounds = mesh_bounds(grown!.vertices);
		expect(bounds.x).toBeLessThan(0);
		expect(bounds.x + bounds.width).toBeGreaterThan(40);
	});

	test('edges join the neighbors', () => {
		const mesh = build_mesh(image(20, 20, () => true), {spacing: 10})!;
		expect(mesh.edges.length).toBe(9);
		//the center vertex touches the four sides and one diagonal each way
		expect(Math.max(...mesh.edges.map((list) => list.length))).toBe(6);
	});

	test('locate_point and point_at agree', () => {
		const mesh = build_mesh(image(20, 20, () => true), {spacing: 10})!;
		const place = locate_point(mesh.vertices, mesh.triangles, 3, 7)!;
		const p = point_at(mesh.vertices, mesh.triangles, place);
		expect(p.x).toBeCloseTo(3);
		expect(p.y).toBeCloseTo(7);
		expect(locate_point(mesh.vertices, mesh.triangles, 30, 5)).toBeNull();
	});

	test('distances follow the mesh around a gap', () => {
		//two bars joined only at the top
		const mesh = build_mesh(image(30, 30, (x, y) => y < 10 || x < 10 || x >= 20), {spacing: 10})!;
		const place = locate_point(mesh.vertices, mesh.triangles, 0, 30)!;
		const distances = mesh_distances(mesh, place, 0, 30);
		let far = -1;
		for (let i = 0; i < mesh.vertices.length / 2; i++) {
			if (mesh.vertices[i * 2] == 30 && mesh.vertices[i * 2 + 1] == 30) {
				far = i;
			}
		}
		expect(far).toBeGreaterThanOrEqual(0);
		//straight it is 30, along the mesh it goes up, across and down
		expect(distances[far]).toBeGreaterThan(60);
	});
});

describe('rigid moving least squares', () => {
	const points = [0, 0, 10, 0, 0, 10, 10, 10, 5, 5];

	test('no pin keeps the points, one pin moves them', () => {
		expect(Array.from(mls_rigid(points, []))).toEqual(points);
		const moved = mls_rigid(points, [{x: 5, y: 5, tx: 8, ty: 1}]);
		expect(Array.from(moved)).toEqual([3, -4, 13, -4, 3, 6, 13, 6, 8, 1]);
	});

	test('pins that move together translate rigidly', () => {
		const moved = mls_rigid(points, [{x: 0, y: 0, tx: 5, ty: 5}, {x: 10, y: 10, tx: 15, ty: 15}]);
		for (let i = 0; i < points.length; i++) {
			expect(moved[i]).toBeCloseTo(points[i] + 5);
		}
	});

	test('a rotation of the pins rotates the points', () => {
		//90 degrees around (5, 5)
		const rotate = (x: number, y: number) => [5 - (y - 5), 5 + (x - 5)];
		const pins = [[0, 0], [10, 0], [10, 10]].map(([x, y]) => {
			const [tx, ty] = rotate(x, y);
			return {x, y, tx, ty};
		});
		const moved = mls_rigid(points, pins);
		for (let i = 0; i < points.length; i += 2) {
			const [x, y] = rotate(points[i], points[i + 1]);
			expect(moved[i]).toBeCloseTo(x);
			expect(moved[i + 1]).toBeCloseTo(y);
		}
	});

	test('a point on a pin goes exactly to its target', () => {
		const moved = mls_rigid(points, [{x: 0, y: 0, tx: 0, ty: 0}, {x: 10, y: 10, tx: 20, ty: 3}]);
		expect(moved[6]).toBeCloseTo(20);
		expect(moved[7]).toBeCloseTo(3);
		expect(moved[0]).toBeCloseTo(0);
		expect(moved[1]).toBeCloseTo(0);
	});

	test('the distances along the mesh decide the weights', () => {
		const pins = [
			{x: 0, y: 0, tx: 0, ty: 0, distances: [0, 1, 1, 1, 100]},
			{x: 10, y: 10, tx: 10, ty: 30, distances: [100, 100, 100, 0, 1]},
		];
		const moved = mls_rigid(points, pins);
		//the center point is close to the second pin along the mesh, so it follows it
		expect(moved[9]).toBeGreaterThan(20);
	});
});

describe('triangle helpers', () => {
	test('triangle_affine maps the corners', () => {
		const s = [0, 0, 10, 0, 0, 10];
		const d = [5, 5, 5, 15, -5, 5];
		const [a, b, c, dd, e, f] = triangle_affine(s, d)!;
		for (let k = 0; k < 3; k++) {
			const x = s[k * 2];
			const y = s[k * 2 + 1];
			expect(a * x + c * y + e).toBeCloseTo(d[k * 2]);
			expect(b * x + dd * y + f).toBeCloseTo(d[k * 2 + 1]);
		}
		expect(triangle_affine([0, 0, 1, 1, 2, 2], d)).toBeNull();
	});

	test('expand_triangle moves the corners away from the center', () => {
		const t = expand_triangle([0, 0, 30, 0, 0, 30], 1);
		expect(t[0]).toBeLessThan(0);
		expect(t[1]).toBeLessThan(0);
		expect(t[2]).toBeGreaterThan(30);
		expect(t[5]).toBeGreaterThan(30);
	});

	test('find_pin picks the nearest within reach', () => {
		const pins = [{tx: 0, ty: 0}, {tx: 5, ty: 0}];
		expect(find_pin(pins, 4, 0, 3)).toBe(1);
		expect(find_pin(pins, 20, 0, 3)).toBe(-1);
	});

	test('mesh_bounds rounds outwards', () => {
		expect(mesh_bounds([-0.5, 1.2, 9.1, 3])).toEqual({x: -1, y: 1, width: 11, height: 2});
		expect(mesh_bounds([])).toEqual({x: 0, y: 0, width: 0, height: 0});
	});
});
