/**
 * Layer effects of Photoshop files (the tagged blocks lfx2 / lmfx: an "action descriptor") read into the layer styles
 * of the application: Drop Shadow -> shadow, Outer Glow -> glow, Inner Shadow -> inner-shadow, Inner Glow ->
 * inner-glow, Stroke -> stroke, Color Overlay -> color-overlay. Other effects (bevel, satin, gradient and pattern
 * overlays) are skipped. Pure functions, no DOM; every length is checked against the end of the block, a broken
 * descriptor gives null (the layer is then opened without effects, never fails).
 */

const MAX_DEPTH = 16;
const MAX_ITEMS = 10000;
const MAX_STRING = 10000;

/**
 * A bounded big-endian reader over a part of the file
 */
class Block_reader {
	/**
	 * @param {Uint8Array} bytes
	 * @param {number} start
	 * @param {number} end
	 */
	constructor(bytes, start, end) {
		this.bytes = bytes;
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.pos = start;
		this.end = Math.min(end, bytes.length);
	}

	need(count) {
		if (!(count >= 0) || this.pos + count > this.end) {
			throw new Error('descriptor ends too early');
		}
	}

	u8() {
		this.need(1);
		return this.bytes[this.pos++];
	}

	u32() {
		this.need(4);
		const value = this.view.getUint32(this.pos);
		this.pos += 4;
		return value;
	}

	i32() {
		this.need(4);
		const value = this.view.getInt32(this.pos);
		this.pos += 4;
		return value;
	}

	f64() {
		this.need(8);
		const value = this.view.getFloat64(this.pos);
		this.pos += 8;
		return value;
	}

	text(count) {
		this.need(count);
		let out = '';
		for (let i = 0; i < count; i++) {
			out += String.fromCharCode(this.bytes[this.pos + i]);
		}
		this.pos += count;
		return out;
	}

	skip(count) {
		this.need(count);
		this.pos += count;
	}

	unicode() {
		const length = this.u32();
		if (length > MAX_STRING) {
			throw new Error('string too long');
		}
		this.need(length * 2);
		let out = '';
		for (let i = 0; i < length; i++) {
			out += String.fromCharCode(this.view.getUint16(this.pos + i * 2));
		}
		this.pos += length * 2;
		//strings end with a zero character
		let length_used = out.length;
		while (length_used > 0 && out.charCodeAt(length_used - 1) == 0) {
			length_used--;
		}
		return out.slice(0, length_used);
	}

	//a class id or a key: a length and a text, or a zero length and four letters
	id() {
		const length = this.u32();
		if (length > MAX_STRING) {
			throw new Error('id too long');
		}
		return this.text(length == 0 ? 4 : length);
	}
}

/**
 * @param {Block_reader} reader
 * @param {number} depth
 * @returns {object} the items by key, with `_class`
 */
function read_descriptor(reader, depth) {
	if (depth > MAX_DEPTH) {
		throw new Error('descriptor too deep');
	}
	reader.unicode();
	const result = {_class: reader.id()};
	const count = reader.u32();
	if (count > MAX_ITEMS) {
		throw new Error('too many items');
	}
	for (let i = 0; i < count; i++) {
		const key = reader.id();
		const type = reader.text(4);
		result[key] = read_value(reader, type, depth);
	}
	return result;
}

/**
 * @param {Block_reader} reader
 * @param {string} type OSType of the value
 * @param {number} depth
 */
