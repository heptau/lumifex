/**
 * Selecting several layers in the Layers panel (Photoshop): Ctrl/Cmd + click adds or removes a layer, Shift + click
 * selects the range from the active layer. The selection is a list of layer ids that contains the active layer; when
 * the active layer is changed in another way (it is not in the list), only the active layer is selected. Pure functions.
 */

/**
 * @param {number[]} selection ids (may be empty or stale)
 * @param {number|null} active_id
 * @param {number[]} existing ids of all layers
 * @returns {number[]} the selected ids, the active one always among them ([] when there is no active layer)
 */
export function clean_selection(selection, active_id, existing) {
	if (active_id === null || active_id === undefined) {
		return [];
	}
	const known = new Set(existing);
	const list = Array.isArray(selection) ? selection.filter((id, index) => known.has(id) && selection.indexOf(id) === index) : [];
	if (!list.includes(active_id)) {
		return [active_id];
	}
	return list;
}

/**
 * Ctrl/Cmd + click on a layer row
 *
 * @returns {{active: number, selection: number[]}}
 */
export function toggle_selection(selection, active_id, clicked_id, existing) {
	const current = clean_selection(selection, active_id, existing);
	if (!current.includes(clicked_id)) {
		return {active: clicked_id, selection: current.concat([clicked_id])};
	}
	if (current.length === 1) {
		return {active: active_id, selection: current}; //the last selected layer stays selected
	}
	const rest = current.filter((id) => id !== clicked_id);
	return {active: clicked_id === active_id ? rest[rest.length - 1] : active_id, selection: rest};
}

/**
 * Shift + click on a layer row: everything between the active layer and the clicked one in the panel order
 *
 * @param {number[]} ordered ids in the order of the panel
 * @returns {{active: number, selection: number[]}}
 */
export function range_selection(ordered, active_id, clicked_id) {
	const from = ordered.indexOf(active_id);
	const to = ordered.indexOf(clicked_id);
	if (from < 0 || to < 0) {
		return {active: clicked_id, selection: [clicked_id]};
	}
	const start = Math.min(from, to);
	const end = Math.max(from, to);
	return {active: active_id, selection: ordered.slice(start, end + 1)};
}

/**
 * The bounding box of several layer rectangles (for aligning layers to each other)
 *
 * @param {{left: number, top: number, right: number, bottom: number}[]} boxes
 * @returns {{left: number, top: number, right: number, bottom: number}|null}
 */
export function union_bounds(boxes) {
	if (!boxes.length) {
		return null;
	}
	return boxes.reduce((all, box) => ({
		left: Math.min(all.left, box.left),
		top: Math.min(all.top, box.top),
		right: Math.max(all.right, box.right),
		bottom: Math.max(all.bottom, box.bottom),
	}));
}

/**
 * How many steps down a merged layer (put on top) must move to take the place of the topmost merged layer
 *
 * @param {{id: number, order: number}[]} layers all layers before the merge
 * @param {number[]} merged ids
 * @returns {number}
 */
export function steps_to_place(layers, merged) {
	const chosen = layers.filter((layer) => merged.includes(layer.id));
	if (!chosen.length) {
		return 0;
	}
	const top = Math.max(...chosen.map((layer) => layer.order));
	return layers.filter((layer) => !merged.includes(layer.id) && layer.order > top).length;
}
