import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../src/shared/svg-sanitize';

describe('sanitizeSvg', () => {
    it('should keep safe SVG content unchanged', () => {
        const safe = '<path d="M2 2h12v12H2z" fill="currentColor"/><circle cx="8" cy="8" r="4"/>';
        const result = sanitizeSvg(safe);
        expect(result).toContain('<path');
        expect(result).toContain('<circle');
    });

    it('should return empty string for empty input', () => {
        expect(sanitizeSvg('')).toBe('');
    });

    it('should remove <script> elements', () => {
        const result = sanitizeSvg('<script>alert(1)</script><path d="M0 0h8v8H0z"/>');
        expect(result).not.toContain('script');
        expect(result).toContain('<path');
    });

    it('should remove <foreignObject> elements', () => {
        const result = sanitizeSvg(
            '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject><rect width="8" height="8"/>',
        );
        expect(result.toLowerCase()).not.toContain('foreignobject');
        expect(result).toContain('<rect');
    });

    it('should remove on* event attributes (including SMIL onbegin)', () => {
        const result = sanitizeSvg(
            '<rect width="8" height="8" onload="alert(1)"/><animate onbegin="alert(2)" attributeName="x"/>',
        );
        expect(result).not.toContain('onload');
        expect(result).not.toContain('onbegin');
        expect(result).toContain('<rect');
    });

    it('should remove javascript: URLs in href/xlink:href', () => {
        const result = sanitizeSvg('<a href="javascript:alert(1)"><text>click</text></a>');
        expect(result.toLowerCase()).not.toContain('javascript:');
        // 元素保留，仅移除危险属性
        expect(result).toContain('<a');
    });

    it('should remove javascript: URLs with obfuscated whitespace', () => {
        const result = sanitizeSvg('<a href="java\tscript:alert(1)"><text>click</text></a>');
        expect(result.toLowerCase()).not.toContain('java\tscript:');
        expect(result).not.toMatch(/href\s*=/i);
    });

    it('should keep safe href values', () => {
        const result = sanitizeSvg('<a href="https://example.com"><text>link</text></a>');
        expect(result).toContain('https://example.com');
    });

    it('should tolerate malformed SVG without throwing (HTML parser is lenient)', () => {
        // HTML 解析器容错：畸形输入不再静默清空，保证消毒不成为图标消失的根因
        expect(() => sanitizeSvg('<path d="M0 0')).not.toThrow();
        expect(typeof sanitizeSvg('<path d="M0 0')).toBe('string');
    });

    it('should tolerate unescaped ampersands (matching innerHTML semantics)', () => {
        // registerIcon 收到的是 JS 字符串，未转义 & 很常见；XML 模式会解析失败静默清空
        const result = sanitizeSvg('<path data-x="a&b"/><style>/* a & b */</style>');
        expect(result).toContain('<path');
        expect(result).toContain('<style');
    });

    it('should keep <style> but remove iframe/object/embed elements', () => {
        // iconfont sprite 内嵌 <style> 是常见写法，不再拦截
        const result = sanitizeSvg(
            '<style>.x{}</style><iframe src="x"></iframe><object data="x"></object><embed src="x"/><path d="M0 0h8v8H0z"/>',
        );
        expect(result).toContain('<style');
        expect(result).not.toContain('<iframe');
        expect(result).not.toContain('<object');
        expect(result).not.toContain('<embed');
        expect(result).toContain('<path');
    });

    it('should remove SMIL elements that write on* attributes at runtime', () => {
        // <set attributeName="onload"> 可在运行时写入事件属性，绕过静态 on* 检查
        const result = sanitizeSvg('<set attributeName="onload" to="alert(1)"/><rect width="8" height="8"/>');
        expect(result.toLowerCase()).not.toContain('<set');
        expect(result).toContain('<rect');
    });

    it('should remove SMIL elements that write dangerous URLs at runtime', () => {
        // <animate attributeName="href" values="javascript:..."> 同理
        const result = sanitizeSvg(
            '<animate attributeName="href" values="javascript:alert(1)"/><rect width="8" height="8"/>',
        );
        expect(result.toLowerCase()).not.toContain('<animate');
        expect(result).toContain('<rect');
    });

    it('should keep harmless SMIL animations', () => {
        const result = sanitizeSvg(
            '<animate attributeName="opacity" from="0" to="1" dur="1s"/><rect width="8" height="8"/>',
        );
        expect(result).toContain('<animate');
        expect(result).toContain('attributeName="opacity"');
    });

    it('should keep SMIL animations targeting URL attributes with harmless values', () => {
        // P3：命中 URL 属性但值无害（如锚点）的动画不应被一刀切删除
        const result = sanitizeSvg('<animate attributeName="href" to="#anchor"/><rect width="8" height="8"/>');
        expect(result).toContain('<animate');
        expect(result).toContain('#anchor');
    });

    it('should remove data:text/html URLs but keep data:image/', () => {
        // 注意：XML 属性值不允许裸 '<'，此处用 base64 形态的 data:text/html
        const result = sanitizeSvg(
            '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="><text>x</text></a><image href="data:image/png;base64,AAAA"/>',
        );
        expect(result.toLowerCase()).not.toContain('data:text/html');
        expect(result).toContain('data:image/png');
    });

    it('should cache results for identical input (idempotent)', () => {
        const svg = '<path d="M0 0h8v8H0z" onload="alert(1)"/>';
        const first = sanitizeSvg(svg);
        const second = sanitizeSvg(svg);
        expect(first).toBe(second);
        expect(first).not.toContain('onload');
    });

    it('should evict oldest entries when cache exceeds limit', () => {
        // 覆盖 CACHE_LIMIT（500）淘汰分支：写入 501 条不同输入触发一次淘汰
        for (let i = 0; i < 501; i++) {
            sanitizeSvg(`<path d="M0 0h${i}v${i}H0z"/>`);
        }
        // 淘汰后旧条目重新计算，结果仍须正确
        expect(sanitizeSvg('<path d="M0 0h0v0H0z"/>')).toContain('<path');
        expect(sanitizeSvg('<script>alert(1)</script>')).not.toContain('script');
        expect(sanitizeSvg('<img src="x" onerror="alert(1)"/>')).not.toContain('<img');
    });
});

