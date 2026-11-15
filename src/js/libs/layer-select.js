/**
 * Layer > Select Next / Previous / Top / Bottom Layer (Photoshop: Alt+] Alt+[ Alt+. Alt+,): moving the selection
 * through the stack of layers. Pure functions, no DOM.
 */

/**
 * @param {Array<{id: *, order: number}>} layers
 * @param {*} current_id the active layer
 * @param {string} where "next" (one layer up), "previous" (one down), "top" or "bottom"
 * @returns {*} the id of the layer to select, or null when nothing changes (the end of the stack, a single layer)
 */
export function layer_to_select(layers, current_id, where) {
	const stack = (layers || []).filter((layer) => layer && isFinite(layer.order)).sort((a, b) => a.order - b.order);
	if (stack.length < 2) {
		return null;
	}
	const index = stack.findIndex((layer) => layer.id == current_id);
	let target = -1;
	if (where == 'top') {
		target = stack.length - 1;
	}
	else if (where == 'bottom') {
		target = 0;
	}
	else if (index >= 0 && where == 'next') {
		target = index + 1;
	}
	else if (index >= 0 && where == 'previous') {
		target = index - 1;
	}
	if (target < 0 || target >= stack.length || target == index) {
		return null;
	}
	return stack[target].id;
}

/**
 * Which layers have to change their visibility for Layer > Show All Layers / Hide Other Layers
 *
 * @param {Array<{id: *, visible?: boolean, type?: *}>} layers
 * @param {*} current_id the active layer
 * @param {string} mode "show_all" shows every hidden layer, "hide_others" shows the active layer and hides all the others
 * @returns {Array} ids of the layers to toggle (empty when nothing changes)
 */
export function visibility_toggles(layers, current_id, mode) {
	const ids = [];
	for (const layer of layers || []) {
		if (!layer) {
			continue;
		}
		const visible = layer.visible !== false;
		if (mode == 'show_all' && !visible) {
			ids.push(layer.id);
		}
		else if (mode == 'hide_others') {
			const wanted = layer.id == current_id;
			if (visible != wanted) {
				ids.push(layer.id);
			}
		}
	}
	return ids;
}
