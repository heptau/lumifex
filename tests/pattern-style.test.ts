import { safe_pattern_url, pattern_size, MAX_PATTERN_SIZE } from '../src/js/libs/layer-styles.js';

describe('pattern overlay helpers', () => {
	it('accepts only base64 PNG data URLs', () => {
		expect(safe_pattern_url('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
		expect(safe_pattern_url('data:image/svg+xml;base64,AAAA')).toBeNull();
		expect(safe_pattern_url('http://example.com/a.png')).toBeNull();
		expect(safe_pattern_url('data:image/png;base64,AA" onload="x')).toBeNull();
		expect(safe_pattern_url(null)).toBeNull();
		expect(safe_pattern_url(`data:image/png;base64,${'A'.repeat(1600000)}`)).toBeNull();
	});

	it('scales big patterns down and keeps small ones', () => {
		expect(pattern_size(100, 50)).toEqual({ width: 100, height: 50 });
		expect(pattern_size(1024, 512)).toEqual({ width: MAX_PATTERN_SIZE, height: MAX_PATTERN_SIZE / 2 });
		expect(pattern_size(0, NaN)).toEqual({ width: 1, height: 1 });
	});
});