/**
 * mXSS 回归：消毒解析语境必须与注入语境（svg 的 foreign content）一致。
 * 曾因 text/html 回退路径用 <div> 包裹，<style> 在 HTML 语境是 RAWTEXT，
 * 内部标签逃过消毒，注入 foreign content 后被恢复执行。
 */
describe('sanitizeSvg mXSS regression', () => {
    /** 模拟 icon 组件的真实注入路径：svgEl.innerHTML = 消毒结果 */
    function injectInto(svgEl: SVGElement, content: string): void {
        svgEl.innerHTML = content;
    }

    it('should not execute onerror smuggled through <style> + fallback path', () => {
        // 末尾裸 & 强制 XML 解析失败走 text/html 回退
        const out = sanitizeSvg('<style><img src=x onerror=alert(1)></style>&');
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        injectInto(svgEl, out);
        expect(svgEl.querySelector('[onerror]')).toBeNull();
        expect(svgEl.querySelector('img')).toBeNull();
    });

    it('should not smuggle markup through <style> without fallback trigger', () => {
        const out = sanitizeSvg('<style><img src=x onerror=alert(1)></style><path d="M0 0h8v8H0z"/>');
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        injectInto(svgEl, out);
        expect(svgEl.querySelector('[onerror]')).toBeNull();
        expect(svgEl.querySelector('img')).toBeNull();
    });

    it('should still keep legitimate content through the fallback path', () => {
        // 回退路径不应把正常内容误杀
        const out = sanitizeSvg('<path data-x="a&b"/><style>/* a & b */ .x{fill:red}</style>');
        expect(out).toContain('data-x');
        expect(out).toContain('fill:red');
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        injectInto(svgEl, out);
        expect(svgEl.querySelector('path')).not.toBeNull();
        expect(svgEl.querySelector('style')).not.toBeNull();
    });

    /**
     * 同一「解析语境不一致」家族的其它变体。
     * 末尾裸 & 强制 XML 解析失败，确保覆盖 text/html 回退路径下的
     * 命名空间逃逸（MathML / HTML 专有元素）与协议实体混淆。
     */
    const MXSS_VARIANTS: Array<[string, string]> = [
        ['MathML <mtext> namespace escape', '<math><mtext><img src=x onerror=alert(1)></mtext></math>&'],
        ['<template> inert content', '<template><img src=x onerror=alert(1)></template>&'],
        ['<plaintext> document swallowing', '<plaintext><img src=x onerror=alert(1)>&'],
        ['entity-obfuscated javascript: URL', '<a href="jav&#x0A;ascript:alert(1)"><text>x</text></a>&'],
    ];

    for (const [label, payload] of MXSS_VARIANTS) {
        it(`should not smuggle executable payload via ${label}`, () => {
            const out = sanitizeSvg(payload);
            const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            injectInto(svgEl, out);

            // 注入后不得出现事件属性或可执行元素
            expect(svgEl.querySelector('[onerror]')).toBeNull();
            expect(svgEl.querySelector('img')).toBeNull();
            // 任何残留属性都不得携带可执行协议
            svgEl.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    const normalized = attr.value.toLowerCase().replace(/[\s-]+/g, '');
                    expect(normalized).not.toContain('javascript:');
                    expect(normalized).not.toContain('vbscript:');
                });
            });
        });
    }

    // 同一组载荷改为 XML 合法形态（引号属性、去掉末尾 &）走 XML 严格路径：
    // MathML text integration point（mtext）内部按 HTML 规则解析，img 可借道
    // 存活（onerror 虽被属性规则剥掉，img 元素会残留），需元素级封锁。
    // 注意：src=x 这类无引号属性在 XML 下直接解析失败，会误走回退路径，
    // 从而测不到 XML 路径的真实行为。
    const XML_PATH_VARIANTS: Array<[string, string]> = [
        ['MathML <mtext> namespace escape', '<math><mtext><img src="x" onerror="alert(1)"/></mtext></math>'],
        ['<template> inert content', '<template><img src="x" onerror="alert(1)"/></template>'],
        // <img> 必须自闭合、<plaintext> 必须有闭合标签，否则 XML 解析失败会退回回退路径
        ['<plaintext> document swallowing', '<plaintext><img src="x" onerror="alert(1)"/></plaintext>'],
        ['entity-obfuscated javascript: URL', '<a href="jav&#x0A;ascript:alert(1)"><text>x</text></a>'],
    ];

    for (const [label, payload] of XML_PATH_VARIANTS) {
        it(`should not smuggle executable payload via ${label} (XML path)`, () => {
            const out = sanitizeSvg(payload);
            const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            injectInto(svgEl, out);
            expect(svgEl.querySelector('[onerror]')).toBeNull();
            expect(svgEl.querySelector('img')).toBeNull();
            // 字符串级断言：不依赖注入解析器行为，直接锁定 img 元素级封锁
            expect(out.toLowerCase()).not.toContain('<img');
        });
    }
});

