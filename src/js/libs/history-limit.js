/**
 * Edit > History keeps the last steps of the undo history; how many is a setting (Settings > Behavior > History steps).
 * Pure functions, no DOM.
 */

/** The number of steps when nothing was chosen (the value from before the setting existed) */
export const DEFAULT_HISTORY_STEPS = 50;
export const MIN_HISTORY_STEPS = 10;
export const MAX_HISTORY_STEPS = 200;

/**
 * @param {any} value what the setting holds (a number, a string from a cookie, anything)
 * @returns {number} a whole number of steps between MIN_HISTORY_STEPS and MAX_HISTORY_STEPS, the default for anything that is
 *  not a number
 */
export function clean_history_steps(value) {
	const number = parseInt(value, 10);
	if (isNaN(number)) {
		return DEFAULT_HISTORY_STEPS;
	}
	return Math.min(MAX_HISTORY_STEPS, Math.max(MIN_HISTORY_STEPS, number));
}