function read_value(reader, type, depth) {
	switch (type) {
		case 'Objc':
		case 'GlbO':
			return read_descriptor(reader, depth + 1);
		case 'VlLs': {
			const count = reader.u32();
			if (count > MAX_ITEMS) {
				throw new Error('list too long');
			}
			const list = [];
			for (let i = 0; i < count; i++) {
				list.push(read_value(reader, reader.text(4), depth + 1));
			}
			return list;
		}
		case 'doub':
			return reader.f64();
		case 'UntF':
			return {unit: reader.text(4), value: reader.f64()};
		case 'UnFl': {
			const unit = reader.text(4);
			const count = reader.u32();
			if (count > MAX_ITEMS) {
				throw new Error('list too long');
			}
			const values = [];
			for (let i = 0; i < count; i++) {
				values.push(reader.f64());
			}
			return {unit, values};
		}
		case 'TEXT':
			return reader.unicode();
		case 'enum':
			return {type: reader.id(), value: reader.id()};
		case 'long':
			return reader.i32();
		case 'comp':
			reader.skip(8);
			return null;
		case 'bool':
			return reader.u8() != 0;
		case 'type':
		case 'GlbC':
			reader.unicode();
			return {class: reader.id()};
		case 'alis':
		case 'tdta':
		case 'Pth ':
			reader.skip(reader.u32());
			return null;
		case 'obj ': {
			const count = reader.u32();
			if (count > MAX_ITEMS) {
				throw new Error('reference too long');
			}
			for (let i = 0; i < count; i++) {
				const form = reader.text(4);
				if (form == 'prop') {
					reader.unicode(); reader.id(); reader.id();
				}
				else if (form == 'Clss') {
					reader.unicode(); reader.id();
				}
				else if (form == 'Enmr') {
					reader.unicode(); reader.id(); reader.id(); reader.id();
				}
				else if (form == 'rele') {
					reader.unicode(); reader.id(); reader.skip(4);
				}
				else if (form == 'Idnt' || form == 'indx') {
					reader.skip(4);
				}
				else if (form == 'name') {
					reader.unicode(); reader.id(); reader.unicode();
				}
				else {
					throw new Error('unknown reference');
				}
			}
			return null;
		}
		default:
			throw new Error(`unknown type ${type}`);
	}
}

/**
 * Reads the descriptor of a lfx2 / lmfx block (4 bytes of the effects version, 4 bytes of the descriptor version)
 *
 * @param {Uint8Array} bytes the file
 * @param {number} start where the data of the block starts
 * @param {number} length
 * @returns {object|null}
 */
export function read_effects_descriptor(bytes, start, length) {
	try {
		const reader = new Block_reader(bytes, start, start + length);
		reader.skip(4);
		if (reader.u32() != 16) {
			return null;
		}
		return read_descriptor(reader, 0);
	}
	catch {
		return null;
	}
}

function number_of(value, fallback) {
	if (typeof value == 'number' && Number.isFinite(value)) {
		return value;
	}
	if (value && typeof value.value == 'number' && Number.isFinite(value.value)) {
		return value.value;
	}
	return fallback;
}

function enum_of(value) {
	return value && typeof value.value == 'string' ? value.value : null;
}

function hex2(value) {
	const n = Math.max(0, Math.min(255, Math.round(value)));
	return n.toString(16).padStart(2, '0');
}

/**
 * @param {object|null} color an RGBC descriptor (Rd / Grn / Bl 0-255, or redFloat... 0-1)
 * @param {number} [opacity] 0-100, written as the alpha of the color when below 100
 * @returns {string} #rrggbb or #rrggbbaa
 */
