/**
 * Smart objects (Photoshop Layer > Smart Objects): an image layer that keeps its source document.
 *
 * `layer.smart_object = {format: 'lumifex-smart', version: 1, document, width, height}`, where `document` is the
 * project JSON of the contents (the same data as File > Save as JSON) and width / height its size. The picture of
 * the layer is the flattened contents at their natural size, so everything that reads image layers keeps working;
 * pixel edits are refused (Rasterize first) and smart filters are applied over it as on any picture.
 * Pure functions, no DOM.
 */

export const SMART_OBJECT_FORMAT = 'lumifex-smart';
export const SMART_OBJECT_VERSION = 1;
//the length of the source project JSON
export const MAX_SMART_DOCUMENT = 50 * 1024 * 1024;
//one side of the contents in pixels
export const MAX_SMART_SIDE = 30000;

export const SMART_OBJECT_MESSAGE = 'This is a smart object. Rasterize it first (Layer > Smart Objects > Rasterize).';

/**
 * @param {object|null|undefined} layer
 * @returns {boolean} the layer is a smart object
 */
export function is_smart_object(layer) {
	return Boolean(layer) && layer.type == 'image' && layer.smart_object != null && typeof layer.smart_object == 'object';
}

/**
 * @param {*} value
 * @returns {number|null} a whole number of pixels 1..MAX_SMART_SIDE
 */
function clean_side(value) {
	const number = Number(value);
	if (!Number.isInteger(number) || number < 1 || number > MAX_SMART_SIDE) {
		return null;
	}
	return number;
}

/**
 * @param {string} document project JSON of the contents
 * @param {number} width
 * @param {number} height
 * @returns {{format: string, version: number, document: string, width: number, height: number}}
 */
export function make_smart_object(document, width, height) {
	return {format: SMART_OBJECT_FORMAT, version: SMART_OBJECT_VERSION, document, width, height};
}

/**
 * Checks a smart object that comes from a saved project. The document must be a project with the declared size.
 *
 * @param {*} value
 * @returns {object|null} a clean copy, null when it is not valid (the layer is then an ordinary picture)
 */
export function sanitize_smart_object(value) {
	if (value === null || typeof value != 'object' || Array.isArray(value)) {
		return null;
	}
	if (value.format !== SMART_OBJECT_FORMAT || value.version !== SMART_OBJECT_VERSION) {
		return null;
	}
	if (typeof value.document != 'string' || value.document.length == 0 || value.document.length > MAX_SMART_DOCUMENT) {
		return null;
	}
	const width = clean_side(value.width);
	const height = clean_side(value.height);
	if (width == null || height == null) {
		return null;
	}
	const info = project_info(value.document);
	if (!info || info.width != width || info.height != height) {
		return null;
	}
	return make_smart_object(value.document, width, height);
}

/**
 * @param {string} json project JSON
 * @returns {{width: number, height: number}|null} the size of the project, null when it is not a project
 */
export function project_info(json) {
	let project;
	try {
		project = JSON.parse(json);
	}
	catch {
		return null;
	}
	if (!project || typeof project != 'object' || !project.info || typeof project.info != 'object' || !Array.isArray(project.layers)) {
		return null;
	}
	const width = clean_side(project.info.width);
	const height = clean_side(project.info.height);
	if (width == null || height == null) {
		return null;
	}
	return {width, height};
}

//the properties of a layer that say how it is put into the document; the contents of a smart object get the defaults,
//the smart object layer keeps them
const APPEARANCE_DEFAULTS = {
	visible: true,
	opacity: 100,
	fill_opacity: 100,
	composition: 'source-over',
	filters: [],
	smart_mask: null,
	smart_mask_enabled: true,
	locked: false,
	lock_alpha: false,
	group: null,
	group_opacity: 100,
	group_props: null,
	color_label: null,
	link_id: null,
	blend_if: null,
	effects_hidden: false,
	rotate: 0,
};

/**
 * The layer as it goes into the contents of a smart object: its own data stay, its placement in the parent
 * document (opacity, blend mode, styles, group, link, rotation...) is reset. Only keys the layer has are changed.
 *
 * @param {object} layer plain copy of a layer (no private keys)
 * @param {number} x position in the contents
 * @param {number} y
 * @param {{keep_mask?: boolean, id?: number}} [options] keep_mask: the layer mask stays with the contents
 * @returns {Object<string, any>} a new object
 */
export function contents_layer(layer, x, y, options = {}) {
	const result = JSON.parse(JSON.stringify(layer));
	for (const key of Object.keys(APPEARANCE_DEFAULTS)) {
		if (key in result) {
			result[key] = JSON.parse(JSON.stringify(APPEARANCE_DEFAULTS[key]));
		}
	}
	if (options.keep_mask !== true && 'mask' in result) {
		result.mask = null;
	}
	result.x = x;
	result.y = y;
	result.visible = true;
	result.id = options.id || 1;
	result.order = 1;
	return result;
}

