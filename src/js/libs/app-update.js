/**
 * Checking for a new version of the application (Lumifex > Check for Updates). The build publishes `version.json`
 * (`{"version": "X.Y.Z"}`, made from the VERSION file); the running application compares it with its own version.
 * Pure functions without the DOM.
 */

/**
 * @param {*} data parsed version.json
 * @returns {string|null} the version "X.Y.Z" or null when the file is not valid (it is data from the network)
 */
export function parse_version_info(data) {
	if (data === null || typeof data !== 'object' || typeof data.version !== 'string') {
		return null;
	}
	const version = data.version.trim();
	return /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version) ? version : null;
}

/**
 * @param {string} remote version on the server
 * @param {string} current version of the running application
 * @returns {boolean} true when the remote version is higher (a lower or equal one, or an invalid one, is not an update)
 */
export function is_newer(remote, current) {
	const a = parse_version_info({version: remote});
	const b = parse_version_info({version: current});
	if (a === null || b === null) {
		return false;
	}
	const x = a.split('.').map(Number);
	const y = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if (x[i] !== y[i]) {
			return x[i] > y[i];
		}
	}
	return false;
}
