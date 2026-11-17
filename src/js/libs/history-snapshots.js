/**
 * History snapshots (Photoshop: History panel > New Snapshot) - pure helpers for the list of named states of
 * a document. A snapshot is `{id, name, json, canvas}`; this file only works with the list, the names and the
 * ids, so it does not need the DOM.
 */

//snapshots keep a whole project JSON each, so their number is limited
export const MAX_SNAPSHOTS = 20;
export const MAX_SNAPSHOT_NAME = 64;

/**
 * Cleans a name typed by the user: trimmed, control characters removed, at most MAX_SNAPSHOT_NAME characters;
 * an empty result gives `fallback`
 *
 * @param {*} name
 * @param {string} fallback
 * @returns {string}
 */
export function clean_snapshot_name(name, fallback) {
	let text = typeof name == 'string' ? name : '';
	// eslint-disable-next-line no-control-regex
	text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	if (text.length > MAX_SNAPSHOT_NAME) {
		text = text.slice(0, MAX_SNAPSHOT_NAME).trim();
	}
	return text || fallback;
}

/**
 * The next free default name "Snapshot N" (N = one more than the highest number used by such a name)
 *
 * @param {{name: string}[]|null|undefined} list
 * @param {string} word the translated word "Snapshot"
 * @returns {string}
 */
export function next_snapshot_name(list, word = 'Snapshot') {
	let highest = 0;
	const prefix = `${word} `;
	for (const item of list || []) {
		if (item && typeof item.name == 'string' && item.name.startsWith(prefix)) {
			const number = Number(item.name.slice(prefix.length));
			if (Number.isInteger(number) && number > highest) {
				highest = number;
			}
		}
	}
	return `${word} ${highest + 1}`;
}

/**
 * A new list with the snapshot added at the end; when the list is full the oldest snapshots are dropped
 *
 * @template T
 * @param {T[]} list
 * @param {T} snapshot
 * @param {number} max
 * @returns {{list: T[], dropped: T[]}}
 */
export function add_snapshot(list, snapshot, max = MAX_SNAPSHOTS) {
	const next = (list || []).concat([snapshot]);
	const limit = Math.max(1, Math.floor(max) || 1);
	const dropped = next.length > limit ? next.slice(0, next.length - limit) : [];
	return {list: next.slice(next.length - Math.min(limit, next.length)), dropped};
}

/**
 * A new list without the snapshot of the given id
 */
export function remove_snapshot(list, id) {
	return (list || []).filter((item) => item.id !== id);
}

/**
 * A new list where the snapshot of the given id has a new (cleaned) name
 */
export function rename_snapshot(list, id, name) {
	return (list || []).map((item) => (item.id === id ? Object.assign({}, item, {name: clean_snapshot_name(name, item.name)}) : item));
}

/**
 * The id of the History Brush source after the list changed: an id that is no longer in the list falls back to
 * null (= the state before the first change of the document)
 */
export function valid_source(list, id) {
	if (id == null) {
		return null;
	}
	return (list || []).some((item) => item.id === id) ? id : null;
}
