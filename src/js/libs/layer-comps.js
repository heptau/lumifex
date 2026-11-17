/**
 * Layer Comps (Photoshop): named snapshots of the visibility, the position and the appearance (opacity, blend mode,
 * fill, styles) of the layers, kept in the document and applied back later. Pure functions.
 *
 * @typedef {{visibility: boolean, position: boolean, appearance: boolean}} Comp_options
 * @typedef {{id: number, name: string, comment: string, options: Comp_options, layers: Object<string, object>}} Layer_comp
 */

export const MAX_COMPS = 100;
const MAX_NAME = 100;

const APPEARANCE_KEYS = ['opacity', 'composition', 'fill_opacity', 'filters', 'effects_hidden'];

function clean_options(options) {
	const value = options && typeof options === 'object' ? options : {};
	return {
		visibility: value.visibility !== false,
		position: value.position !== false,
		appearance: value.appearance !== false,
	};
}

/**
 * The state of the layers that a comp remembers
 *
 * @param {object[]} layers
 * @param {Comp_options} options
 * @returns {Object<string, object>} by layer id
 */
export function snapshot_layers(layers, options) {
	const result = {};
	for (const layer of layers) {
		const item = {};
		if (options.visibility) {
			item.visible = layer.visible !== false;
		}
		if (options.position) {
			item.x = layer.x;
			item.y = layer.y;
		}
		if (options.appearance) {
			for (const key of APPEARANCE_KEYS) {
				if (layer[key] !== undefined) {
					item[key] = key === 'filters' ? JSON.parse(JSON.stringify(layer[key])) : layer[key];
				}
			}
		}
		result[layer.id] = item;
	}
	return result;
}

/**
 * @param {Layer_comp[]} comps
 * @param {object[]} layers
 * @param {string} name
 * @param {Comp_options} options
 * @param {string} [comment]
 * @returns {Layer_comp}
 */
export function capture_comp(comps, layers, name, options, comment = '') {
	const clean = clean_options(options);
	const id = comps.reduce((max, comp) => Math.max(max, comp.id), 0) + 1;
	return {
		id,
		name: String(name || `Layer Comp ${id}`).slice(0, MAX_NAME),
		comment: String(comment || '').slice(0, 1000),
		options: clean,
		layers: snapshot_layers(layers, clean),
	};
}

/**
 * The changes that bring the layers to the state of the comp. Layers made after the comp are left alone.
 *
 * @returns {{id: number, settings: object}[]}
 */
export function comp_changes(layers, comp) {
	const changes = [];
	for (const layer of layers) {
		const saved = comp.layers[layer.id];
		if (!saved) {
			continue;
		}
		const settings = {};
		for (const key of Object.keys(saved)) {
			const now = key === 'visible' ? layer.visible !== false : layer[key];
			if (JSON.stringify(now) !== JSON.stringify(saved[key])) {
				settings[key] = key === 'filters' ? JSON.parse(JSON.stringify(saved[key])) : saved[key];
			}
		}
		if (Object.keys(settings).length) {
			changes.push({id: layer.id, settings});
		}
	}
	return changes;
}

/**
 * @param {Layer_comp[]} comps
 * @param {number|null} current id
 * @param {1|-1} direction
 * @returns {Layer_comp|null}
 */
export function step_comp(comps, current, direction) {
	if (!comps.length) {
		return null;
	}
	const index = comps.findIndex((comp) => comp.id === current);
	if (index < 0) {
		return direction > 0 ? comps[0] : comps[comps.length - 1];
	}
	return comps[(index + direction + comps.length) % comps.length];
}

function finite(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates comps from a project file
 *
 * @param {*} list
 * @returns {Layer_comp[]}
 */
export function clean_comps(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	const result = [];
	const ids = new Set();
	for (const comp of list.slice(0, MAX_COMPS)) {
		if (!comp || typeof comp !== 'object' || !Number.isInteger(comp.id) || comp.id < 1 || ids.has(comp.id)) {
			continue;
		}
		if (!comp.layers || typeof comp.layers !== 'object' || Array.isArray(comp.layers)) {
			continue;
		}
		const layers = {};
		for (const key of Object.keys(comp.layers)) {
			const saved = comp.layers[key];
			if (!/^\d+$/.test(key) || !saved || typeof saved !== 'object') {
				continue;
			}
			const item = {};
			if (typeof saved.visible === 'boolean') item.visible = saved.visible;
			if (finite(saved.x)) item.x = saved.x;
			if (finite(saved.y)) item.y = saved.y;
			if (finite(saved.opacity)) item.opacity = Math.min(100, Math.max(0, saved.opacity));
			if (finite(saved.fill_opacity)) item.fill_opacity = Math.min(100, Math.max(0, saved.fill_opacity));
			if (typeof saved.composition === 'string' && saved.composition.length < 40) item.composition = saved.composition;
			if (typeof saved.effects_hidden === 'boolean') item.effects_hidden = saved.effects_hidden;
			if (Array.isArray(saved.filters)) item.filters = saved.filters;
			layers[key] = item;
		}
		ids.add(comp.id);
		result.push({
			id: comp.id,
			name: String(comp.name || `Layer Comp ${comp.id}`).slice(0, MAX_NAME),
			comment: typeof comp.comment === 'string' ? comp.comment.slice(0, 1000) : '',
			options: clean_options(comp.options),
			layers,
		});
	}
	return result;
}
