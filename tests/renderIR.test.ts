import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRender } from '../src/runtime/renderer/renderIR';
import { buildIR, clearIRCache } from '../src/compiler/ir/buildIR';
import { parseHtml } from '../src/compiler/parser/parser';

describe('renderIR', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        clearIRCache();
    });

    afterEach(() => {
        container.remove();
        vi.restoreAllMocks();
    });

    function buildAndRender(html: string, scope: Record<string, unknown> = {}) {
        const ast = parseHtml(html);
        const ir = buildIR(ast, { filename: 'test.html', source: html });
        return createRender(ir, container, scope);
    }

    it('should render static element', () => {
        buildAndRender('<div class="container">hello</div>');

        expect(container.innerHTML).toContain('hello');
        const div = container.querySelector('div');
        expect(div).not.toBeNull();
        expect(div!.className).toBe('container');
    });

    it('should render dynamic text interpolation', () => {
        const scope = { $data: { name: 'World' } };
        buildAndRender('<div>{{ $data.name }}</div>', scope);

        expect(container.textContent).toBe('World');
    });

    it('should update dynamic text on re-render', () => {
        const scope = { $data: { name: 'World' } };
        const instance = buildAndRender('<div>{{ $data.name }}</div>', scope);

        expect(container.textContent).toBe('World');

        scope.$data.name = 'Solely';
        instance.update();

        expect(container.textContent).toBe('Solely');
    });

    it('should render dynamic attributes', () => {
        const scope = { $data: { url: 'http://example.com', name: 'Example' } };
        buildAndRender('<img :src="$data.url" :alt="$data.name">', scope);

        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img!.getAttribute('src')).toBe('http://example.com');
        expect(img!.getAttribute('alt')).toBe('Example');
    });

    it('should update dynamic attributes on re-render', () => {
        const scope = { $data: { url: 'http://example.com' } };
        const instance = buildAndRender('<img :src="$data.url">', scope);

        const img = container.querySelector('img');
        expect(img!.getAttribute('src')).toBe('http://example.com');

        scope.$data.url = 'http://new.com';
        instance.update();

        expect(img!.getAttribute('src')).toBe('http://new.com');
    });

    it('should render event handlers', () => {
        const scope = { $data: { count: 0 } };
        buildAndRender('<button @click="$data.count++">click</button>', scope);

        const button = container.querySelector('button');
        expect(button).not.toBeNull();
        button!.dispatchEvent(new MouseEvent('click'));
        expect(scope.$data.count).toBe(1);
    });

    it('should render For loop', () => {
        const scope = { $data: { items: ['a', 'b', 'c'] } };
        buildAndRender('<For each="$data.items" item="it"><span>{{ it }}</span></For>', scope);

        const spans = container.querySelectorAll('span');
        expect(spans.length).toBe(3);
        expect(spans[0].textContent).toBe('a');
        expect(spans[1].textContent).toBe('b');
        expect(spans[2].textContent).toBe('c');
    });

    it('should update For loop when data changes', () => {
        const scope = { $data: { items: ['a'] } };
        const instance = buildAndRender('<For each="$data.items" item="it"><span>{{ it }}</span></For>', scope);

        expect(container.querySelectorAll('span').length).toBe(1);

        scope.$data.items.push('b');
        instance.update();

        const spans = container.querySelectorAll('span');
        expect(spans.length).toBe(2);
        expect(spans[1].textContent).toBe('b');
    });

    it('should render If/ElseIf/Else conditional', () => {
        const scope = { $data: { a: 1 } };
        buildAndRender(
            '<If test="$data.a === 1"><span>a</span></If><ElseIf test="$data.a === 2"><span>b</span></ElseIf><Else><span>c</span></Else>',
            scope,
        );

        expect(container.textContent).toBe('a');
    });

    it('should update conditional when data changes', () => {
        const scope = { $data: { a: 1 } };
        const instance = buildAndRender(
            '<If test="$data.a === 1"><span>a</span></If><ElseIf test="$data.a === 2"><span>b</span></ElseIf><Else><span>c</span></Else>',
            scope,
        );

        expect(container.textContent).toBe('a');

        scope.$data.a = 2;
        instance.update();

        expect(container.textContent).toBe('b');

        scope.$data.a = 3;
        instance.update();

        expect(container.textContent).toBe('c');
    });

    it('should render nested elements', () => {
        buildAndRender('<div><span><b>bold</b></span></div>');

        const b = container.querySelector('b');
        expect(b).not.toBeNull();
        expect(b!.textContent).toBe('bold');
    });

    it('should render comments', () => {
        buildAndRender('<!-- comment --><div></div>');

        expect(container.innerHTML).toContain('comment');
    });

    it('should handle ref attribute', () => {
        const scope = { $data: {}, $refs: {} as Record<string, HTMLElement> };
        buildAndRender('<input ref="myInput">', scope);

        expect(scope.$refs.myInput).toBeDefined();
        expect(scope.$refs.myInput.tagName).toBe('INPUT');
    });

    it('should handle class binding with object', () => {
        const scope = { $data: { isActive: true, isLarge: false } };
        buildAndRender('<div :class="{ active: $data.isActive, large: $data.isLarge }"></div>', scope);

        const div = container.querySelector('div');
        expect(div!.classList.contains('active')).toBe(true);
        expect(div!.classList.contains('large')).toBe(false);
    });

    it('should update class binding', () => {
        const scope = { $data: { isActive: true } };
        const instance = buildAndRender('<div :class="{ active: $data.isActive }"></div>', scope);

        const div = container.querySelector('div');
        expect(div!.classList.contains('active')).toBe(true);

        scope.$data.isActive = false;
        instance.update();

        expect(div!.classList.contains('active')).toBe(false);
    });

    it('should handle style binding with object', () => {
        const scope = { $data: { color: 'red' } };
        buildAndRender('<div :style="{ color: $data.color }"></div>', scope);

        const div = container.querySelector('div');
        expect((div as HTMLElement)!.style.color).toBe('red');
    });

    it('should update style binding', () => {
        const scope = { $data: { color: 'red' } };
        const instance = buildAndRender('<div :style="{ color: $data.color }"></div>', scope);

        const div = container.querySelector('div');
        expect((div as HTMLElement)!.style.color).toBe('red');

        scope.$data.color = 'blue';
        instance.update();

        expect((div as HTMLElement)!.style.color).toBe('blue');
    });

    it('should handle static class and style', () => {
        buildAndRender('<div class="foo bar" style="color: red; margin: 10px;"></div>');

        const div = container.querySelector('div');
        expect(div!.className).toBe('foo bar');
        expect((div as HTMLElement)!.style.color).toBe('red');
    });

    it('should destroy and clean up', () => {
        const instance = buildAndRender('<div>content</div>');

        expect(container.innerHTML).toContain('content');

        instance.destroy();

        expect(container.innerHTML).toBe('');
    });

    it('should handle SVG elements', () => {
        buildAndRender('<svg><circle cx="50" cy="50" r="40"></circle></svg>');

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        const circle = svg!.querySelector('circle');
        expect(circle).not.toBeNull();
        expect(circle!.getAttribute('cx')).toBe('50');
    });

    it('should handle boolean attributes', () => {
        const scope = { $data: { disabled: true } };
        const instance = buildAndRender('<input :disabled="$data.disabled">', scope);

        const input = container.querySelector('input') as HTMLInputElement;
        expect(input.disabled).toBe(true);

        scope.$data.disabled = false;
        instance.update();

        expect(container.querySelector('input')!.disabled).toBe(false);
    });

    it('should handle data-* attributes', () => {
        const scope = { $data: { id: '123' } };
        buildAndRender('<div :data-id="$data.id"></div>', scope);

        const div = container.querySelector('div');
        expect(div!.getAttribute('data-id')).toBe('123');
    });

    it('should handle aria-* attributes', () => {
        const scope = { $data: { label: 'test' } };
        buildAndRender('<div :aria-label="$data.label"></div>', scope);

        const div = container.querySelector('div');
        expect(div!.getAttribute('aria-label')).toBe('test');
    });

    it('should handle s-model on input', () => {
        const scope = { $data: { name: 'hello' } };
        buildAndRender('<input s-model="$data.name">', scope);

        const input = container.querySelector('input') as HTMLInputElement;
        expect(input.value).toBe('hello');
    });

    it('should handle value property for select', () => {
        const scope = { $data: { selected: '2' } };
        buildAndRender(
            '<select :value="$data.selected"><option value="1">1</option><option value="2">2</option></select>',
            scope,
        );

        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('2');
    });

    it('should handle unmounted lifecycle on cleanup', async () => {
        const spy = vi.fn();
        const scope = { $data: { onUnmount: spy, items: [] as string[] } };
        const instance = buildAndRender(
            '<For each="$data.items" item="it"><span unmounted="$data.onUnmount(el)">{{ it }}</span></For>',
            scope,
        );

        scope.$data.items = ['a'];
        instance.update();

        scope.$data.items = [];
        instance.update();

        // unmounted is called via requestAnimationFrame, wait for it
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(spy).toHaveBeenCalled();
    });

    it('should preserve the space between inline elements', () => {
        buildAndRender('<p><b>Hello</b> <i>World</i></p>', {});

        expect(container.textContent).toBe('Hello World');
    });

    it('should preserve the space between an inline tag and interpolation', () => {
        buildAndRender('<p><b>Name:</b> {{ $data.n }}</p>', { $data: { n: 'x' } });

        expect(container.textContent).toBe('Name: x');
    });

    it('should handle errors in evalIR gracefully', () => {
        const spy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        const scope = { $data: {} };
        buildAndRender('<div>{{ $data.nonexistent.prop }}</div>', scope);

        // Should not throw, error is caught and logged
        expect(container.textContent).toBe('');
        spy.mockRestore();
    });

    it('should handle static subtree optimization', () => {
        buildAndRender('<div><span>static</span></div>');

        const span = container.querySelector('span');
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe('static');
    });

    it('should handle HTML entities in static text', () => {
        buildAndRender('<div>&lt;test&gt;</div>');

        expect(container.textContent).toBe('<test>');
    });
});

