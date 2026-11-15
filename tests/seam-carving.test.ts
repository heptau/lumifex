import { seam_energy, find_vertical_seam, carve_width, transpose, content_aware_scale, MAX_CARVE_PIXELS } from '../src/js/libs/seam-carving.js';

function image(w: number, h: number, color: (x: number, y: number) => number[]) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			data.set(color(x, y), (y * w + x) * 4);
		}
	}
	return {data, width: w, height: h};
}

describe('seam carving', () => {
	//a white vertical line on black in column 5: the seam must avoid it
	const line = () => image(10, 6, (x) => (x == 5 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

	it('energy is high at edges and zero in flat areas', () => {
		const energy = seam_energy(line().data, 10, 6);
		expect(energy[0]).toBe(0);
		expect(energy[4]).toBeGreaterThan(0);
		expect(energy[5]).toBeGreaterThan(0);
	});

	it('the seam is connected and stays away from a detailed column', () => {
		const img = line();
		const seam = find_vertical_seam(seam_energy(img.data, 10, 6), 10, 6);
		for (let y = 1; y < 6; y++) {
			expect(Math.abs(seam[y] - seam[y - 1])).toBeLessThanOrEqual(1);
		}
		for (let y = 0; y < 6; y++) {
			expect([4, 5, 6]).not.toContain(seam[y]);
		}
	});

	it('carving keeps the line and shrinks only the flat area', () => {
		const out = carve_width(line(), 4);
		expect(out.width).toBe(6);
		expect(out.height).toBe(6);
		let whites = 0;
		for (let x = 0; x < 6; x++) {
			if (out.data[x * 4] == 255) {
				whites++;
			}
		}
		expect(whites).toBe(1);
	});

	it('does not change the input and keeps at least one column', () => {
		const img = line();
		const copy = Array.from(img.data);
		expect(carve_width(img, 100).width).toBe(1);
		expect(Array.from(img.data)).toEqual(copy);
		expect(carve_width(img, NaN).width).toBe(10);
		expect(carve_width(img, -3).width).toBe(10);
	});

	it('transposing twice gives the original back', () => {
		const img = image(5, 3, (x, y) => [x * 10, y * 20, 7, 255]);
		const back = transpose(transpose(img));
		expect(back.width).toBe(5);
		expect(Array.from(back.data)).toEqual(Array.from(img.data));
	});

	it('scales height too, never enlarges, and refuses huge pictures', () => {
		const img = image(8, 8, (x, y) => (y == 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
		const out = content_aware_scale(img, 20, 5) as any;
		expect(out.width).toBe(8);
		expect(out.height).toBe(5);
		let whites = 0;
		for (let y = 0; y < 5; y++) {
			if (out.data[(y * 8) * 4] == 255) {
				whites++;
			}
		}
		expect(whites).toBe(1);
		expect(content_aware_scale({data: new Uint8ClampedArray(4), width: MAX_CARVE_PIXELS + 1, height: 1}, 5, 1)).toBeNull();
	});
});
