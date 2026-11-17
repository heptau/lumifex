import {
	frame_from_box, frame_to_box, frame_handles, frame_quad, hit_test, quad_hit_test, point_in_quad, snap_angle,
	keeps_ratio, drag_frame, drag_quad, quad_center, rotate_quad, turn_frame, flip_frame, flip_quad, same_frame,
	frame_from_field, union_rect, flip_mask, selection_on_layer, to_local, from_local,
} from '../src/js/libs/free-transform.js';

const box = () => ({ x: 10, y: 20, width: 200, height: 100, rotate: 0 });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('Free transform frame', () => {
	it('is made from a layer box and back', () => {
		const frame = frame_from_box(box());
		expect(frame).toEqual({ cx: 110, cy: 70, width: 200, height: 100, angle: 0, flip_x: false, flip_y: false });
		expect(frame_to_box(frame)).toEqual(box());
		expect(frame_from_box({ x: 0, y: 0, width: 10, height: 10, rotate: 270 }).angle).toBe(-90);
		expect(frame_from_box({ x: 0, y: 0, width: 10, height: 10, rotate: null }).angle).toBe(0);
	});

	it('converts points to the frame and back', () => {
		const frame = Object.assign(frame_from_box(box()), { angle: 30 });
		const p = { x: 5, y: -40 };
		const back = from_local(to_local(p, frame), frame);
		close(back.x, p.x);
		close(back.y, p.y);
	});

	it('places the handles on a turned frame', () => {
		const frame = Object.assign(frame_from_box({ x: 0, y: 0, width: 100, height: 50 }), { angle: 90 });
		const handles = frame_handles(frame);
		//turned clockwise by 90 degrees around (50, 25): the top left corner goes to the top right
		close(handles.tl.x, 75);
		close(handles.tl.y, -25);
		close(handles.right.x, 50);
		close(handles.right.y, 75);
	});

	it('mirrors the corners of the picture, not the handles', () => {
		const frame = flip_frame(frame_from_box({ x: 0, y: 0, width: 100, height: 50 }), true);
		expect(frame_quad(frame)).toEqual([[100, 0], [0, 0], [0, 50], [100, 50]]);
		expect(frame_handles(frame).tl).toEqual({ x: 0, y: 0 });
		expect(flip_frame(frame, true).flip_x).toBe(false);
		expect(flip_frame(frame, false).flip_y).toBe(true);
	});

	it('hit tests handles, the inside and the outside', () => {
		const frame = frame_from_box(box());
		expect(hit_test(frame, { x: 11, y: 21 }, 5)).toBe('tl');
		expect(hit_test(frame, { x: 110, y: 120 }, 5)).toBe('bottom');
		expect(hit_test(frame, { x: 100, y: 60 }, 5)).toBe('move');
		expect(hit_test(frame, { x: 500, y: 500 }, 5)).toBe('rotate');
	});

	it('snaps angles by 15 degrees', () => {
		expect(snap_angle(22)).toBe(15);
		expect(snap_angle(23)).toBe(30);
		expect(snap_angle(185)).toBe(180);
		expect(snap_angle(-50)).toBe(-45);
	});

	it('keeps the proportions like Photoshop CC', () => {
		expect(keeps_ratio('tl', false, true)).toBe(true);
		expect(keeps_ratio('tl', true, true)).toBe(false);
		expect(keeps_ratio('tl', false, false)).toBe(false);
		expect(keeps_ratio('tl', true, false)).toBe(true);
		expect(keeps_ratio('top', true, true)).toBe(false);
	});
});

