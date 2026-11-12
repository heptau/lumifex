import app from './../../app.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { t } from '../tools/translate.js';
import { parse_version_info, is_newer, is_check_due, AUTO_CHECK_DELAY, AUTO_CHECK_INTERVAL } from './../../libs/app-update.js';

/**
 * Lumifex > Check for Updates - asks the server for `version.json` and, when there is a newer version, restarts the
 * application on it. A page that stays open for days (an installed PWA window) otherwise never notices a new release.
 * Restart = forget the service worker and its caches, then reload. Open documents are saved first (autosave) and
 * offered for restoring after the start.
 *
 * The same check also runs by itself (`start_auto_check`): a while after the start and then every few hours, also
 * when the window comes back to the front. It never interrupts the work - a newer version only shows a notice that
 * stays until it is clicked; the click opens the same offer as the menu command. Failures are silent.
 */
class Help_update_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
		this.checking = false;
		this.last_auto_check = null;
		this.announced = null;
		this.auto_started = false;
	}

	/**
	 * Starts the automatic checking (called once after the start of the application).
	 */
	start_auto_check() {
		if (this.auto_started) {
			return;
		}
		this.auto_started = true;
		const run = () => this.check_quietly();
		setTimeout(run, AUTO_CHECK_DELAY);
		//the timer only asks whether it is time; a sleeping computer does not run it, so the return of the window asks too
		setInterval(run, Math.min(AUTO_CHECK_INTERVAL, 60 * 60 * 1000));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState == 'visible') {
				run();
			}
		});
	}

	async check_quietly() {
		if (this.checking || navigator.onLine === false || !is_check_due(Date.now(), this.last_auto_check)) {
			return;
		}
		this.last_auto_check = Date.now();
		let latest;
		try {
			latest = await this.fetch_latest();
		}
		catch {
			return;
		}
		//every version is announced once, the menu command is there for later
		if (!is_newer(latest, VERSION) || latest === this.announced) {
			return;
		}
		this.announced = latest;
		const message = this.Helper.escapeHtml(t('Lumifex {new} is available. Click here to update.'))
			.replace('{new}', this.Helper.escapeHtml(latest));
		alertify.notify(message, 'message', 0, (clicked) => {
			if (clicked) {
				this.offer(latest);
			}
		});
	}

	/**
	 * @returns {Promise<string>} the version on the server
	 */
	async fetch_latest() {
		//a unique address and no-store: neither the browser cache nor the service worker may answer from the past
		const response = await fetch(`version.json?t=${Date.now()}`, {cache: 'no-store'});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const version = parse_version_info(await response.json());
		if (version === null) {
			throw new Error('invalid version.json');
		}
		return version;
	}

	async check() {
		if (this.checking) {
			return;
		}
		this.checking = true;
		let latest;
		try {
			latest = await this.fetch_latest();
		}
		catch {
			alertify.error(t('Could not check for updates. Are you online?'));
			return;
		}
		finally {
			this.checking = false;
		}

		if (!is_newer(latest, VERSION)) {
			alertify.success(`${t('Lumifex is up to date.')} (${VERSION})`);
			return;
		}
		this.offer(latest);
	}

	offer(latest) {
		const message = this.Helper.escapeHtml(t('Version {new} is available (you have {current}). Restart Lumifex to update?'))
			.replace('{new}', this.Helper.escapeHtml(latest))
			.replace('{current}', this.Helper.escapeHtml(VERSION));
		const note = this.Helper.escapeHtml(t('Open documents are saved automatically and offered for restoring after the restart.'));
		this.POP.show({
			title: 'Check for Updates',
			params: [
				{title: '', html: `<p>${message}</p><p>${note}</p>`},
			],
			on_finish: () => {
				this.update();
			},
		});
		const ok = this.POP.el.querySelector('[data-id="popup_ok"]');
		if (ok) {
			ok.classList.remove('trn');
			ok.textContent = t('Restart');
		}
	}

	async update() {
		//the session is stored first, so that the restart brings the documents back
		try {
			const documents = app.GUI && app.GUI.GUI_documents;
			if (documents && documents.has_content()) {
				clearTimeout(documents.autosave_timer);
				await documents.autosave();
			}
		}
		catch {
			//autosave is a convenience
		}
		try {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map((registration) => registration.unregister()));
		}
		catch {
			//no service worker (or no permission): the reload below still fetches the new files
		}
		try {
			const names = await caches.keys();
			await Promise.all(names.map((name) => caches.delete(name)));
		}
		catch {
			//no Cache API
		}
		//the user has just decided, no "leave site" question
		window.minipaint_quitting = true;
		window.location.reload();
	}

}

export default Help_update_class;
