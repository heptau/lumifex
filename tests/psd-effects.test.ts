import { read_effects_descriptor, effects_to_filters, shadow_offset, psd_color } from '../src/js/libs/psd-effects.js';
import { read_global_angle } from '../src/js/libs/psd.js';

//a tiny writer of Photoshop action descriptors (big-endian)
class Writer {
	bytes: number[] = [];
	u32(v: number) {
		this.bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
	}
	f64(v: number) {
		const view = new DataView(new ArrayBuffer(8));
		view.setFloat64(0, v);
		for (let i = 0; i < 8; i++) {
			this.bytes.push(view.getUint8(i));
		}
	}
	text(s: string) {
		for (const c of s) {
			this.bytes.push(c.charCodeAt(0));
		}
	}
	unicode(s: string) {
		this.u32(s.length + 1);
		for (const c of s) {
			this.bytes.push(0, c.charCodeAt(0));
		}
		this.bytes.push(0, 0);
	}
	id(s: string) {
		if (s.length == 4) {
			this.u32(0);
		}
		else {
			this.u32(s.length);
		}
		this.text(s);
	}
}

type Item = [string, string, unknown];

function descriptor(w: Writer, cls: string, items: Item[]) {
	w.unicode('');
	w.id(cls);
	w.u32(items.length);
	for (const [key, type, value] of items) {
		w.id(key);
		w.text(type);
		write_value(w, type, value);
	}
}

function write_value(w: Writer, type: string, value: any) {
	if (type == 'Objc') {
		descriptor(w, value.cls, value.items);
	}
	else if (type == 'UntF') {
		w.text(value.unit);
		w.f64(value.value);
	}
	else if (type == 'doub') {
		w.f64(value);
	}
	else if (type == 'bool') {
		w.bytes.push(value ? 1 : 0);
	}
	else if (type == 'enum') {
		w.id(value.type);
		w.id(value.value);
	}
	else if (type == 'long') {
		w.u32(value);
	}
	else if (type == 'VlLs') {
		w.u32(value.length);
		for (const item of value) {
			w.text(item.type);
			write_value(w, item.type, item.value);
		}
	}
}

const rgb = (r: number, g: number, b: number) => ({cls: 'RGBC', items: [['Rd  ', 'doub', r], ['Grn ', 'doub', g], ['Bl  ', 'doub', b]] as Item[]});
const px = (v: number) => ({unit: '#Pxl', value: v});
const pct = (v: number) => ({unit: '#Prc', value: v});
const ang = (v: number) => ({unit: '#Ang', value: v});

function effects_block(items: Item[]) {
	const w = new Writer();
	w.u32(0); //object effects version
	w.u32(16); //descriptor version
	descriptor(w, 'null', items);
	return Uint8Array.from(w.bytes);
}

