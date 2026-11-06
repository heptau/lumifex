/**
 * Lock Transparency: while a layer has `lock_alpha`, painting, filling, filters and adjustments change only the colors of
 * the pixels that are already there. The transparency of every pixel stays as it was: a fully transparent pixel stays
 * empty and the eraser does nothing. Pure functions over ImageData-like data, no DOM.
 */

/**
 * Takes the colors from `next` and the alpha channel from `old`; `next` is changed in place.
 * Where the new pixel is fully transparent (erased) the old color stays.
 *
 * @param {Uint8ClampedArray|number[]} old RGBA of the layer before the change
 * @param {Uint8ClampedArray|number[]} next RGBA of the layer after the change (the same size)
 * @returns {boolean} false when the sizes differ and nothing was done
 */
export function keep_alpha(old, next) {
	if (!old || !next || old.length !== next.length || next.length % 4 !== 0) {
		return false;
	}
	for (let i = 0; i < next.length; i += 4) {
		const alpha = old[i + 3];
		if (alpha === 0) {
			next[i] = next[i + 1] = next[i + 2] = next[i + 3] = 0;
			continue;
		}
		if (next[i + 3] === 0) {
			next[i] = old[i];
			next[i + 1] = old[i + 1];
			next[i + 2] = old[i + 2];
		}
		next[i + 3] = alpha;
	}
	return true;
}