export function psd_color(color, opacity = 100) {
	let r = 0;
	let g = 0;
	let b = 0;
	if (color && typeof color == 'object') {
		if ('redFloat' in color) {
			r = number_of(color.redFloat, 0) * 255;
			g = number_of(color.greenFloat, 0) * 255;
			b = number_of(color.blueFloat, 0) * 255;
		}
		else {
			r = number_of(color['Rd  '], 0);
			g = number_of(color['Grn '], 0);
			b = number_of(color['Bl  '], 0);
		}
	}
	const alpha = Math.max(0, Math.min(100, opacity));
	return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha < 100 ? hex2(alpha / 100 * 255) : ''}`;
}

//blend modes of the descriptor -> the modes of Color Overlay
const OVERLAY_BLEND = {
	'Nrml': 'normal', 'Mltp': 'multiply', 'Scrn': 'screen', 'Ovrl': 'overlay', 'Drkn': 'darken', 'Lghn': 'lighten',
	'CDdg': 'color-dodge', 'CBrn': 'color-burn', 'HrdL': 'hard-light', 'SftL': 'soft-light', 'Dfrn': 'difference',
	'Xclu': 'exclusion', 'H   ': 'hue', 'Strt': 'saturation', 'Clr ': 'color', 'Lmns': 'luminosity',
};

/**
 * The offset of a shadow from the angle of the light and the distance (Photoshop: the light comes from the angle,
 * counterclockwise from the right, the shadow falls the other way)
 */
export function shadow_offset(angle, distance) {
	const radians = angle * Math.PI / 180;
	return {x: Math.round(-Math.cos(radians) * distance), y: Math.round(Math.sin(radians) * distance)};
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * The entries of one kind: the old key holds one effect, the "Multi" key of newer files a list
 */
function entries(descriptor, key, multi) {
	const list = [];
	if (Array.isArray(descriptor[multi])) {
		descriptor[multi].forEach((item) => {
			if (item && typeof item == 'object') {
				list.push(item);
			}
		});
	}
	else if (descriptor[key] && typeof descriptor[key] == 'object') {
		list.push(descriptor[key]);
	}
	//an effect that is switched off in Photoshop is left out (the styles here can not be switched off one by one)
	return list.filter((item) => item.enab !== false);
}

/**
 * The layer styles of the application made from the effects of a layer
 *
 * @param {object|null} descriptor from read_effects_descriptor
 * @param {number} [global_angle] the global light of the document (Photoshop default 120°)
 * @returns {{filters: {name: string, params: Object<string, any>}[], hidden: boolean}}
 */
export function effects_to_filters(descriptor, global_angle = 120) {
	const filters = [];
	if (!descriptor || typeof descriptor != 'object') {
		return {filters, hidden: false};
	}
	const angle_of = (effect) => (effect.uglg === true ? global_angle : number_of(effect.lagl, global_angle));

	entries(descriptor, 'DrSh', 'dropShadowMulti').forEach((effect) => {
		const offset = shadow_offset(angle_of(effect), number_of(effect.Dstn, 5));
		filters.push({name: 'shadow', params: {
			x: clamp(offset.x, -100, 100),
			y: clamp(offset.y, -100, 100),
			value: clamp(number_of(effect.blur, 5), 0, 100),
			color: psd_color(effect['Clr '], number_of(effect.Opct, 75)),
		}});
	});
	entries(descriptor, 'OrGl', 'outerGlowMulti').forEach((effect) => {
		filters.push({name: 'glow', params: {
			size: clamp(number_of(effect.blur, 10), 1, 100),
			strength: clamp(1 + number_of(effect.Ckmt, 0) / 25, 1, 5),
			color: psd_color(effect['Clr '], number_of(effect.Opct, 75)),
		}});
	});
	entries(descriptor, 'IrSh', 'innerShadowMulti').forEach((effect) => {
		const offset = shadow_offset(angle_of(effect), number_of(effect.Dstn, 5));
		filters.push({name: 'inner-shadow', params: {
			x: clamp(offset.x, -50, 50),
			y: clamp(offset.y, -50, 50),
			blur: clamp(number_of(effect.blur, 5), 0, 50),
			choke: clamp(number_of(effect.Ckmt, 0), 0, 100),
			opacity: clamp(number_of(effect.Opct, 75), 1, 100),
			color: psd_color(effect['Clr ']),
		}});
	});
	entries(descriptor, 'IrGl', 'innerGlowMulti').forEach((effect) => {
		filters.push({name: 'inner-glow', params: {
			blur: clamp(number_of(effect.blur, 5), 1, 50),
			choke: clamp(number_of(effect.Ckmt, 0), 0, 100),
			source: enum_of(effect.glwS) == 'SrcC' ? 'Center' : 'Edge',
			opacity: clamp(number_of(effect.Opct, 75), 1, 100),
			color: psd_color(effect['Clr ']),
		}});
	});
	entries(descriptor, 'FrFX', 'frameFXMulti').forEach((effect) => {
		const style = enum_of(effect.Styl);
		filters.push({name: 'stroke', params: {
			size: clamp(number_of(effect['Sz  '], 3), 1, 50),
			position: style == 'InsF' ? 'inside' : (style == 'CtrF' ? 'center' : 'outside'),
			color: psd_color(effect['Clr '], number_of(effect.Opct, 100)),
		}});
	});
	entries(descriptor, 'SoFi', 'solidFillMulti').forEach((effect) => {
		filters.push({name: 'color-overlay', params: {
			color: psd_color(effect['Clr ']),
			opacity: clamp(number_of(effect.Opct, 100), 1, 100),
			blend: OVERLAY_BLEND[enum_of(effect['Md  '])] || 'normal',
		}});
	});
	return {filters, hidden: descriptor.masterFXSwitch === false};
}
