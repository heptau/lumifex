import { clean_history_steps, DEFAULT_HISTORY_STEPS, MIN_HISTORY_STEPS, MAX_HISTORY_STEPS } from '../src/js/libs/history-limit.js';

describe('clean_history_steps', () => {
	it('keeps a number in the range', () => {
		expect(clean_history_steps(80)).toBe(80);
		expect(clean_history_steps('120')).toBe(120);
		expect(clean_history_steps(33.9)).toBe(33);
	});

	it('limits it to the range', () => {
		expect(clean_history_steps(1)).toBe(MIN_HISTORY_STEPS);
		expect(clean_history_steps(-5)).toBe(MIN_HISTORY_STEPS);
		expect(clean_history_steps(100000)).toBe(MAX_HISTORY_STEPS);
	});

	it('falls back to the default for anything that is not a number', () => {
		expect(clean_history_steps(undefined)).toBe(DEFAULT_HISTORY_STEPS);
		expect(clean_history_steps(null)).toBe(DEFAULT_HISTORY_STEPS);
		expect(clean_history_steps('many')).toBe(DEFAULT_HISTORY_STEPS);
		expect(clean_history_steps(NaN)).toBe(DEFAULT_HISTORY_STEPS);
		expect(DEFAULT_HISTORY_STEPS).toBe(50);
	});
});
