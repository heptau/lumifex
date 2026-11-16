/**
 * Tools that work only with pixels of an image layer. On other (vector) layers - text, shapes, brush strokes -
 * they would only show an error, so the toolbar disables them.
 */
export const RASTER_TOOLS = [
	'lasso', 'quick_select', 'magic_wand', 'quick_mask',
	'clone', 'pattern_stamp', 'color_replace', 'heal', 'patch', 'history_brush', 'red_eye', 'background_eraser', 'liquify',
	'erase', 'magic_erase', 'fill',
	'blur', 'sharpen', 'smudge', 'dodge_burn', 'sponge', 'bulge_pinch',
];

//with the option "Sample all layers" these read the visible picture, so they work on any layer
export const SAMPLE_ALL_TOOLS = ['magic_wand', 'quick_select'];

/**
 * @param {string} tool_name
 * @param {Object|undefined} attributes the options of the tool (config.TOOLS[].attributes)
 * @returns {boolean} the tool reads the visible picture of all layers instead of the active layer
 */
function samples_all(tool_name, attributes) {
	if (!attributes || SAMPLE_ALL_TOOLS.includes(tool_name) == false) {
		return false;
	}
	const option = attributes.sample_all;
	return Boolean(option !== null && typeof option === 'object' ? option.value : option);
}

//these refuse also an image that is still a vector (opened SVG) until it is converted to raster
export const STRICT_RASTER_TOOLS = ['erase', 'magic_erase', 'fill'];

/**
 * @param {string} tool_name
 * @param {{type: string|null, is_vector: boolean}|null} layer active layer
 * @param {Object} [attributes] the options of the tool
 * @returns {boolean} the tool can not be used on the layer
 */
export function is_tool_disabled(tool_name, layer, attributes) {
	if (!layer || RASTER_TOOLS.includes(tool_name) == false || samples_all(tool_name, attributes)) {
		return false;
	}
	//the empty first layer has no type yet and every tool can start on it
	if (layer.type != null && layer.type != 'image') {
		return true;
	}
	return STRICT_RASTER_TOOLS.includes(tool_name) && layer.is_vector === true;
}

/**
 * @param {{type: string|null, is_vector: boolean}|null} layer
 * @returns {boolean} the layer is drawn from vector data (text, shapes, strokes, opened SVG), not from pixels
 */
export function is_vector_layer(layer) {
	if (!layer || layer.type == null) {
		return false;
	}
	return layer.type != 'image' || layer.is_vector === true;
}

/**
 * The empty first layer has no type and no pixels, and the tools that work on pixels refuse it. So when one of them is
 * chosen, the layer is made a transparent picture first.
 *
 * @param {string} tool_name
 * @param {{type: string|null, is_vector?: boolean}|null} layer active layer
 * @param {Object} [attributes] the options of the tool
 * @returns {boolean}
 */
export function needs_raster_layer(tool_name, layer, attributes) {
	return Boolean(layer) && layer.type == null && RASTER_TOOLS.includes(tool_name)
		&& samples_all(tool_name, attributes) == false;
}