describe('Dragging the frame', () => {
	it('moves by whole pixels', () => {
		const frame = drag_frame(frame_from_box(box()), 'move', { x: 0, y: 0 }, { x: 10.4, y: -5.6 });
		expect(frame.cx).toBe(120);
		expect(frame.cy).toBe(64);
	});

	it('scales a corner freely and keeps the opposite corner', () => {
		const frame = drag_frame(frame_from_box(box()), 'br', { x: 210, y: 120 }, { x: 310, y: 140 }, { ratio_default: false });
		expect(frame_to_box(frame)).toEqual({ x: 10, y: 20, width: 300, height: 120, rotate: 0 });
	});

	it('keeps the proportions of a picture by default and frees them with Shift', () => {
		const start = frame_from_box(box());
		const kept = drag_frame(start, 'br', { x: 210, y: 120 }, { x: 410, y: 130 }, { ratio_default: true });
		expect(kept.width).toBeCloseTo(400);
		expect(kept.height).toBeCloseTo(200);
		expect(kept.cx - kept.width / 2).toBeCloseTo(10);
		const free = drag_frame(start, 'br', { x: 210, y: 120 }, { x: 410, y: 130 }, { ratio_default: true, shift: true });
		expect(free.width).toBeCloseTo(400);
		expect(free.height).toBeCloseTo(110);
	});

	it('scales around the center with Alt', () => {
		const frame = drag_frame(frame_from_box(box()), 'right', { x: 210, y: 70 }, { x: 260, y: 70 }, { alt: true });
		expect(frame.cx).toBeCloseTo(110);
		expect(frame.width).toBeCloseTo(300);
		expect(frame.height).toBeCloseTo(100);
	});

	it('does not turn inside out', () => {
		const frame = drag_frame(frame_from_box(box()), 'right', { x: 210, y: 70 }, { x: -500, y: 70 });
		expect(frame.width).toBe(1);
		expect(frame.cx - frame.width / 2).toBeCloseTo(10);
	});

	it('scales a turned frame along its own sides', () => {
		const start = Object.assign(frame_from_box({ x: 0, y: 0, width: 100, height: 50 }), { angle: 90 });
		//the right edge of a frame turned by 90 degrees is at the bottom
		const frame = drag_frame(start, 'right', { x: 50, y: 75 }, { x: 50, y: 95 });
		expect(frame.width).toBeCloseTo(120);
		expect(frame.height).toBeCloseTo(50);
		expect(frame.cy).toBeCloseTo(35);
	});

	it('turns around the center, Shift by 15 degrees', () => {
		const start = frame_from_box({ x: 0, y: 0, width: 100, height: 100 });
		const frame = drag_frame(start, 'rotate', { x: 150, y: 50 }, { x: 50, y: 150 });
		expect(frame.angle).toBeCloseTo(90);
		const snapped = drag_frame(start, 'rotate', { x: 150, y: 50 }, { x: 150, y: 70 }, { shift: true });
		expect(snapped.angle).toBe(15);
	});

	it('turns, flips and compares frames', () => {
		const start = frame_from_box(box());
		expect(turn_frame(start, 180).angle).toBe(180);
		expect(turn_frame(turn_frame(start, 90), 90).angle).toBe(180);
		expect(same_frame(start, frame_from_box(box()))).toBe(true);
		expect(same_frame(start, flip_frame(start, true))).toBe(false);
	});

	it('takes the numbers of the bar', () => {
		const start = flip_frame(frame_from_box(box()), true);
		const wider = frame_from_field(start, 'width', 400, true);
		expect(wider).not.toBeNull();
		expect(wider!.width).toBe(400);
		expect(wider!.height).toBe(200);
		expect(wider!.cx).toBe(110);
		expect(wider!.flip_x).toBe(true);
		expect(frame_from_field(start, 'x', 110, false)).toBeNull();
		expect(frame_from_field(start, 'rotate', 'abc', false)).toBeNull();
	});
});

describe('Dragging a quad', () => {
	const quad = () => [[0, 0], [100, 0], [100, 50], [0, 50]];

	it('tests what is under the pointer', () => {
		expect(quad_hit_test(quad(), { x: 99, y: 1 }, 4)).toBe('tr');
		expect(quad_hit_test(quad(), { x: 50, y: 50 }, 4)).toBe('bottom');
		expect(quad_hit_test(quad(), { x: 30, y: 30 }, 4)).toBe('move');
		expect(quad_hit_test(quad(), { x: 300, y: 30 }, 4)).toBe('rotate');
		expect(point_in_quad([[0, 0], [0, 50], [100, 50], [100, 0]], { x: 10, y: 10 })).toBe(true);
	});

	it('moves a corner freely or in perspective', () => {
		expect(drag_quad(quad(), 'free', 'tr', { x: 100, y: 0 }, { x: 120, y: 10 })).toEqual([[0, 0], [120, 10], [100, 50], [0, 50]]);
		expect(drag_quad(quad(), 'perspective', 'tr', { x: 100, y: 0 }, { x: 100, y: 10 })).toEqual([[0, 0], [100, 10], [100, 40], [0, 50]]);
	});

	it('skews an edge or moves it in Distort', () => {
		expect(drag_quad(quad(), 'skew', 'top', { x: 50, y: 0 }, { x: 60, y: 5 })).toEqual([[10, 0], [110, 0], [100, 50], [0, 50]]);
		expect(drag_quad(quad(), 'distort', 'top', { x: 50, y: 0 }, { x: 60, y: 5 })).toEqual([[10, 5], [110, 5], [100, 50], [0, 50]]);
	});

	it('moves, turns and flips', () => {
		expect(drag_quad(quad(), 'free', 'move', { x: 0, y: 0 }, { x: 3.4, y: 2.6 })).toEqual([[3, 3], [103, 3], [103, 53], [3, 53]]);
		const turned = rotate_quad(quad(), quad_center(quad()), 180);
		close(turned[0][0], 100);
		close(turned[0][1], 50);
		expect(flip_quad(quad(), true)).toEqual([[100, 0], [0, 0], [0, 50], [100, 50]]);
	});
});

describe('Helpers', () => {
	it('joins rectangles', () => {
		expect(union_rect({ x: 0, y: 0, width: 10, height: 10 }, { x: -2.5, y: 5, width: 4, height: 10 }))
			.toEqual({ x: -3, y: 0, width: 13, height: 15 });
	});

	it('mirrors a mask', () => {
		const mask = { width: 3, height: 2, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]) };
		expect(Array.from(flip_mask(mask, true, false).data)).toEqual([3, 2, 1, 6, 5, 4]);
		expect(Array.from(flip_mask(mask, false, true).data)).toEqual([4, 5, 6, 1, 2, 3]);
	});

	it('finds the part of a selection over a layer', () => {
		expect(selection_on_layer({ x: -5, y: 5, width: 20, height: 20 }, { x: 0, y: 0, width: 10, height: 10 }))
			.toEqual({ x: 0, y: 5, width: 10, height: 5 });
		expect(selection_on_layer({ x: 50, y: 50, width: 5, height: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
	});
});
