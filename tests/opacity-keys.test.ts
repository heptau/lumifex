import { digit_from_event, next_opacity, DIGIT_WINDOW } from '../src/js/libs/opacity-keys.js';

describe('opacity keys', () => {
	it('reads digits from the physical key, also on the numpad', () => {
		expect(digit_from_event({ code: 'Digit5' })).toBe(5);
		expect(digit_from_event({ code: 'Numpad0' })).toBe(0);
		expect(digit_from_event({ code: 'KeyA' })).toBeNull();
		expect(digit_from_event(null as any)).toBeNull();
	});

	it('ignores modifiers and repeated keys', () => {
		for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat']) {
			expect(digit_from_event({ code: 'Digit5', [mod]: true })).toBeNull();
		}
	});

	it('a single digit sets the tens, 0 sets 100 %', () => {
		expect(next_opacity(null, 1, 0).opacity).toBe(10);
		expect(next_opacity(null, 5, 0).opacity).toBe(50);
		expect(next_opacity(null, 9, 0).opacity).toBe(90);
		expect(next_opacity(null, 0, 0).opacity).toBe(100);
	});

	it('two digits in quick succession make an exact value', () => {
		const first = next_opacity(null, 3, 1000);
		expect(next_opacity(first.state, 5, 1000 + DIGIT_WINDOW).opacity).toBe(35);
		expect(next_opacity(next_opacity(null, 0, 0).state, 0, 100).opacity).toBe(0);
		expect(next_opacity(next_opacity(null, 5, 0).state, 0, 100).opacity).toBe(50);
	});

	it('a slow second digit starts again; a third digit starts again too', () => {
		const first = next_opacity(null, 3, 1000);
		expect(next_opacity(first.state, 5, 1000 + DIGIT_WINDOW + 1).opacity).toBe(50);
		const second = next_opacity(first.state, 5, 1100);
		expect(next_opacity(second.state, 7, 1200).opacity).toBe(70);
	});

	it('sanitizes the digit', () => {
		expect(next_opacity(null, 99, 0).opacity).toBe(90);
		expect(next_opacity(null, NaN, 0).opacity).toBe(100);
	});
});