/**
 * A project JSON with the given layers (the format of File > Save as JSON)
 *
 * @param {{width: number, height: number, version: string, layers: object[], data?: object[], resolution?: number|null, units?: string|null}} project
 * @returns {string}
 */
export function build_project(project) {
	const layers = project.layers || [];
	return JSON.stringify({
		info: {
			width: project.width,
			height: project.height,
			about: 'Image data with multi-layers. Can be opened using Lumifex - https://github.com/heptau/lumifex',
			version: project.version,
			layer_active: layers.length > 0 ? layers[0].id : null,
			guides: [],
			resolution: project.resolution || null,
			units: project.units || null,
		},
		user_fonts: {},
		layers,
		data: project.data || [],
	});
}

/**
 * The project of a single picture (File > Place Embedded, Replace Contents)
 *
 * @param {string} name
 * @param {string} data_url PNG of the picture
 * @param {number} width
 * @param {number} height
 * @param {string} version application version
 * @returns {string}
 */
export function picture_project(name, data_url, width, height, version) {
	return build_project({
		width,
		height,
		version,
		layers: [{
			id: 1,
			name: String(name || 'Layer').slice(0, 200),
			type: 'image',
			x: 0,
			y: 0,
			width,
			height,
			width_original: width,
			height_original: height,
			visible: true,
			opacity: 100,
			order: 1,
			composition: 'source-over',
			rotate: 0,
			params: {},
			filters: [],
		}],
		data: [{id: 1, data: data_url}],
	});
}

/**
 * Where the picture of a converted vector layer goes. The layer was drawn unrotated onto a work canvas whose
 * origin is `margin` px left of and above the layer; `bounds` is the visible part of that canvas. The new picture
 * keeps the rotation of the layer around its old center.
 *
 * @param {{x: number, y: number, width: number, height: number, rotate?: number}} layer
 * @param {number} margin
 * @param {{x: number, y: number, width: number, height: number}} bounds
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function place_contents(layer, margin, bounds) {
	const center_x = layer.x + layer.width / 2;
	const center_y = layer.y + layer.height / 2;
	//the unrotated center of the picture, relative to the old center
	const dx = layer.x - margin + bounds.x + bounds.width / 2 - center_x;
	const dy = layer.y - margin + bounds.y + bounds.height / 2 - center_y;
	const angle = (Number(layer.rotate) || 0) * Math.PI / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const new_cx = center_x + dx * cos - dy * sin;
	const new_cy = center_y + dx * sin + dy * cos;
	return {
		x: Math.round((new_cx - bounds.width / 2) * 1000) / 1000,
		y: Math.round((new_cy - bounds.height / 2) * 1000) / 1000,
		width: bounds.width,
		height: bounds.height,
	};
}

/**
 * File > Place Embedded: the picture in the middle of the document, made smaller to fit (never larger)
 *
 * @param {number} width of the picture
 * @param {number} height
 * @param {number} doc_width
 * @param {number} doc_height
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function fit_placed(width, height, doc_width, doc_height) {
	const scale = Math.min(1, doc_width / width, doc_height / height);
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	return {
		x: Math.round((doc_width - w) / 2),
		y: Math.round((doc_height - h) / 2),
		width: w,
		height: h,
	};
}

/**
 * New contents of another size keep the scale of the layer and its center (Edit Contents, Replace Contents)
 *
 * @param {{x: number, y: number, width: number, height: number}} layer
 * @param {number} old_width size of the old contents
 * @param {number} old_height
 * @param {number} new_width size of the new contents
 * @param {number} new_height
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function scale_replaced(layer, old_width, old_height, new_width, new_height) {
	const scale_x = old_width > 0 ? layer.width / old_width : 1;
	const scale_y = old_height > 0 ? layer.height / old_height : 1;
	const width = Math.max(1, Math.round(new_width * scale_x));
	const height = Math.max(1, Math.round(new_height * scale_y));
	return {
		x: Math.round(layer.x + layer.width / 2 - width / 2),
		y: Math.round(layer.y + layer.height / 2 - height / 2),
		width,
		height,
	};
}

/**
 * @param {string} name layer name
 * @returns {string} a file name for Export Contents
 */
export function contents_file_name(name) {
	const printable = Array.from(String(name || '')).filter((char) => char.charCodeAt(0) >= 32).join('');
	const clean = printable.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 100);
	return `${clean || 'smart-object'}.json`;
}
