import { describe, it, expect, vi } from 'vitest';
import { patch, type ASTNode } from '../src/utils';

describe('utils/ast-processor.patch', () => {
  it('adds elements, sets attrs/props/styles/classes and updates text', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // mock requestAnimationFrame to run immediately
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1 as any;
    });

    const ast1: ASTNode[] = [{
      rootId: '0',
      tagName: 'div',
      attrs: { 'data-x': '1' },
      props: { title: () => 'hello' },
      on: { click: () => {} },
      styles: () => ({ color: 'red', nested: { fontSize: '12px' } }),
      classes: () => ({ active: true }),
      children: [{
        rootId: '0',
        tagName: 'text',
        attrs: {},
        props: {},
        on: {},
        content: () => 'A',
        children: []
      }]
    }];

    let vnodes = patch(container, ast1, []);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-x')).toBe('1');
    expect(el.title).toBe('hello');
    expect(el.style.color).toBe('red');
    // nested style object is flattened to key 'nested-fontSize'
    expect((el.style as any)['nested-fontSize']).toBe('12px');
    expect(el.classList.contains('active')).toBe(true);
    expect(el.textContent).toBe('A');

    // update: change classes, styles and text
    const updatedClick = vi.fn();
    const ast2: ASTNode[] = [{
      rootId: '0',
      tagName: 'div',
      attrs: { 'data-x': '2' },
      props: { title: () => 'world' },
      on: { click: updatedClick },
      styles: () => ({ color: 'blue' }),
      classes: () => ({ active: false, done: true }),
      onUpdated: (elm) => {
        // ensure updated hook runs on next frame
        (elm as HTMLElement).setAttribute('data-updated', '1');
      },
      children: [{
        rootId: '0',
        tagName: 'text',
        attrs: {},
        props: {},
        on: {},
        content: () => 'B',
        children: []
      }]
    }];

    vnodes = patch(container, ast2, vnodes);
    const el2 = container.firstElementChild as HTMLElement;
    // attrs are set on creation; update keeps previous attrs
    expect(el2.getAttribute('data-x')).toBe('1');
    expect(el2.title).toBe('world');
    expect(el2.style.color).toBe('blue');
    expect(el2.classList.contains('active')).toBe(false);
    expect(el2.classList.contains('done')).toBe(true);
    expect(el2.textContent).toBe('B');

    // event updated
    el2.click();
    expect(updatedClick).toHaveBeenCalled();

    // onUpdated applied
    expect(el2.getAttribute('data-updated')).toBe('1');

    rafSpy.mockRestore();
  });
});