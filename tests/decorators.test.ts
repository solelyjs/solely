import { describe, it, expect, vi } from 'vitest';
import { CustomElement } from '../src/runtime/component/decorators';

describe('base/decorators.CustomElement', () => {
  it('registers custom element and sets manifest on prototype', () => {
    class El1 extends HTMLElement { }
    const DecoratedClass = (CustomElement({ tagName: 'dup-el', template: '<span></span>' }) as ClassDecorator)(El1 as any) as any;

    // custom element should be registered (返回的是新类 CE，不是原类 El1)
    const defined = customElements.get('dup-el');
    expect(defined).toBe(DecoratedClass);
    expect(defined?.prototype).toBeInstanceOf(El1);

    // manifest attached to the decorated class
    const MANIFEST_SYMBOL = Symbol.for("solely.manifest");
    expect((DecoratedClass as any)[MANIFEST_SYMBOL]).toBeDefined();
    expect((DecoratedClass as any)[MANIFEST_SYMBOL].tagName).toBe('dup-el');
  });

  it('warns and skips duplicate registration', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    class El2 extends HTMLElement { }
    // attempt to register same tag again should warn and not override
    (CustomElement({ tagName: 'dup-el', template: '<div></div>' }) as ClassDecorator)(El2 as any);
    expect(spy).toHaveBeenCalled();
    // Ensure the original constructor is still the one registered
    const defined = customElements.get('dup-el');
    expect(defined).not.toBe(El2);
    spy.mockRestore();
  });
});