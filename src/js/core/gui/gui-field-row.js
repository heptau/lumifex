import { t } from './../../modules/tools/translate.js';

/**
 * One row of the Properties sections of the Layer details panel: a label and the input that fits the field
 * (a slider with a number field, a select, a color or a checkbox). Only builds the elements.
 *
 * @param {{name: string, title: string, kind: string, range?: number[], step?: number, values?: string[]}} field from libs/adjustment-fields.js
 * @returns {{row: HTMLElement, main: HTMLInputElement|HTMLSelectElement, number: HTMLInputElement|null}}
 */
export function create_field_row(field) {
	const row = document.createElement('div');
	row.className = 'row';
	const label = document.createElement('span');
	label.className = 'label';
	label.textContent = t(field.title);
	row.appendChild(label);

	let main;
	let number = null;
	if (field.kind == 'select') {
		main = document.createElement('select');
		(field.values || []).forEach((value) => {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = t(value);
			main.appendChild(option);
		});
	}
	else if (field.kind == 'color') {
		main = document.createElement('input');
		main.type = 'color';
		main.style.padding = '0px';
	}
	else if (field.kind == 'checkbox') {
		main = document.createElement('input');
		main.type = 'checkbox';
	}
	else {
		main = document.createElement('input');
		main.type = 'range';
		main.min = String(field.range[0]);
		main.max = String(field.range[1]);
		main.step = String(field.step || 1);
		number = document.createElement('input');
		number.type = 'number';
		number.min = main.min;
		number.max = main.max;
		number.step = main.step;
	}
	row.appendChild(main);
	if (number) {
		row.appendChild(number);
	}
	return {row, main, number};
}
