import { describe, it, expect, vi } from 'vitest';
import { CustomElement } from '../src/base';

describe('base/decorators.CustomElement', () => {
  it('registers custom element and sets manifest on prototype', () => {
    class El1 extends HTMLElement { }
    (CustomElement({ tagName: 'dup-el', template: '<span></span>' }) as ClassDecorator)(El1 as any) as any;

    // custom element should be registered
    const defined = customElements.get('dup-el');
    expect(defined).toBe(El1);

    // manifest attached
    expect((El1.prototype as any)._manifest).toBeDefined();
    expect((El1.prototype as any)._manifest.tagName).toBe('dup-el');
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