/**
 * 展示类元素组件修复回归测试
 * 覆盖 alert 可访问性与可取消自动关闭、tag 可阻止移除、divider 空白判断、
 * backtop RAF 清理与键盘操作、skeleton aria-busy、empty 动态插槽、not-found 文案与 back 事件
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import '../../src/components/elements/alert';
import '../../src/components/elements/tag';
import '../../src/components/elements/divider';
import '../../src/components/elements/backtop';
import '../../src/components/elements/skeleton';
import '../../src/components/elements/empty';
import '../../src/components/elements/not-found';
import { tick } from '../helpers';

describe('solely-alert', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should expose role="alert" and an aria-label on the close button', async () => {
        const el = document.createElement('solely-alert') as any;
        el.setAttribute('message', 'hello');
        el.setAttribute('closable', '');
        document.body.appendChild(el);
        await tick();

        expect(el.shadowRoot.querySelector('.alert').getAttribute('role')).toBe('alert');
        const close = el.shadowRoot.querySelector('.alert__close');
        expect(close.getAttribute('aria-label')).toBe('关闭');
        expect(close.getAttribute('tabindex')).toBe('0');
    });

    it('should auto close after auto-close delay', async () => {
        const el = document.createElement('solely-alert') as any;
        el.setAttribute('message', 'hello');
        el.setAttribute('auto-close', '10');
        document.body.appendChild(el);
        await tick(450);

        expect(el.isConnected).toBe(false);
    });

    it('should allow cancelling auto close via preventDefault', async () => {
        const el = document.createElement('solely-alert') as any;
        el.setAttribute('message', 'hello');
        el.setAttribute('auto-close', '10');
        el.addEventListener('close', (e: CustomEvent) => e.preventDefault());
        document.body.appendChild(el);
        await tick(450);

        expect(el.isConnected).toBe(true);
        expect(el.shadowRoot.querySelector('.alert').getAttribute('role')).toBe('alert');
    });
});

describe('solely-tag', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should remove on close by default', async () => {
        const el = document.createElement('solely-tag') as any;
        el.setAttribute('content', 'tag');
        el.setAttribute('closable', '');
        document.body.appendChild(el);
        await tick();

        el.shadowRoot.querySelector('.tag__close').click();
        expect(el.isConnected).toBe(false);
    });

    it('should keep the tag when close is prevented', async () => {
        const el = document.createElement('solely-tag') as any;
        el.setAttribute('content', 'tag');
        el.setAttribute('closable', '');
        el.addEventListener('close', (e: CustomEvent) => e.preventDefault());
        document.body.appendChild(el);
        await tick();

        el.shadowRoot.querySelector('.tag__close').click();
        await tick();

        expect(el.isConnected).toBe(true);
    });
});

describe('solely-divider', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should not treat whitespace-only text as slot content', async () => {
        const el = document.createElement('solely-divider');
        el.appendChild(document.createTextNode('   \n  '));
        document.body.appendChild(el);
        await tick();

        expect(el.shadowRoot!.querySelector('.divider__content')).toBeNull();
    });

    it('should treat text and non-empty element content as slot content', async () => {
        const textDivider = document.createElement('solely-divider');
        textDivider.appendChild(document.createTextNode('Section'));
        document.body.appendChild(textDivider);

        const elementDivider = document.createElement('solely-divider');
        const span = document.createElement('span');
        span.textContent = 'Element';
        elementDivider.appendChild(span);
        document.body.appendChild(elementDivider);
        await tick();

        expect(textDivider.shadowRoot!.querySelector('.divider__content')).not.toBeNull();
        expect(elementDivider.shadowRoot!.querySelector('.divider__content')).not.toBeNull();
    });
});

describe('solely-backtop', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should support keyboard and cancel pending RAF on unmount', async () => {
        const rafSpy = vi.fn().mockReturnValue(1);
        const cancelSpy = vi.fn();
        vi.stubGlobal('requestAnimationFrame', rafSpy);
        vi.stubGlobal('cancelAnimationFrame', cancelSpy);

        const el = document.createElement('solely-backtop') as any;
        document.body.appendChild(el);
        // 等待初始化容器（100ms）
        await tick(150);

        const base = el.shadowRoot.querySelector('.backtop');
        expect(base.getAttribute('role')).toBe('button');
        expect(base.getAttribute('tabindex')).toBe('0');

        base.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(rafSpy).toHaveBeenCalled();

        el.remove();
        expect(cancelSpy).toHaveBeenCalled();
    });
});

describe('solely-skeleton', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should reflect loading state via aria-busy', async () => {
        const el = document.createElement('solely-skeleton') as any;
        document.body.appendChild(el);
        await tick();

        expect(el.getAttribute('aria-busy')).toBe('true');

        el.finishLoading();
        await tick();

        expect(el.getAttribute('aria-busy')).toBe('false');
    });
});

describe('solely-empty', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should refresh after an image slot is inserted dynamically', async () => {
        const el = document.createElement('solely-empty') as any;
        document.body.appendChild(el);
        await tick();

        expect(el.shadowRoot.querySelector('slot[name="image"]')).toBeNull();

        const image = document.createElement('div');
        image.setAttribute('slot', 'image');
        el.appendChild(image);
        await tick();

        expect(el.shadowRoot.querySelector('slot[name="image"]')).not.toBeNull();
    });

    it('description 具名插槽优先，缺省回退 description 属性或默认文案（R-07）', async () => {
        const fallback = document.createElement('solely-empty') as any;
        document.body.appendChild(fallback);
        await tick();

        const defaultSlot = fallback.shadowRoot.querySelector('slot[name="description"]');
        expect(defaultSlot).not.toBeNull();
        expect(defaultSlot.textContent.trim()).toBe('暂无数据');

        const withAttr = document.createElement('solely-empty') as any;
        withAttr.setAttribute('description', '自定义描述');
        document.body.appendChild(withAttr);
        await tick();
        expect(withAttr.shadowRoot.querySelector('slot[name="description"]').textContent.trim()).toBe('自定义描述');

        const withSlot = document.createElement('solely-empty') as any;
        withSlot.setAttribute('description', '属性描述');
        withSlot.innerHTML = '<span slot="description">插槽描述</span>';
        document.body.appendChild(withSlot);
        await tick();

        expect(withSlot.querySelector('[slot="description"]')).not.toBeNull();
        expect(withSlot.shadowRoot.querySelector('slot[name="description"]')).not.toBeNull();
    });
});

describe('solely-not-found', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.documentElement.lang = '';
    });

    afterEach(() => {
        document.documentElement.lang = '';
    });

    it('should use language-aware defaults and allow attribute overrides', async () => {
        document.documentElement.lang = 'en';
        const english = document.createElement('solely-not-found') as any;
        document.body.appendChild(english);
        await tick();

        expect(english.shadowRoot.querySelector('.not-found__subtitle').textContent).toContain('Sorry');

        const overridden = document.createElement('solely-not-found') as any;
        overridden.setAttribute('subtitle', '自定义副标题');
        document.body.appendChild(overridden);
        await tick();

        expect(overridden.shadowRoot.querySelector('.not-found__subtitle').textContent).toBe('自定义副标题');
    });

    it('should apply the embedded class and dispatch a cancelable back event', async () => {
        const el = document.createElement('solely-not-found') as any;
        el.setAttribute('embedded', '');
        document.body.appendChild(el);
        await tick();

        expect(el.shadowRoot.querySelector('.not-found').classList.contains('not-found--embedded')).toBe(true);

        let detail: any;
        let fired = false;
        el.addEventListener('back', (e: CustomEvent) => {
            fired = true;
            detail = e.detail;
            e.preventDefault();
        });

        el.shadowRoot.querySelector('.not-found__button').click();

        expect(fired).toBe(true);
        expect(detail).toEqual({ url: '/' });
    });

    it('should expose language-aware defaults via properties', async () => {
        document.documentElement.lang = 'en';
        const el = document.createElement('solely-not-found') as any;
        document.body.appendChild(el);
        await tick();

        expect(el.subtitle).toContain('Sorry');
        expect(el.description).toContain('Please check');
        expect(el.backText).toBe('Back to Home');
        expect(el.hasAttribute('subtitle')).toBe(false);
        expect(el.hasAttribute('description')).toBe(false);
        expect(el.hasAttribute('back-text')).toBe(false);
    });

    it('should read explicit values and fall back after removeAttribute', async () => {
        document.documentElement.lang = 'en';
        const el = document.createElement('solely-not-found') as any;
        el.setAttribute('subtitle', 'Custom subtitle');
        el.setAttribute('description', 'Custom description');
        el.setAttribute('back-text', 'Custom back');
        document.body.appendChild(el);
        await tick();

        expect(el.subtitle).toBe('Custom subtitle');
        expect(el.description).toBe('Custom description');
        expect(el.backText).toBe('Custom back');

        el.removeAttribute('subtitle');
        el.removeAttribute('description');
        el.removeAttribute('back-text');
        await tick();

        expect(el.subtitle).toContain('Sorry');
        expect(el.description).toContain('Please check');
        expect(el.backText).toBe('Back to Home');
    });
});
