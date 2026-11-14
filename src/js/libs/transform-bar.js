/**
 * The numeric transform bar (Photoshop's options bar of Free Transform): X, Y, W, H and the angle of the active layer.
 * X and Y are the center of the layer (the default reference point in Photoshop), a size change keeps the center.
 * Pure functions, no DOM.
 *
 * @typedef {'x'|'y'|'width'|'height'|'rotate'} Field
 * @typedef {{x: number, y: number, width: number, height: number, rotate?: number|null}} Box
 */

/** Largest value of a size or a position, so a typo does not make an unusable layer */
export const MAX_VALUE = 100000;

/** @type {Field[]} */
export const FIELDS = ['x', 'y', 'width', 'height', 'rotate'];

/**
 * @param {Box|null|undefined} layer
 * @returns {boolean} the layer has a rectangle that can be edited with numbers
 */
export function has_box(layer) {
	return !!layer && [layer.x, layer.y, layer.width, layer.height].every((value) => typeof value == 'number' && isFinite(value));
}

/**
 * The values shown in the bar
 *
 * @param {Box|null|undefined} layer
 * @returns {Record<Field, number>|null} null when the layer has no rectangle
 */
export function fields_from_layer(layer) {
	if (!has_box(layer)) {
		return null;
	}
	const box = /** @type {Box} */ (layer);
	return {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2,
		width: box.width,
		height: box.height,
		rotate: Number(box.rotate) || 0,
	};
}

/**
 * Brings the angle to -180..180
 *
 * @param {number} angle degrees
 * @returns {number}
 */
export function normalize_angle(angle) {
	const turned = ((angle % 360) + 360) % 360;
	return turned > 180 ? turned - 360 : turned;
}

/**
 * What to change on the layer when one field of the bar is edited.
 *
 * @param {Box} layer
 * @param {Field} field
 * @param {number|string} value the new value of the field (pixels, degrees)
 * @param {boolean} [keep_ratio] a change of the width changes the height too (and the other way round)
 * @returns {Partial<Box>|null} settings for Update_layer_action, null when nothing changes or the value is not valid
 */
export function update_from_field(layer, field, value, keep_ratio = false) {
	const number = typeof value == 'number' ? value : parseFloat(value);
	const current = fields_from_layer(layer);
	if (!current || !FIELDS.includes(field) || !isFinite(number)) {
		return null;
	}
	/** @type {Partial<Box>} */
	let settings;
	if (field == 'x' || field == 'y') {
		const center = Math.max(-MAX_VALUE, Math.min(MAX_VALUE, number));
		settings = field == 'x' ? {x: center - layer.width / 2} : {y: center - layer.height / 2};
	}
	else if (field == 'rotate') {
		settings = {rotate: normalize_angle(number)};
	}
	else {
		let width;
		let height;
		const wanted = Math.max(1, Math.min(MAX_VALUE, number));
		const ratio = layer.width / layer.height;
		if (field == 'width') {
			width = wanted;
			height = keep_ratio && ratio > 0 && isFinite(ratio) ? Math.max(1, Math.min(MAX_VALUE, wanted / ratio)) : layer.height;
		}
		else {
			height = wanted;
			width = keep_ratio && ratio > 0 && isFinite(ratio) ? Math.max(1, Math.min(MAX_VALUE, wanted * ratio)) : layer.width;
		}
		if (keep_ratio && Number.isInteger(layer.width) && Number.isInteger(layer.height)) {
			width = Math.round(width);
			height = Math.round(height);
		}
		settings = {width, height, x: current.x - width / 2, y: current.y - height / 2};
	}
	const changed = Object.keys(settings).some((key) => {
		const k = /** @type {keyof Box} */ (key);
		return Math.abs(Number(settings[k]) - Number(k == 'rotate' ? current.rotate : layer[k])) > 1e-9;
	});
	return changed ? settings : null;
}