describe('shadow_offset / psd_color', () => {
	it('turns the angle of the light into the offset of the shadow', () => {
		expect(shadow_offset(90, 10)).toEqual({x: -0, y: 10});
		expect(shadow_offset(180, 4)).toEqual({x: 4, y: 0});
		const offset = shadow_offset(120, 10);
		expect(offset).toEqual({x: 5, y: 9});
	});

	it('writes colors with the opacity as alpha', () => {
		expect(psd_color({'Rd  ': 255, 'Grn ': 0, 'Bl  ': 128})).toBe('#ff0080');
		expect(psd_color({'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0}, 50)).toBe('#00000080');
		expect(psd_color({redFloat: 1, greenFloat: 0.5, blueFloat: 0})).toBe('#ff8000');
		expect(psd_color(null)).toBe('#000000');
	});
});

describe('read_effects_descriptor + effects_to_filters', () => {
	it('reads the common effects', () => {
		const bytes = effects_block([
			['Scl ', 'UntF', pct(100)],
			['masterFXSwitch', 'bool', true],
			['DrSh', 'Objc', {cls: 'DrSh', items: [
				['enab', 'bool', true],
				['Md  ', 'enum', {type: 'BlnM', value: 'Mltp'}],
				['Clr ', 'Objc', rgb(0, 0, 0)],
				['Opct', 'UntF', pct(50)],
				['uglg', 'bool', false],
				['lagl', 'UntF', ang(90)],
				['Dstn', 'UntF', px(8)],
				['Ckmt', 'UntF', px(0)],
				['blur', 'UntF', px(6)],
			]}],
			['FrFX', 'Objc', {cls: 'FrFX', items: [
				['enab', 'bool', true],
				['Styl', 'enum', {type: 'FStl', value: 'InsF'}],
				['Sz  ', 'UntF', px(4)],
				['Clr ', 'Objc', rgb(255, 0, 0)],
				['Opct', 'UntF', pct(100)],
			]}],
			['SoFi', 'Objc', {cls: 'SoFi', items: [
				['enab', 'bool', true],
				['Md  ', 'enum', {type: 'BlnM', value: 'Scrn'}],
				['Clr ', 'Objc', rgb(0, 255, 0)],
				['Opct', 'UntF', pct(40)],
			]}],
			['IrGl', 'Objc', {cls: 'IrGl', items: [
				['enab', 'bool', true],
				['glwS', 'enum', {type: 'IGSr', value: 'SrcC'}],
				['blur', 'UntF', px(12)],
				['Clr ', 'Objc', rgb(255, 255, 190)],
				['Opct', 'UntF', pct(60)],
			]}],
			['OrGl', 'Objc', {cls: 'OrGl', items: [['enab', 'bool', false]]}],
		]);
		const descriptor = read_effects_descriptor(bytes, 0, bytes.length);
		expect(descriptor).not.toBeNull();
		const result = effects_to_filters(descriptor, 120);
		expect(result.hidden).toBe(false);
		expect(result.filters).toEqual([
			{name: 'shadow', params: {x: -0, y: 8, value: 6, color: '#00000080'}},
			{name: 'inner-glow', params: {blur: 12, choke: 0, source: 'Center', opacity: 60, color: '#ffffbe'}},
			{name: 'stroke', params: {size: 4, position: 'inside', color: '#ff0000'}},
			{name: 'color-overlay', params: {color: '#00ff00', opacity: 40, blend: 'screen'}},
		]);
	});

	it('uses the global angle and the lists of newer files', () => {
		const shadow = (distance: number) => ({type: 'Objc', value: {cls: 'DrSh', items: [
			['enab', 'bool', true], ['uglg', 'bool', true], ['Dstn', 'UntF', px(distance)], ['blur', 'UntF', px(2)],
		] as Item[]}});
		const bytes = effects_block([
			['masterFXSwitch', 'bool', false],
			['dropShadowMulti', 'VlLs', [shadow(10), shadow(20)]],
		]);
		const result = effects_to_filters(read_effects_descriptor(bytes, 0, bytes.length), 180);
		expect(result.hidden).toBe(true);
		expect(result.filters.map((f) => f.params.x)).toEqual([10, 20]);
	});

	it('gives null for broken data', () => {
		const bytes = effects_block([['DrSh', 'Objc', {cls: 'DrSh', items: [['blur', 'UntF', px(2)]]}]]);
		expect(read_effects_descriptor(bytes, 0, bytes.length - 3)).toBeNull();
		const wrong = bytes.slice();
		wrong[7] = 5; //descriptor version
		expect(read_effects_descriptor(wrong, 0, wrong.length)).toBeNull();
		const unknown = effects_block([['x', 'long', 1]]);
		unknown[unknown.length - 8] = 'Q'.charCodeAt(0); //type 'long' -> 'Qong'
		expect(read_effects_descriptor(unknown, 0, unknown.length)).toBeNull();
		expect(effects_to_filters(null)).toEqual({filters: [], hidden: false});
	});
});

describe('read_global_angle', () => {
	it('finds resource 1037 and falls back to 120', () => {
		const w = new Writer();
		//another resource with a name first
		w.text('8BIM');
		w.bytes.push(0x03, 0xED, 1, 65); //id 1005, name "A" (padded to even: 2 bytes)
		w.u32(3);
		w.bytes.push(1, 2, 3, 0); //data + pad
		w.text('8BIM');
		w.bytes.push(0x04, 0x0D, 0, 0); //id 1037, empty name
		w.u32(4);
		w.u32(30);
		const bytes = Uint8Array.from(w.bytes);
		expect(read_global_angle(bytes, 0, bytes.length)).toBe(30);
		expect(read_global_angle(bytes, 0, 10)).toBe(120);
		expect(read_global_angle(new Uint8Array(0), 0, 0)).toBe(120);
	});
});
