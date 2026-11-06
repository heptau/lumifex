/**
 * Number keys set the opacity of the active layer like in Photoshop: 1 = 10 %, 5 = 50 %, 0 = 100 %; two digits typed
 * quickly after each other make an exact value (3, 5 = 35 %), 0, 0 = 0 %. Pure functions without the DOM.
 */

//the second digit counts only when it follows the first one within this time (ms)
export const DIGIT_WINDOW = 800;

/**
 * Reads a digit from a keyboard event without modifiers. The physical key is used (the Czech number row types
 * "ě", "š"… without Shift), the keys with Ctrl/Cmd/Alt/Shift are never digits for this feature.
 *
 * @param {{code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, repeat?: boolean}} event
 * @returns {number|null} 0-9 or null
 */
export function digit_from_event(event) {
	if (!event || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) {
		return null;
	}
	const match = /^(?:Digit|Numpad)(\d)$/.exec(String(event.code || ''));
	return match ? parseInt(match[1], 10) : null;
}

/**
 * Computes the new opacity after a digit was pressed.
 *
 * @param {{first: number|null, time: number}|null} state the previous state (null at the start)
 * @param {number} digit 0-9
 * @param {number} now time of the key press (ms)
 * @returns {{opacity: number, state: {first: number|null, time: number}}}
 */
export function next_opacity(state, digit, now) {
	digit = Math.min(9, Math.max(0, parseInt(digit, 10) || 0));
	const follows = state && state.first !== null && now - state.time <= DIGIT_WINDOW && now >= state.time;

	if (follows) {
		//a second digit: 3, 5 = 35 %; 0, 0 = 0 %
		const opacity = state.first === 0 ? 0 : state.first * 10 + digit;
		return { opacity, state: { first: null, time: now } };
	}
	//a single digit: the tens, 0 = 100 %
	const opacity = digit === 0 ? 100 : digit * 10;
	return { opacity, state: { first: digit, time: now } };
}
