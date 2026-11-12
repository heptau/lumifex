import { parse_version_info, is_newer, is_check_due, AUTO_CHECK_INTERVAL } from '../src/js/libs/app-update.js';

describe('app update', () => {
	it('reads a valid version.json only', () => {
		expect(parse_version_info({ version: '26.2.0' })).toBe('26.2.0');
		expect(parse_version_info({ version: ' 1.0.10 ' })).toBe('1.0.10');
		for (const bad of [null, undefined, 5, 'x', {}, { version: 5 }, { version: '1.2' }, { version: '1.2.3-beta' }, { version: '<b>1.0.0' }, { version: '1.2.3.4' }]) {
			expect(parse_version_info(bad as any)).toBeNull();
		}
	});

	it('compares the numbers, not the text', () => {
		expect(is_newer('26.2.0', '26.1.2')).toBe(true);
		expect(is_newer('26.10.0', '26.9.0')).toBe(true);
		expect(is_newer('27.0.0', '26.99.99')).toBe(true);
		expect(is_newer('26.1.3', '26.1.2')).toBe(true);
	});

	it('the same, an older or an invalid version is not an update', () => {
		expect(is_newer('26.1.2', '26.1.2')).toBe(false);
		expect(is_newer('26.1.1', '26.1.2')).toBe(false);
		expect(is_newer('26.2.0', 'dev')).toBe(false);
		expect(is_newer('', '26.1.2')).toBe(false);
		expect(is_newer(undefined as any, '26.1.2')).toBe(false);
	});

	it('the automatic check waits for its interval', () => {
		expect(is_check_due(1000, null)).toBe(true);
		expect(is_check_due(1000, undefined as any)).toBe(true);
		expect(is_check_due(1000 + AUTO_CHECK_INTERVAL - 1, 1000)).toBe(false);
		expect(is_check_due(1000 + AUTO_CHECK_INTERVAL, 1000)).toBe(true);
		expect(is_check_due(500, 1000, 100)).toBe(true);
		expect(is_check_due(1050, 1000, 100)).toBe(false);
	});
});
