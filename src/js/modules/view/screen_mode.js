import { next_screen_mode, clean_screen_mode } from './../../libs/screen-mode.js';
import { PANELS, is_panel_visible, set_panel_visible } from './../../libs/panels.js';

let instance = null;

/**
 * View > Screen Mode (F cycles, Shift+F backwards) - as in Photoshop. "Full Screen Mode with Menu Bar" puts the window
 * in full screen, "Full Screen Mode" also hides the panels, the menu and the status bar (they come back as they were).
 * Leaving the full screen of the browser (Esc) returns to the standard mode.
 */
class View_screen_mode_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
		this.mode = 'standard';
		this.saved_panels = null; //panels visible before the full mode
		document.addEventListener('fullscreenchange', () => {
			if (!document.fullscreenElement && this.mode != 'standard' && this.fullscreen_used) {
				this.apply('standard', false);
			}
		});
	}

	cycle() {
		this.apply(next_screen_mode(this.mode));
	}

	cycle_back() {
		this.apply(next_screen_mode(this.mode, true));
	}

	/**
	 * @param {string} mode standard, menu or full
	 */
	set(mode) {
		this.apply(clean_screen_mode(mode));
	}

	apply(mode, use_fullscreen = true) {
		const previous = this.mode;
		this.mode = mode;
		document.body.classList.toggle('screen_menu', mode == 'menu');
		document.body.classList.toggle('screen_full', mode == 'full');

		if (mode == 'full' && previous != 'full') {
			this.saved_panels = Object.keys(PANELS).filter((name) => is_panel_visible(name));
			for (const name in PANELS) {
				set_panel_visible(name, false, false, false);
			}
		}
		if (mode != 'full' && previous == 'full' && this.saved_panels) {
			for (const name of this.saved_panels) {
				set_panel_visible(name, true, false, false);
			}
			this.saved_panels = null;
		}

		if (use_fullscreen) {
			try {
				if (mode != 'standard' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
					this.fullscreen_used = true;
					const request = document.documentElement.requestFullscreen();
					if (request && request.catch) {
						request.catch(() => {
							this.fullscreen_used = false; //not allowed (an embedded page): the modes still hide the interface
						});
					}
				}
				else if (mode == 'standard' && document.fullscreenElement && document.exitFullscreen) {
					this.fullscreen_used = false;
					document.exitFullscreen();
				}
			}
			catch {
				this.fullscreen_used = false;
			}
		}
		window.dispatchEvent(new Event('resize'));
		document.dispatchEvent(new Event('minipaint:history'));
	}
}

export default View_screen_mode_class;
