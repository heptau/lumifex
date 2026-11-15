/**
 * Smart filters (Photoshop): a pixel filter that is not baked into the layer. The layer keeps its original picture
 * and a list of filters (`layer.filters`, entries with the name "smart"); the filters are computed when the layer is
 * drawn, so their settings can be edited, switched off or deleted at any time. Pure functions, no DOM.
 *
 * A smart filter entry: {id, name: 'smart', params: {key, settings, enabled}}.
 *
 * @typedef {{data: Uint8ClampedArray, width: number, height: number}} Image_data
 * @typedef {{name?: string, title?: string, value?: any, values?: string[], range?: number[], step?: number, type?: string, heading?: string}} Param
 */
import * as Adjustments from './adjustments.js';
import * as Filters from './filters.js';
import { ADJUSTMENTS } from './adjustment-layers.js';
import { deserialize_layer_mask, shape_layer_mask } from './layer-mask.js';
import { resize_mask } from './selection-mask.js';

/**
 * A repeatable "random" generator: the same noise is drawn on every redraw, otherwise the picture would flicker
 *
 * @param {number} [seed]
 * @returns {function(): number} values in [0, 1)
 */
export function seeded_random(seed = 20240229) {
	let state = seed % 2147483647;
	if (state <= 0) {
		state += 2147483646;
	}
	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

/**
 * Key -> {title, params (as the dialogs of Image > Adjustments), apply}. The color adjustments are shared with the
 * adjustment layers; adjustments with their own editor (Curves) are not offered.
 *
 * @type {Object<string, {title: string, params: Param[], apply: function(Image_data, any): Image_data}>}
 */
export const SMART_FILTERS = {};

Object.keys(ADJUSTMENTS).forEach((key) => {
	const definition = ADJUSTMENTS[key];
	if (!definition.state) {
		SMART_FILTERS[key] = {title: definition.title, params: definition.params, apply: definition.apply};
	}
});

Object.assign(SMART_FILTERS, {
	gaussian_blur: {
		title: 'Gaussian Blur',
		params: [
			{name: 'radius', title: 'Radius:', value: 3, range: [0, 100], step: 0.1},
		],
		apply: (img, s) => Filters.gaussianBlur(img, s),
	},
	unsharp_mask: {
		title: 'Unsharp Mask',
		params: [
			{name: 'amount', title: 'Amount:', value: 100, range: [0, 500]},
			{name: 'radius', title: 'Radius:', value: 2, range: [1, 50]},
			{name: 'threshold', title: 'Threshold:', value: 0, range: [0, 255]},
		],
		apply: (img, s) => Filters.unsharpMask(img, s),
	},
	smart_sharpen: {
		title: 'Smart Sharpen',
		params: [
			{name: 'amount', title: 'Amount:', value: 100, range: [0, 500]},
			{name: 'radius', title: 'Radius:', value: 2, range: [1, 50]},
			{name: 'reduce_noise', title: 'Reduce noise:', value: 10, range: [0, 100]},
			{name: 'fade_shadows', title: 'Fade shadows:', value: 0, range: [0, 100]},
			{name: 'fade_highlights', title: 'Fade highlights:', value: 0, range: [0, 100]},
		],
		apply: (img, s) => Filters.smartSharpen(img, s),
	},
	high_pass: {
		title: 'High Pass',
		params: [{name: 'radius', title: 'Radius:', value: 5, range: [1, 100]}],
		apply: (img, s) => Filters.highPass(img, s.radius),
	},
	median: {
		title: 'Median',
		params: [{name: 'radius', title: 'Radius:', value: 1, range: [1, 5]}],
		apply: (img, s) => Filters.median(img, s.radius),
	},
	motion_blur: {
		title: 'Motion Blur',
		params: [
			{name: 'angle', title: 'Angle:', value: 0, range: [-180, 180]},
			{name: 'distance', title: 'Distance:', value: 10, range: [1, 100]},
		],
		apply: (img, s) => Filters.motionBlur(img, s),
	},
	smart_blur: {
		title: 'Smart Blur',
		params: [
			{name: 'radius', title: 'Radius:', value: 3, range: [1, 10]},
			{name: 'threshold', title: 'Threshold:', value: 25, range: [1, 255]},
		],
		apply: (img, s) => Filters.smartBlur(img, s),
	},
	surface_blur: {
		title: 'Surface Blur',
		params: [
			{name: 'radius', title: 'Radius:', value: 3, range: [1, 10]},
			{name: 'threshold', title: 'Threshold:', value: 30, range: [1, 255]},
		],
		apply: (img, s) => Filters.surfaceBlur(img, s),
	},
	clarity: {
		title: 'Clarity',
		params: [
			{name: 'amount', title: 'Amount:', value: 30, range: [-100, 100]},
			{name: 'radius', title: 'Radius:', value: 20, range: [1, 100]},
		],
		apply: (img, s) => Filters.clarity(img, s.amount, s.radius),
	},
	pixelate: {
		title: 'Pixelate',
		params: [{name: 'size', title: 'Cell size:', value: 8, range: [2, 100]}],
		apply: (img, s) => Filters.pixelate(img, s.size),
	},
	emboss: {
		title: 'Emboss',
		params: [
			{name: 'angle', title: 'Angle:', value: 135, range: [0, 360]},
			{name: 'amount', title: 'Amount:', value: 100, range: [1, 500]},
		],
		apply: (img, s) => Filters.emboss(img, s),
	},
	find_edges: {
		title: 'Find Edges',
		params: [],
		apply: (img) => Filters.findEdges(img),
	},
	add_noise: {
		title: 'Add Noise',
		params: [
			{name: 'amount', title: 'Amount:', value: 10, range: [0, 100]},
			{name: 'gaussian', title: 'Gaussian:', value: false},
			{name: 'monochrome', title: 'Monochromatic:', value: false},
		],
		apply: (img, s) => Adjustments.addNoise(img, s, seeded_random()),
	},
});

/** The picture is not filtered above this size (the browser would run out of memory) */
export const MAX_SMART_PIXELS = 100e6;

/**
 * @param {any} key
 * @returns {boolean}
 */
export function is_smart_filter(key) {
	return typeof key == 'string' && Object.prototype.hasOwnProperty.call(SMART_FILTERS, key);
}

/**
 * Settings of a new smart filter: the usual starting values
 *
 * @param {string} key
 * @returns {Object<string, any>}
 */
export function default_smart_settings(key) {
	/** @type {Object<string, any>} */
	const settings = {};
	if (!is_smart_filter(key)) {
		return settings;
	}
	SMART_FILTERS[key].params.forEach((param) => {
		if (param.name) {
			settings[param.name] = param.value !== undefined ? param.value : (param.values ? param.values[0] : null);
		}
	});
	return settings;
}

/**
 * Settings from a saved project can be anything: the ones that do not belong to the filter are dropped, missing
 * ones get the default, numbers stay inside the range of the slider.
 *
 * @param {string} key
 * @param {any} [stored]
 * @returns {Object<string, any>}
 */
export function clean_smart_settings(key, stored) {
	const defaults = default_smart_settings(key);
	/** @type {Object<string, any>} */
	const result = {};
	const definition = is_smart_filter(key) ? SMART_FILTERS[key] : null;
	Object.keys(defaults).forEach((name) => {
		let value = stored && typeof stored == 'object' && stored[name] !== undefined ? stored[name] : defaults[name];
		if (typeof defaults[name] == 'boolean') {
			value = value === true || value === 'true';
		}
		else if (typeof defaults[name] == 'number') {
			value = parseFloat(value);
			if (!isFinite(value)) {
				value = defaults[name];
			}
			const param = definition && definition.params.find((p) => p.name == name);
			if (param && param.range) {
				value = Math.min(param.range[1], Math.max(param.range[0], value));
			}
		}
		result[name] = value;
	});
	return result;
}

/**
 * A new entry for `layer.filters`
 *
 * @param {string} key
 * @param {any} [settings]
 * @param {number|string} [id] the id of an existing filter (when it is edited)
 * @returns {{id: number|string, name: string, params: {key: string, settings: Object<string, any>, enabled: boolean}}}
 */
export function make_smart_filter(key, settings, id, enabled = true) {
	return {
		id: id !== undefined ? id : Math.floor(Math.random() * 999999999) + 1,
		name: 'smart',
		params: {key, settings: clean_smart_settings(key, settings), enabled},
	};
}

/**
 * @param {any} filter an entry of `layer.filters`
 * @returns {boolean}
 */
export function is_smart_entry(filter) {
	return !!filter && filter.name === 'smart';
}

/**
 * The smart filters of a layer that are switched on, in the order they are applied
 *
 * @param {any[]|undefined} filters `layer.filters`
 * @returns {{key: string, settings: Object<string, any>}[]}
 */
export function active_smart_filters(filters) {
	/** @type {{key: string, settings: Object<string, any>}[]} */
	const list = [];
	(filters || []).forEach((filter) => {
		if (is_smart_entry(filter) && filter.params && filter.params.enabled !== false && is_smart_filter(filter.params.key)) {
			list.push({key: filter.params.key, settings: clean_smart_settings(filter.params.key, filter.params.settings)});
		}
	});
	return list;
}

/**
 * A text that is the same for the same filters (a cache key)
 *
 * @param {{key: string, settings: Object<string, any>}[]} list from active_smart_filters()
 * @returns {string}
 */
export function smart_signature(list) {
	return JSON.stringify(list);
}

/**
 * Runs the filters over the picture, one after another. The picture is changed in place.
 *
 * @param {Image_data} image
 * @param {{key: string, settings: Object<string, any>}[]} list from active_smart_filters()
 * @returns {Image_data}
 */
export function run_smart_filters(image, list) {
	let result = image;
	list.forEach((item) => {
		result = SMART_FILTERS[item.key].apply(result, item.settings) || result;
	});
	return result;
}

/**
 * The mask shared by all smart filters of a layer (`layer.smart_mask`, the format of a layer mask, 255 = filtered).
 *
 * @param {any} layer
 * @returns {boolean} the layer has a smart filter mask that is switched on
 */
export function has_smart_mask(layer) {
	return !!layer && !!layer.smart_mask && layer.smart_mask_enabled !== false;
}

/**
 * @param {any} stored value of `layer.smart_mask`
 * @param {number} width size of the picture
 * @param {number} height
 * @param {any} [density] percent, 100 by default
 * @param {any} [feather] pixels, 0 by default
 * @returns {Uint8ClampedArray|null} strengths of the filters per pixel of the picture, null when the mask is not valid
 */
export function smart_mask_weights(stored, width, height, density, feather) {
	const decoded = deserialize_layer_mask(stored);
	const mask = decoded ? shape_layer_mask(decoded, density, feather) : null;
	return mask && width > 0 && height > 0 ? resize_mask(mask, width, height).data : null;
}

/**
 * Mixes the filtered picture with the original: where the mask is 255 the filtered pixel stays, where it is 0 the
 * original comes back. The filtered picture is changed in place.
 *
 * @param {Image_data} original
 * @param {Image_data} filtered same size
 * @param {Uint8ClampedArray} weights one value per pixel
 * @returns {Image_data} filtered
 */
export function mix_with_mask(original, filtered, weights) {
	const o = original.data;
	const f = filtered.data;
	for (let p = 0, i = 0; p < weights.length && i < f.length; p++, i += 4) {
		const m = weights[p] / 255;
		if (m == 1) {
			continue;
		}
		for (let c = 0; c < 4; c++) {
			f[i + c] = o[i + c] + (f[i + c] - o[i + c]) * m;
		}
	}
	return filtered;
}
