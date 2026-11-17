import { mask_view_rgba, decontaminate, VIEW_MODES } from '../src/js/libs/select-and-mask.js';

const image = () => ({width: 2, height: 1, data: new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255])});
const mask = {data: new Uint8ClampedArray([255, 0])};

describe('Select and Mask', () => {
	it('shows the selection on black, on white, in black and white and as an overlay', () => {
		expect(Array.from(mask_view_rgba(image(), mask, 'On Black')!)).toEqual([200, 100, 50, 255, 0, 0, 0, 255]);
		expect(Array.from(mask_view_rgba(image(), mask, 'On White')!)).toEqual([200, 100, 50, 255, 255, 255, 255, 255]);
		expect(Array.from(mask_view_rgba(image(), mask, 'Black & White')!)).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
		const overlay = Array.from(mask_view_rgba(image(), mask, 'Overlay')!);
		expect(overlay.slice(0, 4)).toEqual([200, 100, 50, 255]);
		expect(overlay[4]).toBeGreaterThan(200);
		expect(overlay[5]).toBeLessThan(100);
		expect(mask_view_rgba(image(), mask, 'Marching Ants')).toBe(null);
		expect(mask_view_rgba(image(), mask, 'nonsense')).toBe(null);
		expect(VIEW_MODES).toContain('Overlay');
	});

	it('takes the inner color into the soft edge', () => {
		//red inside, a half selected blue pixel at the edge
		const picture = {width: 3, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255])};
		decontaminate(picture, {data: new Uint8ClampedArray([255, 128, 0])}, 100, 2);
		expect(picture.data[4]).toBeGreaterThan(100);
		expect(picture.data[6]).toBeLessThan(160);
		expect(Array.from(picture.data.slice(8, 12))).toEqual([0, 0, 255, 255]);
		const same = image();
		decontaminate(same, mask, 0);
		expect(Array.from(same.data)).toEqual(Array.from(image().data));
	});
});
