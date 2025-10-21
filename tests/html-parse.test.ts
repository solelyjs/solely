import { describe, it, expect } from 'vitest';
import { parseHtml, type ASTNode } from '../src/utils';

const makeCtx = () => ({
  tagName: 'test-el',
  $data: {
    name: 'Ada',
    count: 1,
    color: 'red',
    isActive: true,
    val: 'init',
    checked: false,
    choice: 'b',
    items: ['x', 'y']
  }
});

describe('utils/html-parse', () => {
  it('parses text and interpolation', () => {
    const ctx = makeCtx();
    const ast = parseHtml(ctx, '<div>Hello, {{ $data.name }}!</div>');
    // expect: a div node and a text child with function content
    const div = ast.find(n => n.tagName === 'div') as ASTNode;
    expect(div).toBeTruthy();
    expect(div.children.length).toBe(1);
    const text = div.children[0];
    expect(text.tagName).toBe('text');
    expect(typeof text.content).toBe('function');
    const content = (text.content as Function)([]);
    expect(content).toBe('Hello, Ada!');
  });

  it('parses s-class, s-style and on-click event', () => {
    const ctx = makeCtx();
    const ast = parseHtml(ctx, '<div s-class="{ active: $data.isActive }" s-style="{ color: $data.color }" on-click="$data.count=$data.count+1">Btn</div>');
    const div = ast[0];
    expect(typeof div.classes).toBe('function');
    expect(typeof div.styles).toBe('function');
    expect(typeof div.on.click).toBe('function');

    const classes = div.classes!([]);
    const styles = div.styles!([]);
    expect(classes).toEqual({ active: true });
    expect(styles).toBeDefined();
    expect(styles).toEqual({ color: 'red' });

    // simulate click handler
    div.on.click({ target: { value: '', checked: false } } as any, []);
    expect(ctx.$data.count).toBe(2);
  });

  it('creates lifecycle handlers onMounted/onUpdated', async () => {
    const ctx = makeCtx();
    const ast = parseHtml(ctx, '<div onMounted="elm.setAttribute(\'data-m\',\'1\')" onUpdated="elm.setAttribute(\'data-u\',\'2\')"></div>');
    const div = ast[0];
    expect(typeof div.onMounted).toBe('function');
    expect(typeof div.onUpdated).toBe('function');

    const el = document.createElement('div');
    div.onMounted!(el, []);
    div.onUpdated!(el, []);
    expect(el.getAttribute('data-m')).toBe('1');
    expect(el.getAttribute('data-u')).toBe('2');
  });

  it('supports s-model for input/textarea/select and radio/checkbox', () => {
    const ctx = makeCtx();

    // input text
    let ast = parseHtml(ctx, '<input s-model="$data.val" />');
    let input = ast[0];
    expect(input.props.value!([])).toBe('init');
    input.on.input!({ target: { value: 'new' } } as any, []);
    expect(ctx.$data.val).toBe('new');

    // checkbox
    ast = parseHtml(ctx, '<input type="checkbox" s-model="$data.checked" />');
    let checkbox = ast[0];
    expect(checkbox.props.checked!([])).toBe(false);
    checkbox.on.change!({ target: { checked: true } } as any, []);
    expect(ctx.$data.checked).toBe(true);

    // radio
    ast = parseHtml(ctx, '<input type="radio" value="a" s-model="$data.choice" />');
    let radio = ast[0];
    expect(radio.props.checked!([])).toBe(false);
    radio.on.change!({ target: { checked: true } } as any, []);
    expect(ctx.$data.choice).toBe('a');

    // textarea
    ast = parseHtml(ctx, '<textarea s-model="$data.val"></textarea>');
    let textarea = ast[0];
    expect(textarea.props.value!([])).toBe('new');
    textarea.on.input!({ target: { value: 'ok' } } as any, []);
    expect(ctx.$data.val).toBe('ok');

    // select
    ast = parseHtml(ctx, '<select s-model="$data.val"></select>');
    let select = ast[0];
    expect(select.props.value!([])).toBe('ok');
    select.on.change!({ target: { value: 'sel' } } as any, []);
    expect(ctx.$data.val).toBe('sel');
  });

  it('creates control flow nodes For and If with evaluators', () => {
    const ctx = makeCtx();
    let ast = parseHtml(ctx, '<For each="$data.items"><div>{{ item }}</div></For>');
    const forNode = ast[0];
    expect(forNode.tagName).toBe('For');
    expect(typeof forNode.fn).toBe('function');
    const arr = forNode.fn!([]);
    expect(arr).toEqual(['x', 'y']);

    ast = parseHtml(ctx, '<If condition="$data.count>0"><div>A</div></If><ElseIf condition="$data.count===0"><div>B</div></ElseIf>');
    const ifNode = ast[0];
    const elseIfNode = ast[1];
    expect(ifNode.tagName).toBe('If');
    expect(elseIfNode.tagName).toBe('ElseIf');
    expect(ifNode.fn!([])).toBe(true);
    expect(elseIfNode.fn!([])).toBe(false);
  });
});