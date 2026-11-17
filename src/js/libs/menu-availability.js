/**
 * Menu items that work only with pixels of an image layer. On a text, shape, stroke or adjustment layer (and on the
 * empty first layer) they would only show "This layer must contain an image", so the menu disables them - the same
 * way the toolbar disables raster tools (see raster-tools.js). The keys are the `target` of the menu items.
 */

//whole modules: every method of them needs an image layer
const IMAGE_MODULES = [
	'image/adjustments', 'image/photo_effects', 'image/quick_edit', 'image/auto_adjust', 'image/color_corrections',
	'image/decrease_colors', 'image/palette', 'image/flip', 'image/content_aware_scale',
	'tools/color_zoom', 'tools/replace_color', 'tools/restore_alpha', 'tools/keypoints', 'tools/content_fill',
	'effects/browser', 'layer/smart_filter',
];

//single methods
const IMAGE_TARGETS = [
	'image/trim.trim_to_content', 'image/apply_image.apply',
	'edit/warp.warp', 'edit/puppet_warp.puppet_warp', 'edit/sky_replacement.replace', 'edit/transform.skew', 'edit/transform.perspective', 'edit/transform.distort',
	'layer/mask.remove_background', 'layer/mask.apply', 'layer/lock.toggle_alpha',
	'edit/selection.color_range', 'edit/selection.select_subject', 'edit/selection.select_sky',
	'edit/selection.select_edges', 'edit/selection.luminosity', 'edit/selection.channel', 'edit/selection.layer_transparency',
	'edit/selection.select_similar', 'edit/selection.grow_similar',
];

//these items of the modules above do not touch pixels (Fade works with the history, the LUT with the last adjustment)
const NOT_IMAGE_TARGETS = ['image/adjustments.fade', 'image/photo_effects.save_adjustment_lut'];

//the live filters that are drawn over any layer (CSS filter); the other effects change pixels
const ANY_LAYER_EFFECTS = [
	'effects/borders',
	'effects/common/blur', 'effects/common/brightness', 'effects/common/contrast', 'effects/common/grayscale',
	'effects/common/hue-rotate', 'effects/common/invert', 'effects/common/saturate', 'effects/common/sepia',
	'effects/common/shadow', 'effects/common/glow',
];

//fill works on an image and also on the empty first layer, which it turns into a picture
const IMAGE_OR_EMPTY_TARGETS = ['edit/fill.fill', 'edit/fill.fill_background', 'edit/fill.fill_pattern'];

//the commands of a smart object
const SMART_OBJECT_TARGETS = [
	'layer/smart_object.edit_contents', 'layer/smart_object.replace_contents', 'layer/smart_object.export_contents',
	'layer/smart_object.rasterize',
];

//items of the image modules and targets above that do not change the pixels of the layer, so they work also on a
//smart object (its pixels are refused until it is rasterized)
const SMART_OBJECT_ALLOWED = [
	'layer/smart_filter', 'edit/selection', 'layer/mask.remove_background', 'layer/lock.toggle_alpha',
];

/**
 * @param {string} target
 * @param {string} module_name
 * @returns {boolean} the item would change the pixels of a smart object
 */
function edits_smart_pixels(target, module_name) {
	if (NOT_IMAGE_TARGETS.includes(target) || SMART_OBJECT_ALLOWED.includes(module_name) || SMART_OBJECT_ALLOWED.includes(target)) {
		return false;
	}
	return IMAGE_MODULES.includes(module_name) || IMAGE_TARGETS.includes(target) || IMAGE_OR_EMPTY_TARGETS.includes(target)
		|| (module_name.startsWith('effects/') && ANY_LAYER_EFFECTS.includes(module_name) == false);
}

/**
 * @param {string|undefined} target menu item target, "<folder>/<file>.<method>"
 * @param {{type: string|null, smart_object?: object|null}|null} layer active layer
 * @returns {boolean} the menu item can not be used on the layer
 */
export function is_menu_item_disabled(target, layer) {
	if (!target || !layer) {
		return false;
	}
	const module_name = target.split('.')[0];
	const is_image = layer.type == 'image';
	const is_smart = is_image && layer.smart_object != null;
	if (SMART_OBJECT_TARGETS.includes(target)) {
		return !is_smart;
	}
	if (is_smart && edits_smart_pixels(target, module_name)) {
		return true;
	}
	if (IMAGE_OR_EMPTY_TARGETS.includes(target)) {
		return !is_image && layer.type != null;
	}
	if (is_image || NOT_IMAGE_TARGETS.includes(target)) {
		return false;
	}
	if (IMAGE_MODULES.includes(module_name) || IMAGE_TARGETS.includes(target)) {
		return true;
	}
	if (module_name.startsWith('effects/') && ANY_LAYER_EFFECTS.includes(module_name) == false) {
		return true;
	}
	return false;
}