describe('renderIR - s-model on multiple select', () => {
    it('should apply initial selection on mount', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { picked: ['a', 'c'] } };
        const ir = buildIR(
            parseHtml(
                '<select multiple s-model="$data.picked">' +
                    '<option value="a">a</option>' +
                    '<option value="b">b</option>' +
                    '<option value="c">c</option>' +
                    '</select>',
            ),
            { filename: 'multi-select.html' },
        );

        createRender(ir, host, scope);

        // mounted 生命周期在 requestAnimationFrame 中执行
        await new Promise(resolve => setTimeout(resolve, 30));

        const select = host.querySelector('select')!;
        expect(Array.from(select.selectedOptions).map(o => o.value)).toEqual(['a', 'c']);

        host.remove();
    });
});

describe('renderIR - URL safety', () => {
    function renderLink(url: string) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { url } };
        const ir = buildIR(parseHtml('<a :href="$data.url">link</a>'), { filename: 'url-safety.html' });
        createRender(ir, host, scope);
        return host;
    }

    it('should block javascript: URLs on :href', () => {
        const host = renderLink('javascript:alert(1)');
        expect(host.querySelector('a')!.hasAttribute('href')).toBe(false);
        host.remove();
    });

    it('should allow http(s) and relative URLs', () => {
        const host = renderLink('/docs');
        expect(host.querySelector('a')!.getAttribute('href')).toBe('/docs');
        host.remove();
    });

    it('should block obfuscated javascript: URLs', () => {
        const host = renderLink('java\tscript:alert(1)');
        expect(host.querySelector('a')!.hasAttribute('href')).toBe(false);
        host.remove();
    });
});

