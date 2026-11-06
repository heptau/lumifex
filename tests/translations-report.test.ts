const { compare } = require('../scripts/translations-report.js');

describe('translations report', () => {
	const reference = { 'Open': 'Otevřít', 'Save': 'Uložit', 'Close': 'Zavřít', 'Undo': 'Zpět' };

	it('counts a key as translated only with a real translation', () => {
		const result = compare(reference, { 'Open': 'Öffnen', 'Save': '', 'Close': 'Close' });
		expect(result.total).toBe(4);
		expect(result.translated).toBe(1);
		expect(result.missing).toEqual(['Save', 'Close', 'Undo']);
	});

	it('ignores keys that the reference does not have', () => {
		const result = compare(reference, { 'Open': 'a', 'Save': 'b', 'Close': 'c', 'Undo': 'd', 'Other': 'e' });
		expect(result.translated).toBe(4);
		expect(result.missing).toEqual([]);
	});

	it('a non-string value is missing', () => {
		expect(compare(reference, { 'Open': 5, 'Save': null }).translated).toBe(0);
	});
});
