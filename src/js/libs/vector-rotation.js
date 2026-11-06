/**
 * Vector layers whose renderer does not rotate by itself: the generic code in `Base_layers` turns the context
 * around the center of the layer before calling the renderer. (Shapes, text and ellipses rotate in their own render.)
 */
export const GENERIC_ROTATION_TYPES = ['line', 'arrow', 'bezier_curve', 'brush', 'pencil', 'pen'];

/**
 * @param {{type: string|null, rotate: number|null}} layer
 * @returns {boolean} the context must be rotated before the layer is rendered
 */
export function needs_generic_rotation(layer) {
	return !!layer && GENERIC_ROTATION_TYPES.includes(layer.type) && (parseFloat(layer.rotate) || 0) !== 0;
}

/**
 * Older projects stored `rotate: null` (= rotation not supported) for these layers.
 *
 * @param {{type: string|null, rotate: number|null}} layer
 * @returns {number|null} the rotation of the layer, null only for types that really cannot rotate
 */
export function normalize_rotate(layer) {
	if (layer.rotate === null && GENERIC_ROTATION_TYPES.includes(layer.type)) {
		return 0;
	}
	return layer.rotate;
}

/**
 * @param {{x: number, y: number, width: number, height: number}} layer
 * @returns {{x: number, y: number}} the center of the layer (the pivot of the rotation)
 */
export function rotation_pivot(layer) {
	return {x: layer.x + (layer.width || 0) / 2, y: layer.y + (layer.height || 0) / 2};
}
