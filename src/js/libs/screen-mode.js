/**
 * Screen modes of Photoshop (View > Screen Mode, F cycles them, Shift+F backwards):
 * standard = the window as it is, menu = full screen with the menu bar and the panels,
 * full = full screen with only the picture (panels, menu and status bar hidden).
 */
export const SCREEN_MODES = ['standard', 'menu', 'full'];

/**
 * @param {string} mode current mode (unknown = standard)
 * @param {boolean} [backwards]
 * @returns {string}
 */
export function next_screen_mode(mode, backwards = false) {
	const index = Math.max(0, SCREEN_MODES.indexOf(mode));
	const step = backwards ? SCREEN_MODES.length - 1 : 1;
	return SCREEN_MODES[(index + step) % SCREEN_MODES.length];
}

/**
 * @param {string} mode
 * @returns {string} a known mode
 */
export function clean_screen_mode(mode) {
	return SCREEN_MODES.includes(mode) ? mode : 'standard';
}
