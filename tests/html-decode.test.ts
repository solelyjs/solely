import { describe, it, expect } from 'vitest';
import htmlDecode from '../src/runtime/renderer/html-decode';

describe('html-decode', () => {
    it('should decode named entities', () => {
        expect(htmlDecode('&amp;')).toBe('&');
        expect(htmlDecode('&lt;')).toBe('<');
        expect(htmlDecode('&gt;')).toBe('>');
        expect(htmlDecode('&quot;')).toBe('"');
        expect(htmlDecode('&apos;')).toBe("'");
        expect(htmlDecode('&nbsp;')).toBe(' ');
        expect(htmlDecode('&copy;')).toBe('©');
        expect(htmlDecode('&reg;')).toBe('®');
        expect(htmlDecode('&euro;')).toBe('€');
    });

    it('should decode decimal numeric entities', () => {
        expect(htmlDecode('&#60;')).toBe('<');
        expect(htmlDecode('&#62;')).toBe('>');
        expect(htmlDecode('&#38;')).toBe('&');
        expect(htmlDecode('&#34;')).toBe('"');
    });

    it('should decode hexadecimal numeric entities', () => {
        expect(htmlDecode('&#x3C;')).toBe('<');
        expect(htmlDecode('&#x3E;')).toBe('>');
        expect(htmlDecode('&#x26;')).toBe('&');
        expect(htmlDecode('&#x22;')).toBe('"');
    });

    it('should handle mixed text with entities', () => {
        expect(htmlDecode('Hello &amp; Welcome')).toBe('Hello & Welcome');
        expect(htmlDecode('&lt;div&gt;content&lt;/div&gt;')).toBe('<div>content</div>');
        expect(htmlDecode('Price: &euro;10')).toBe('Price: €10');
    });

    it('should return plain text unchanged', () => {
        expect(htmlDecode('Hello World')).toBe('Hello World');
        expect(htmlDecode('')).toBe('');
        expect(htmlDecode('no entities here')).toBe('no entities here');
    });

    it('should handle unknown entities by returning them as-is', () => {
        expect(htmlDecode('&unknown;')).toBe('&unknown;');
        expect(htmlDecode('&notarealentity;')).toBe('&notarealentity;');
    });

    it('should handle null/undefined gracefully', () => {
        expect(htmlDecode(null as unknown as string)).toBe(null);
        expect(htmlDecode(undefined as unknown as string)).toBe(undefined);
    });

    it('should handle non-string input gracefully', () => {
        expect(htmlDecode(123 as unknown as string)).toBe(123);
    });

    it('should return replacement character for invalid code points', () => {
        expect(htmlDecode('&#x00;')).toBe('\uFFFD');
        expect(htmlDecode('&#xD800;')).toBe('\uFFFD');
        expect(htmlDecode('&#xDFFF;')).toBe('\uFFFD');
        expect(htmlDecode('&#x110000;')).toBe('\uFFFD');
    });

    it('should decode multiple entities in sequence', () => {
        expect(htmlDecode('&lt;&gt;&amp;&quot;')).toBe('<>&"');
    });

    it('should handle case-insensitive named entities', () => {
        expect(htmlDecode('&AMP;')).toBe('&');
        expect(htmlDecode('&LT;')).toBe('<');
        expect(htmlDecode('&GT;')).toBe('>');
    });

    it('should handle Windows-1252 mappings', () => {
        expect(htmlDecode('&#130;')).toBe('‚');
        expect(htmlDecode('&#132;')).toBe('„');
        expect(htmlDecode('&#133;')).toBe('…');
    });

    it('should return replacement for code points exceeding unicode max', () => {
        const result = htmlDecode('&#99999999999999999999;');
        expect(result).toBe('\uFFFD');
    });

    it('should handle Windows-1252 edge without specific mapping', () => {
        expect(htmlDecode('&#129;')).toBe('');
    });
});
