import { describe, it, expect, beforeEach } from 'vitest';
import { parseHashUrl } from '../src/shared/url';

describe('utils/url.parseHashUrl', () => {
    beforeEach(() => {
        // reset location
        window.location.href = 'http://localhost/#/home';
    });

    it('parses hash path and query from string URL', () => {
        const res = parseHashUrl('http://example.com/#/user/profile?foo=1&bar=a%20b');
        expect(res.path).toEqual(['user', 'profile']);
        expect(res.query).toEqual({ foo: '1', bar: 'a b' });
    });

    it('parses from window.location when no arg is passed', () => {
        window.location.hash = '#/abc/def?x=10&y=2';
        const res = parseHashUrl();
        expect(res.path).toEqual(['abc', 'def']);
        expect(res.query).toEqual({ x: '10', y: '2' });
    });

    it('handles empty query correctly', () => {
        const res = parseHashUrl('http://example.com/#/only/path');
        expect(res.path).toEqual(['only', 'path']);
        expect(res.query).toEqual({});
    });

    it('preserves empty values and values containing an equals sign', () => {
        const res = parseHashUrl('http://example.com/#/search?flag&token=a=b=c');
        expect(res.query).toEqual({ flag: '', token: 'a=b=c' });
    });

    it('supports relative URLs and malformed escapes', () => {
        const res = parseHashUrl('#/search?q=%E0%A4%A');
        expect(res.path).toEqual(['search']);
        expect(res.query.q).toBeDefined();
    });
});
