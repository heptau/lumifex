/**
 * The unified Shape tool (Photoshop): one button in the toolbar, the concrete shape (rectangle, ellipse, star...)
 * is chosen in the options bar and remembered. Pure functions, no DOM.
 */

/** The shape used when nothing valid is remembered */
export const DEFAULT_SHAPE = 'rectangle';

/** localStorage key of the last used shape */
export const LAST_SHAPE_KEY = 'lumifex_last_shape';

/**
 * @param {any} stored the remembered value (it can be anything: the storage is not trusted)
 * @param {string[]} available keys of the shape tools that exist
 * @returns {string} the remembered shape when it exists, else the rectangle (or the first shape)
 */
export function pick_shape(stored, available) {
	if (typeof stored == 'string' && available.includes(stored)) {
		return stored;
	}
	return available.includes(DEFAULT_SHAPE) ? DEFAULT_SHAPE : (available[0] || DEFAULT_SHAPE);
}

/**
 * @param {string} full_key the module key of a tool, "shapes/star" for the shapes
 * @returns {boolean}
 */
export function is_shape_module(full_key) {
	return typeof full_key == 'string' && full_key.startsWith('shapes/');
}

/**
 * Shapes for the picker, sorted by title
 *
 * @param {{key: string, title: string}[]} shapes
 * @returns {{key: string, title: string}[]}
 */
export function sort_shapes(shapes) {
	return shapes.slice().sort((a, b) => a.title.localeCompare(b.title));
}
