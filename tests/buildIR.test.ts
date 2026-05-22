import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildIR, clearIRCache } from '../src/compiler/ir/buildIR';
import { parseHtml } from '../src/compiler/parser/parser';
import { ASTType } from '../src/types';

describe('buildIR', () => {
    beforeEach(() => {
        clearIRCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should build IR for static element', () => {
        const ast = parseHtml('<div class="container">hello</div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<div class="container">hello</div>' });

        expect(ir.t).toBe('root');
        expect(ir.n).toHaveLength(1);
        expect(ir.n[0].t).toBe(ASTType.Element);
        expect(ir.n[0].g).toBe('div');
        expect(ir.n[0].d).toBe(0);
        expect(ir.n[0].s).toBe(1); // static subtree
        expect(ir.n[0].a).toHaveLength(1);
        expect(ir.n[0].a![0].k).toBe('class');
        expect(ir.n[0].a![0].v).toBe('container');
        expect(ir.n[0].a![0].d).toBe(0);
        expect(ir.n[0].c).toHaveLength(1);
        expect(ir.n[0].c![0].t).toBe(ASTType.Text);
        expect(ir.n[0].c![0].x).toBe('hello');
    });

    it('should build IR for dynamic text interpolation', () => {
        const ast = parseHtml('<div>{{ $data.name }}</div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<div>{{ $data.name }}</div>' });

        expect(ir.n[0].d).toBe(0); // parent element is not dynamic itself
        expect(ir.n[0].c![0].d).toBe(1); // child text node is dynamic
        expect(ir.n[0].c![0].f).toBeGreaterThan(0);
        expect(ir.n[0].c![0].x).toBeUndefined();
    });

    it('should build IR for dynamic attributes', () => {
        const ast = parseHtml('<img :src="$data.url" :alt="$data.name">');
        const ir = buildIR(ast, { filename: 'test.html', source: '<img :src="$data.url" :alt="$data.name">' });

        expect(ir.n[0].d).toBe(1);
        const attrs = ir.n[0].a!;
        expect(attrs).toHaveLength(2);
        expect(attrs[0].k).toBe(':src');
        expect(attrs[0].d).toBe(1);
        expect(attrs[0].f).toBeGreaterThan(0);
        expect(attrs[1].k).toBe(':alt');
        expect(attrs[1].d).toBe(1);
    });

    it('should build IR for event handlers', () => {
        const ast = parseHtml('<button @click="$data.count++">click</button>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<button @click="$data.count++">click</button>' });

        expect(ir.n[0].d).toBe(1);
        const clickAttr = ir.n[0].a!.find(a => a.k === '@click');
        expect(clickAttr).toBeDefined();
        expect(clickAttr!.d).toBe(1);
        expect(clickAttr!.f).toBeGreaterThan(0);
    });

    it('should build IR for s-model on input text', () => {
        const ast = parseHtml('<input s-model="$data.name">');
        const ir = buildIR(ast, { filename: 'test.html', source: '<input s-model="$data.name">' });

        expect(ir.n[0].d).toBe(1);
        const attrs = ir.n[0].a!;
        const valueAttr = attrs.find(a => a.k === ':value');
        const inputAttr = attrs.find(a => a.k === '@input');

        expect(valueAttr).toBeDefined();
        expect(valueAttr!.d).toBe(1);
        expect(inputAttr).toBeDefined();
        expect(inputAttr!.d).toBe(1);
        expect(inputAttr!.r).toBe('model');

        // s-model should be removed
        expect(attrs.find(a => a.k === 's-model')).toBeUndefined();
    });

    it('should build IR for s-model on checkbox', () => {
        const ast = parseHtml('<input type="checkbox" s-model="$data.items">');
        const ir = buildIR(ast, { filename: 'test.html', source: '<input type="checkbox" s-model="$data.items">' });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === ':checked')).toBeDefined();
        expect(attrs.find(a => a.k === '@change')).toBeDefined();
    });

    it('should build IR for s-model on radio', () => {
        const ast = parseHtml('<input type="radio" s-model="$data.choice" value="a">');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<input type="radio" s-model="$data.choice" value="a">',
        });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === ':checked')).toBeDefined();
        expect(attrs.find(a => a.k === '@change')).toBeDefined();
    });

    it('should build IR for s-model on textarea', () => {
        const ast = parseHtml('<textarea s-model="$data.content"></textarea>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<textarea s-model="$data.content"></textarea>' });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === ':value')).toBeDefined();
        expect(attrs.find(a => a.k === '@input')).toBeDefined();
    });

    it('should build IR for s-model on select', () => {
        const ast = parseHtml('<select s-model="$data.selected"><option value="1">1</option></select>');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<select s-model="$data.selected"><option value="1">1</option></select>',
        });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === ':value')).toBeDefined();
        expect(attrs.find(a => a.k === '@change')).toBeDefined();
    });

    it('should build IR for s-model on select multiple', () => {
        const ast = parseHtml('<select multiple s-model="$data.selected"><option value="1">1</option></select>');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<select multiple s-model="$data.selected"><option value="1">1</option></select>',
        });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === 'updated')).toBeDefined();
        expect(attrs.find(a => a.k === '@change')).toBeDefined();
    });

    it('should build IR for custom component s-model', () => {
        const ast = parseHtml('<solely-checkbox s-model="$data.checked"></solely-checkbox>');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<solely-checkbox s-model="$data.checked"></solely-checkbox>',
        });

        const attrs = ir.n[0].a!;
        expect(attrs.find(a => a.k === ':checked')).toBeDefined();
        expect(attrs.find(a => a.k === '@change')).toBeDefined();
    });

    it('should build IR for For loop', () => {
        const ast = parseHtml('<For each="$data.items" item="it" index="i"><span>{{ it }}</span></For>');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<For each="$data.items" item="it" index="i"><span>{{ it }}</span></For>',
        });

        expect(ir.n[0].t).toBe(ASTType.For);
        expect(ir.n[0].d).toBe(1);
        expect(ir.n[0].f).toBeGreaterThan(0);
        expect(ir.n[0].i).toBe('it');
        expect(ir.n[0].n).toBe('i');
        expect(ir.n[0].c).toHaveLength(1);
        expect(ir.n[0].c![0].t).toBe(ASTType.Element);
    });

    it('should build IR for If/ElseIf/Else chain', () => {
        const ast = parseHtml(
            '<If test="$data.a === 1"><span>a</span></If><ElseIf test="$data.a === 2"><span>b</span></ElseIf><Else><span>c</span></Else>',
        );
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<If test="$data.a === 1"><span>a</span></If><ElseIf test="$data.a === 2"><span>b</span></ElseIf><Else><span>c</span></Else>',
        });

        expect(ir.n).toHaveLength(1);
        expect(ir.n[0].t).toBe(ASTType.Conditional);
        expect(ir.n[0].d).toBe(1);
        expect(ir.n[0].b).toHaveLength(3);
        expect(ir.n[0].b![0].f).toBeGreaterThan(0);
        expect(ir.n[0].b![1].f).toBeGreaterThan(0);
        expect(ir.n[0].b![2].f).toBeNull(); // else has no condition
    });

    it('should build IR for lifecycle attributes', () => {
        const ast = parseHtml('<div mounted="$data.onMount(el)" updated="$data.onUpdate(el)">content</div>');
        const ir = buildIR(ast, {
            filename: 'test.html',
            source: '<div mounted="$data.onMount(el)" updated="$data.onUpdate(el)">content</div>',
        });

        const attrs = ir.n[0].a!;
        const mounted = attrs.find(a => a.k === 'mounted');
        const updated = attrs.find(a => a.k === 'updated');

        expect(mounted).toBeDefined();
        expect(mounted!.d).toBe(1);
        expect(mounted!.f).toBeGreaterThan(0);

        expect(updated).toBeDefined();
        expect(updated!.d).toBe(1);
        expect(updated!.f).toBeGreaterThan(0);
    });

    it('should build IR for ref attribute', () => {
        const ast = parseHtml('<input ref="myInput">');
        const ir = buildIR(ast, { filename: 'test.html', source: '<input ref="myInput">' });

        const refAttr = ir.n[0].a!.find(a => a.k === 'ref');
        expect(refAttr).toBeDefined();
        expect(refAttr!.v).toBe('myInput');
        expect(refAttr!.d).toBe(0);
    });

    it('should mark static subtrees correctly', () => {
        const ast = parseHtml('<div><span>static</span></div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<div><span>static</span></div>' });

        expect(ir.n[0].s).toBe(1);
        expect(ir.n[0].c![0].s).toBe(1);
    });

    it('should not mark dynamic subtrees as static', () => {
        const ast = parseHtml('<div><span>{{ $data.name }}</span></div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<div><span>{{ $data.name }}</span></div>' });

        expect(ir.n[0].s).toBeUndefined();
        expect(ir.n[0].c![0].s).toBeUndefined();
    });

    it('should include stats in IR root', () => {
        const ast = parseHtml('<div>{{ $data.name }}</div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<div>{{ $data.name }}</div>' });

        expect(ir.s.tf).toBeGreaterThanOrEqual(0);
        expect(ir.s.tn).toBeGreaterThan(0);
        expect(ir.s.dn).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in IR root', () => {
        const source = '<div>test</div>';
        const ast = parseHtml(source);
        const ir = buildIR(ast, { filename: 'test.html', source });

        expect(ir.m).toBeDefined();
        expect(ir.m!.fn).toBe('test.html');
        expect(ir.m!.src).toBe(source);
        expect(ir.m!.as).toBe(ast.length);
    });

    it('should handle empty AST', () => {
        const ir = buildIR([], { filename: 'empty.html' });

        expect(ir.n).toHaveLength(0);
        expect(ir.s.tn).toBe(0);
        expect(ir.s.dn).toBe(0);
    });

    it('should handle comment nodes', () => {
        const ast = parseHtml('<!-- comment --><div></div>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<!-- comment --><div></div>' });

        expect(ir.n).toHaveLength(2);
        expect(ir.n[0].t).toBe(ASTType.Comment);
        expect(ir.n[0].x).toBe(' comment ');
    });

    it('should cache functions across builds with same filename', () => {
        const ast = parseHtml('<div>{{ $data.name }}</div>');
        const ir1 = buildIR(ast, { filename: 'cache.html', source: '<div>{{ $data.name }}</div>' });
        const fns1 = ir1.fns.length;

        const ir2 = buildIR(ast, { filename: 'cache.html', source: '<div>{{ $data.name }}</div>' });
        const fns2 = ir2.fns.length;

        expect(fns1).toBe(fns2);
    });

    it('should handle orphan conditional nodes gracefully', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ast = parseHtml('<Else><span>orphan</span></Else>');
        const ir = buildIR(ast, { filename: 'test.html', source: '<Else><span>orphan</span></Else>' });

        expect(ir.n[0].t).toBe(ASTType.Else);
        expect(ir.n[0].c).toHaveLength(1);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