describe('renderIR - URL scheme edge cases', () => {
    function renderLink(url: string) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { url } };
        const ir = buildIR(parseHtml('<a :href="$data.url">link</a>'), { filename: 'url-edge.html' });
        createRender(ir, host, scope);
        return host;
    }

    it('should block data:text/html URLs', () => {
        for (const url of ['data:text/html,<script>alert(1)</script>', 'data:text/html;base64,PHNjcmlwdD4=']) {
            const host = renderLink(url);
            expect(host.querySelector('a')!.hasAttribute('href')).toBe(false);
            host.remove();
        }
    });

    it('should allow data:image URLs', () => {
        const url = 'data:image/png;base64,iVBORw0KGgo=';
        const host = renderLink(url);

        expect(host.querySelector('a')!.getAttribute('href')).toBe(url);
        host.remove();
    });
});

describe('renderIR - inline whitespace', () => {
    it('should render the space before a closing inline tag', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const ir = buildIR(parseHtml('<p><b>Hello </b><i>World</i></p>'), { filename: 'inline-space.html' });
        createRender(ir, host, {});

        expect(host.textContent).toBe('Hello World');
        host.remove();
    });
});

describe('renderIR - inline conditional whitespace', () => {
    function render(html: string) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const ir = buildIR(parseHtml(html), { filename: 'inline-if.html' });
        createRender(ir, host, {});
        return host;
    }

    it('should keep spaces on both sides of an inline If', () => {
        const host = render('<p>foo <If test="true">x</If> baz</p>');

        expect(host.textContent).toBe('foo x baz');
        host.remove();
    });

    it('should keep the space between a conditional chain and following inline content', () => {
        const host = render('<div><If test="true">a</If> <span>b</span></div>');

        expect(host.textContent).toBe('a b');
        host.remove();
    });
});

describe('renderIR - unsafe URL warning', () => {
    it('should warn only once per element/prop/value across updates', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { url: 'javascript:alert(1)', n: 0 } };
        const ir = buildIR(parseHtml('<a :href="$data.url">x</a><span>{{ $data.n }}</span>'), {
            filename: 'warn-once.html',
        });
        const renderer = createRender(ir, host, scope);

        renderer.update();
        renderer.update();

        const blockedWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('Blocked unsafe URL'));
        expect(blockedWarnings).toHaveLength(1);

        host.remove();
        warnSpy.mockRestore();
    });
});

describe('renderIR - srcset / srcdoc', () => {
    it('should block javascript: in srcset', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { set: 'javascript:alert(1) 1x' } };
        const ir = buildIR(parseHtml('<img :srcset="$data.set">'), { filename: 'srcset.html' });
        createRender(ir, host, scope);

        expect(host.querySelector('img')!.hasAttribute('srcset')).toBe(false);

        host.remove();
        warnSpy.mockRestore();
    });

    it('should block srcdoc bindings', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = document.createElement('div');
        document.body.appendChild(host);
        clearIRCache();

        const scope: Record<string, unknown> = { $data: { html: '<script>alert(1)</script>' } };
        const ir = buildIR(parseHtml('<iframe :srcdoc="$data.html"></iframe>'), { filename: 'srcdoc.html' });
        createRender(ir, host, scope);

        expect(host.querySelector('iframe')!.hasAttribute('srcdoc')).toBe(false);

        host.remove();
        warnSpy.mockRestore();
    });
});
