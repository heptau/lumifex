import { default_view, is_default_view, toggle_channel, solo_channel, view_matrix, compose_filter } from '../src/js/libs/channel-view.js';

describe('channel view', () => {
	it('shows everything by default and needs no matrix', () => {
		expect(is_default_view(default_view())).toBe(true);
		expect(view_matrix(default_view())).toBeNull();
	});

	it('hides and shows color channels one by one', () => {
		let view = toggle_channel(default_view(), 'red');
		expect(view.hidden).toEqual(['red']);
		expect(view_matrix(view)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
		view = toggle_channel(view, 'blue');
		expect(view.hidden).toEqual(['red', 'blue']);
		view = toggle_channel(toggle_channel(view, 'red'), 'blue');
		expect(is_default_view(view)).toBe(true);
	});

	it('ignores the transparency and unknown names for the eye', () => {
		const view = default_view();
		expect(toggle_channel(view, 'alpha')).toBe(view);
		expect(toggle_channel(view, 'x')).toBe(view);
	});

	it('shows a single channel as gray', () => {
		const green = solo_channel(default_view(), 'green');
		expect(green.solo).toBe('green');
		expect(view_matrix(green)).toEqual([0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0]);
		expect(view_matrix(solo_channel(default_view(), 'alpha'))).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
	});

	it('leaves a single channel view with the eye or a click on RGB', () => {
		const solo = solo_channel(default_view(), 'red');
		expect(toggle_channel(solo, 'green').hidden).toEqual(['green']);
		expect(toggle_channel(solo, 'green').solo).toBeNull();
		expect(is_default_view(solo_channel(solo, null))).toBe(true);
		expect(is_default_view(solo_channel(solo, 'rgb'))).toBe(true);
	});

	it('joins filter values and skips empty ones', () => {
		expect(compose_filter(['url(#a)', '', null, 'url(#b)'])).toBe('url(#a) url(#b)');
		expect(compose_filter([])).toBe('');
	});
});