/**
 * 元素白名单：非 SVG 元素一律移除。
 * 黑名单模式需逐个追补 img / video / base / form……永远补不完；
 * 白名单从结构上一次性收口，XML 与回退两条路径同时生效。
 */
describe('sanitizeSvg element allowlist', () => {
    const REMOVED: Array<[string, string, string]> = [
        ['<script>', '<script>alert(1)</script>', 'script'],
        [
            '<foreignObject>',
            '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject>',
            'foreignobject',
        ],
        ['<iframe>', '<iframe src="x"/>', 'iframe'],
        ['<object>', '<object data="x"/>', 'object'],
        ['<embed>', '<embed src="x"/>', 'embed'],
        ['<link>', '<link rel="stylesheet" href="x"/>', 'link'],
        ['<meta>', '<meta http-equiv="refresh" content="0;url=x"/>', 'meta'],
        ['<img>', '<img src="x" onerror="alert(1)"/>', 'img'],
        ['<video>', '<video src="x" onerror="alert(1)"/>', 'video'],
        ['<audio>', '<audio src="x"/>', 'audio'],
        ['<base>', '<base href="javascript:alert(1)"/>', 'base'],
        ['<form>/<button>', '<form action="javascript:alert(1)"><button>x</button></form>', 'form'],
        ['<input>', '<input type="image" src="x" formaction="javascript:alert(1)"/>', 'input'],
        ['<math>/<mtext>', '<math><mtext><img src="x" onerror="alert(1)"/></mtext></math>', 'math'],
        ['<template>', '<template><img src="x" onerror="alert(1)"/></template>', 'template'],
        ['<plaintext>', '<plaintext>x</plaintext>', 'plaintext'],
    ];

    for (const [label, payload, forbidden] of REMOVED) {
        it(`should remove ${label} while keeping sibling SVG content`, () => {
            const out = sanitizeSvg(`${payload}<path d="M0 0h8v8H0z"/>`).toLowerCase();
            expect(out, `未移除 <${forbidden}>`).not.toContain(`<${forbidden}`);
            expect(out).toContain('<path');
        });
    }

    it('should remove illegal elements nested inside allowed containers', () => {
        const out = sanitizeSvg('<g><video src="x"/><rect width="8" height="8"/></g>').toLowerCase();
        expect(out).not.toContain('<video');
        expect(out).toContain('<rect');
    });

    it('should keep the full legitimate SVG element set', () => {
        const svg = [
            '<defs>',
            '<linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>',
            '<radialGradient id="rg"><stop offset="1"/></radialGradient>',
            '<clipPath id="c"><rect width="8" height="8"/></clipPath>',
            '<mask id="m"><circle cx="4" cy="4" r="4"/></mask>',
            '<pattern id="p"><path d="M0 0h2v2H0z"/></pattern>',
            '<marker id="mk"><path d="M0 0l2 2"/></marker>',
            '<filter id="f"><feGaussianBlur stdDeviation="1"/><feMerge><feMergeNode/></feMerge></filter>',
            '<symbol id="s"><ellipse cx="4" cy="4" rx="2" ry="3"/></symbol>',
            '</defs>',
            '<use href="#s"/>',
            '<image href="data:image/png;base64,AAAA"/>',
            '<text x="0" y="8"><tspan>hi</tspan><textPath href="#tp">p</textPath></text>',
            '<g><polygon points="0,0 8,0 4,8"/><polyline points="0,0 8,8"/><line x1="0" y1="0" x2="8" y2="8"/></g>',
            '<style>.a{fill:red}</style>',
            '<a href="#s"><rect width="1" height="1"/></a>',
            '<path d="M0 0h8v8H0z"/>',
        ].join('');
        const out = sanitizeSvg(svg).toLowerCase();

        for (const tag of [
            'defs',
            'lineargradient',
            'radialgradient',
            'stop',
            'clippath',
            'mask',
            'pattern',
            'marker',
            'filter',
            'fegaussianblur',
            'femerge',
            'femergenode',
            'symbol',
            'ellipse',
            'use',
            'image',
            'text',
            'tspan',
            'textpath',
            'polygon',
            'polyline',
            'line',
            'style',
            'a',
            'path',
        ]) {
            expect(out, `缺少 <${tag}>`).toContain(`<${tag}`);
        }
    });
});
