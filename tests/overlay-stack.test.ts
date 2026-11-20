/**
 * 浮层栈基座测试（jsdom）
 *
 * 覆盖 docs/architecture/contracts.md 浮层契约的关键行为（完整编号版见本地审计材料 docs/internal/design-contracts.md，不入库）：
 * Esc 顺序、焦点还原候选链、Tab 陷阱、滚动锁引用计数、z-index 分配、inert。
 *
 * jsdom 限制（已在用例中补偿）：
 * - 所有元素 getClientRects() 返回空列表，导致可见性判定失败：统一 stub 成 1 个矩形。
 * - 不支持 inert 属性：模块会退化为 aria-hidden，用例只断言 inert 属性写入/移除。
 * - 不做原生 Tab 移动：只断言 preventDefault 与模块主动设置的目标。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerOverlay, lockScroll, type OverlayHandle } from '../src/shared/floating/overlay-stack';

const RECT = {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    top: 0,
    left: 0,
    right: 10,
    bottom: 10,
    toJSON: () => ({}),
};
const RECT_LIST = [RECT] as unknown as DOMRectList;

let handles: OverlayHandle[] = [];

function makeHandle(options: Parameters<typeof registerOverlay>[0]): OverlayHandle {
    const handle = registerOverlay(options);
    handles.push(handle);
    return handle;
}

function mountContainer(tabindex: string | null = '-1'): HTMLElement {
    const el = document.createElement('div');
    if (tabindex !== null) el.setAttribute('tabindex', tabindex);
    document.body.appendChild(el);
    return el;
}

function mountButton(label = 'button', parent: HTMLElement = document.body): HTMLButtonElement {
    const el = document.createElement('button');
    el.textContent = label;
    parent.appendChild(el);
    return el;
}

/** 在当前焦点元素上派发键盘事件（无焦点时派发到 body） */
function pressKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}

beforeEach(() => {
    handles = [];
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    document.documentElement.style.removeProperty('--solely-z-index-modal');
    // jsdom 无布局：补一个可见矩形，让可见性/可聚焦判定与浏览器一致
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(RECT_LIST);
});

afterEach(() => {
    handles.forEach(handle => {
        handle.deactivate();
        handle.dispose();
    });
    handles = [];
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    vi.restoreAllMocks();
});

describe('Esc 响应者（C-OVL-09）', () => {
    it('从栈顶向下取第一个 escClosable 的层，跳过 tooltip', () => {
        const modalEsc = vi.fn();
        const dropdownEsc = vi.fn();
        const tooltipEsc = vi.fn();

        const modal = makeHandle({ kind: 'modal', container: mountContainer(), onEscape: modalEsc });
        modal.activate();
        const dropdown = makeHandle({ kind: 'dropdown', container: mountContainer(), onEscape: dropdownEsc });
        dropdown.activate();
        const tooltip = makeHandle({
            kind: 'tooltip',
            container: mountContainer(),
            escClosable: false,
            onEscape: tooltipEsc,
        });
        tooltip.activate();

        const bodyKeydown = vi.fn();
        document.body.addEventListener('keydown', bodyKeydown);

        const first = pressKey('Escape');
        expect(tooltipEsc).not.toHaveBeenCalled();
        expect(dropdownEsc).toHaveBeenCalledTimes(1);
        expect(modalEsc).not.toHaveBeenCalled();
        expect(first.defaultPrevented).toBe(true);
        // stopPropagation：capture 阶段消费后，body 的冒泡监听不应收到
        expect(bodyKeydown).not.toHaveBeenCalled();

        document.body.removeEventListener('keydown', bodyKeydown);

        // 关掉 dropdown 后，tooltip 仍不消费，Esc 继续落到 modal
        dropdown.deactivate();
        dropdown.dispose();
        const second = pressKey('Escape');
        expect(modalEsc).toHaveBeenCalledTimes(1);
        expect(second.defaultPrevented).toBe(true);
    });

    it('没有任何可关闭层时不 preventDefault', () => {
        const onEscape = vi.fn();
        const tooltip = makeHandle({
            kind: 'tooltip',
            container: mountContainer(),
            escClosable: false,
            onEscape,
        });
        tooltip.activate();

        const event = pressKey('Escape');
        expect(onEscape).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('输入法组合中不处理 Esc', () => {
        const onEscape = vi.fn();
        const modal = makeHandle({ kind: 'modal', container: mountContainer(), onEscape });
        modal.activate();

        const event = pressKey('Escape', { isComposing: true });
        expect(onEscape).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('passthrough 层先关闭但不消费，继续关闭下层', () => {
        const modalEsc = vi.fn();
        const tooltipEsc = vi.fn();

        const modal = makeHandle({ kind: 'modal', container: mountContainer(), onEscape: modalEsc });
        modal.activate();
        const tooltip = makeHandle({
            kind: 'tooltip',
            container: mountContainer(),
            escClosable: 'passthrough',
            onEscape: tooltipEsc,
        });
        tooltip.activate();

        const bodyKeydown = vi.fn();
        document.body.addEventListener('keydown', bodyKeydown);

        const event = pressKey('Escape');
        expect(tooltipEsc).toHaveBeenCalledTimes(1);
        expect(modalEsc).toHaveBeenCalledTimes(1);
        // 下层 modal 消费 Esc
        expect(event.defaultPrevented).toBe(true);
        expect(bodyKeydown).not.toHaveBeenCalled();

        document.body.removeEventListener('keydown', bodyKeydown);
    });

    it('只有 passthrough 层时不 preventDefault、不阻断冒泡', () => {
        const tooltipEsc = vi.fn();
        const tooltip = makeHandle({
            kind: 'tooltip',
            container: mountContainer(),
            escClosable: 'passthrough',
            onEscape: tooltipEsc,
        });
        tooltip.activate();

        const bodyKeydown = vi.fn();
        document.body.addEventListener('keydown', bodyKeydown);

        const event = pressKey('Escape');
        expect(tooltipEsc).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(false);
        expect(bodyKeydown).toHaveBeenCalledTimes(1);

        document.body.removeEventListener('keydown', bodyKeydown);
    });
});

describe('焦点进入与 Tab 陷阱（C-OVL-10 / C-OVL-11）', () => {
    it('initialFocus 优先于第一个可聚焦元素', () => {
        const container = mountContainer();
        mountButton('first', container);
        const target = mountButton('target', container);
        const handle = makeHandle({
            kind: 'modal',
            container,
            initialFocus: () => target,
            onEscape: vi.fn(),
        });
        handle.activate();
        expect(document.activeElement).toBe(target);
    });

    it('autoFocus=false 不移动焦点', () => {
        const trigger = mountButton('trigger');
        trigger.focus();
        const container = mountContainer();
        const handle = makeHandle({
            kind: 'dropdown',
            container,
            trigger,
            autoFocus: false,
            onEscape: vi.fn(),
        });
        handle.activate();
        expect(document.activeElement).toBe(trigger);
    });

    it('兜底聚焦容器不可聚焦时自动补 tabindex="-1"，dispose 时还原', () => {
        // 调用方未预置 tabindex：此前会静默聚焦失败
        const container = mountContainer(null);
        const handle = makeHandle({ kind: 'modal', container, onEscape: vi.fn() });

        handle.activate();

        expect(container.getAttribute('tabindex')).toBe('-1');
        expect(document.activeElement).toBe(container);

        handle.deactivate();
        handle.dispose();
        expect(container.hasAttribute('tabindex')).toBe(false);
    });

    it('调用方已设置 tabindex 时不覆盖、也不在 dispose 时移除', () => {
        const container = mountContainer('0');
        const handle = makeHandle({ kind: 'modal', container, onEscape: vi.fn() });

        handle.activate();
        handle.deactivate();
        handle.dispose();

        expect(container.getAttribute('tabindex')).toBe('0');
    });

    it('Tab 陷阱：首尾循环，容器外焦点拉回第一个', () => {
        const container = mountContainer();
        const first = mountButton('first', container);
        const last = mountButton('last', container);
        const handle = makeHandle({ kind: 'modal', container, trapFocus: true, onEscape: vi.fn() });
        handle.activate();
        expect(document.activeElement).toBe(first);

        // 中间位置交给浏览器，不拦截
        first.focus();
        const middleTab = pressKey('Tab');
        expect(middleTab.defaultPrevented).toBe(false);

        // Shift+Tab 在第一个 → 最后一个
        first.focus();
        const shiftTab = pressKey('Tab', { shiftKey: true });
        expect(shiftTab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);

        // Tab 在最后一个 → 第一个
        const tab = pressKey('Tab');
        expect(tab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);

        // 焦点在容器外 → 拉回容器内第一个
        const outside = mountButton('outside');
        outside.focus();
        const outsideTab = pressKey('Tab');
        expect(outsideTab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);
    });

    it('只有栈顶且 trapFocus=true 的层处理 Tab', () => {
        const lower = mountContainer();
        const lowerButton = mountButton('lower', lower);
        const lowerHandle = makeHandle({
            kind: 'modal',
            container: lower,
            trapFocus: true,
            onEscape: vi.fn(),
        });
        lowerHandle.activate();

        const upper = mountContainer();
        mountButton('upper', upper);
        const upperHandle = makeHandle({
            kind: 'popover',
            container: upper,
            trapFocus: false,
            onEscape: vi.fn(),
        });
        upperHandle.activate();

        // 焦点在正在关闭的下层里，但栈顶是 trapFocus=false 的 popover
        lowerButton.focus();
        const event = pressKey('Tab');
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(lowerButton);
    });
});

describe('焦点还原（C-OVL-12，含 D8 时序）', () => {
    it('顶层 dispose 后焦点回到 trigger', () => {
        const trigger = mountButton('trigger');
        trigger.focus();
        const container = mountContainer();
        const handle = makeHandle({ kind: 'popover', container, trigger, onEscape: vi.fn() });

        handle.activate();
        expect(document.activeElement).toBe(container);

        // 关闭动画期间焦点仍在浮层内：dispose 才还原
        handle.deactivate();
        expect(document.activeElement).toBe(container);
        handle.dispose();
        expect(document.activeElement).toBe(trigger);
    });

    it('记录的焦点已被移除时跳过并走 blur 兜底', () => {
        const source = mountButton('source');
        source.focus();
        const container = mountContainer();
        const handle = makeHandle({ kind: 'popover', container, onEscape: vi.fn() });

        handle.activate();
        source.remove();
        handle.deactivate();
        handle.dispose();

        expect(document.activeElement).toBe(document.body);
    });

    it('关闭非栈顶层不移动焦点', () => {
        const lower = mountContainer();
        const lowerHandle = makeHandle({ kind: 'modal', container: lower, onEscape: vi.fn() });
        lowerHandle.activate();

        const upper = mountContainer();
        const upperHandle = makeHandle({ kind: 'popover', container: upper, onEscape: vi.fn() });
        upperHandle.activate();
        expect(document.activeElement).toBe(upper);

        lowerHandle.deactivate();
        lowerHandle.dispose();

        expect(document.activeElement).toBe(upper);
    });

    it('顶层关闭时沿候选链回退到下层 lastFocus', () => {
        const lower = mountContainer();
        const lowerFirst = mountButton('lower-first', lower);
        const lowerSecond = mountButton('lower-second', lower);
        const lowerHandle = makeHandle({ kind: 'modal', container: lower, onEscape: vi.fn() });
        lowerHandle.activate();
        expect(document.activeElement).toBe(lowerFirst);

        const upper = mountContainer();
        const upperHandle = makeHandle({ kind: 'popover', container: upper, onEscape: vi.fn() });
        upperHandle.activate();
        // upper 记录的 previousFocus 是 lowerFirst

        lowerSecond.focus(); // 更新下层 lastFocus
        upper.focus(); // 焦点回到上层容器内，保证 dispose 守卫放行
        lowerFirst.remove(); // 让 previousFocus 失效，强制走下层 lastFocus 候选

        upperHandle.deactivate();
        upperHandle.dispose();

        expect(document.activeElement).toBe(lowerSecond);
    });

    it('returnFocus=false 时不还原焦点', () => {
        const trigger = mountButton('trigger');
        trigger.focus();
        const container = mountContainer();
        const handle = makeHandle({
            kind: 'popover',
            container,
            trigger,
            returnFocus: false,
            onEscape: vi.fn(),
        });
        handle.activate();
        handle.deactivate();
        handle.dispose();

        expect(document.activeElement).not.toBe(trigger);
    });
});

describe('滚动锁引用计数（C-OVL-14）', () => {
    it('多开只锁一次，deactivate 不释放，全部 dispose 才还原', () => {
        document.body.style.overflow = 'scroll';
        document.body.style.paddingRight = '6px';

        const first = makeHandle({
            kind: 'modal',
            container: mountContainer(),
            lockScroll: true,
            onEscape: vi.fn(),
        });
        const second = makeHandle({
            kind: 'drawer',
            container: mountContainer(),
            lockScroll: true,
            onEscape: vi.fn(),
        });

        first.activate();
        expect(document.body.style.overflow).toBe('hidden');
        second.activate();
        expect(document.body.style.overflow).toBe('hidden');

        first.deactivate();
        expect(document.body.style.overflow).toBe('hidden');
        first.dispose();
        expect(document.body.style.overflow).toBe('hidden');

        second.deactivate();
        second.dispose();
        expect(document.body.style.overflow).toBe('scroll');
        expect(document.body.style.paddingRight).toBe('6px');
    });

    it('lockScroll 的 unlock 幂等', () => {
        document.body.style.overflow = 'auto';
        const release = lockScroll();
        expect(document.body.style.overflow).toBe('hidden');

        release();
        release();
        expect(document.body.style.overflow).toBe('auto');
    });

    it('滚动条宽度在锁之前测量，补偿不会被 overflow:hidden 抹成 0', () => {
        // jsdom 无真实滚动条，模拟浏览器行为：overflow 置 hidden 后滚动条消失，
        // clientWidth 立刻等于 innerWidth；此时再量 gap 恒为 0，补偿永不生效。
        const gap = 15;
        Object.defineProperty(document.documentElement, 'clientWidth', {
            configurable: true,
            get: () => (document.body.style.overflow === 'hidden' ? window.innerWidth : window.innerWidth - gap),
        });
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        try {
            const release = lockScroll();
            expect(document.body.style.overflow).toBe('hidden');
            expect(Number.parseFloat(document.body.style.paddingRight)).toBe(gap);

            release();
            expect(document.body.style.paddingRight).toBe('');
        } finally {
            delete (document.documentElement as unknown as { clientWidth?: number }).clientWidth;
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
    });
});

describe('背景 inert 引用计数', () => {
    it('只影响作用域内兄弟节点，嵌套 modal 全部关闭后才移除', () => {
        const page = document.createElement('div');
        document.body.appendChild(page);

        const live = document.createElement('div');
        live.setAttribute('aria-live', 'polite');
        document.body.appendChild(live);

        const firstContainer = mountContainer();
        const first = makeHandle({
            kind: 'modal',
            container: firstContainer,
            inertBackground: true,
            onEscape: vi.fn(),
        });
        first.activate();

        expect(page.hasAttribute('inert')).toBe(true);
        expect(live.hasAttribute('inert')).toBe(false);
        expect(firstContainer.hasAttribute('inert')).toBe(false);

        const secondContainer = mountContainer();
        const second = makeHandle({
            kind: 'modal',
            container: secondContainer,
            inertBackground: true,
            onEscape: vi.fn(),
        });
        second.activate();
        expect(firstContainer.hasAttribute('inert')).toBe(false);

        first.deactivate();
        first.dispose();
        expect(page.hasAttribute('inert')).toBe(true);

        second.deactivate();
        second.dispose();
        expect(page.hasAttribute('inert')).toBe(false);
    });
});

describe('z-index 动态分配（C-OVL-16）', () => {
    it('按 FLOOR 起点递增，后开者永远在上', async () => {
        vi.resetModules();
        const mod = await import('../src/shared/floating/overlay-stack');

        const modalContainer = mountContainer();
        const dropdownContainer = mountContainer();
        const tooltipContainer = mountContainer();

        const modal = mod.registerOverlay({ kind: 'modal', container: modalContainer, onEscape: vi.fn() });
        const dropdown = mod.registerOverlay({
            kind: 'dropdown',
            container: dropdownContainer,
            onEscape: vi.fn(),
        });
        const tooltip = mod.registerOverlay({
            kind: 'tooltip',
            container: tooltipContainer,
            autoFocus: false,
            onEscape: vi.fn(),
        });

        modal.activate();
        dropdown.activate();
        tooltip.activate();

        expect(modal.getZIndex()).toBe(1050);
        expect(dropdown.getZIndex()).toBe(1060);
        expect(tooltip.getZIndex()).toBe(1070);
        expect(modalContainer.style.zIndex).toBe('1050');
        expect(modal.isTop()).toBe(false);
        expect(tooltip.isTop()).toBe(true);

        [tooltip, dropdown, modal].forEach(handle => {
            handle.deactivate();
            handle.dispose();
        });
    });

    it('deactivate 后重新 activate 会重新分配 z-index，后激活者在上', async () => {
        vi.resetModules();
        const mod = await import('../src/shared/floating/overlay-stack');

        const a = mod.registerOverlay({ kind: 'dropdown', container: mountContainer(), onEscape: vi.fn() });
        const b = mod.registerOverlay({ kind: 'dropdown', container: mountContainer(), onEscape: vi.fn() });

        a.activate();
        a.deactivate();

        b.activate();
        const bz = b.getZIndex();

        a.activate();
        expect(a.getZIndex()).toBeGreaterThan(bz);

        a.deactivate();
        b.deactivate();
        a.dispose();
        b.dispose();
    });

    it('CSS 变量可覆盖第一层的起点', async () => {
        document.documentElement.style.setProperty('--solely-z-index-modal', '4000');
        vi.resetModules();
        const mod = await import('../src/shared/floating/overlay-stack');

        const handle = mod.registerOverlay({ kind: 'modal', container: mountContainer(), onEscape: vi.fn() });
        handle.activate();

        expect(handle.getZIndex()).toBe(4000);

        handle.deactivate();
        handle.dispose();
        document.documentElement.style.removeProperty('--solely-z-index-modal');
    });
});

/** 焦点委托到 shadowRoot 内原生 input 的宿主，用于验证跨 shadow 的焦点判定 */
class FocusShadowHost extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.appendChild(document.createElement('input'));
    }

    focus(): void {
        (this.shadowRoot?.querySelector('input') as HTMLInputElement | null)?.focus();
    }
}

if (!customElements.get('test-focus-shadow-host')) {
    customElements.define('test-focus-shadow-host', FocusShadowHost);
}

describe('Shadow DOM 焦点（回归）', () => {
    it('层内 shadow 焦点不会被 Tab 陷阱误判为层外', () => {
        const container = mountContainer();
        const host = document.createElement('test-focus-shadow-host') as HTMLElement;
        container.appendChild(host);
        mountButton('after', container);

        const handle = makeHandle({ kind: 'modal', container, onEscape: vi.fn() });
        handle.activate();

        const input = host.shadowRoot!.querySelector('input') as HTMLInputElement;
        input.focus();
        expect(host.shadowRoot!.activeElement).toBe(input);

        const event = pressKey('Tab');
        // 焦点仍在层内：不应被拉回首个可聚焦项
        expect(event.defaultPrevented).toBe(false);
    });

    it('关闭时能把焦点从 shadow 内部正确还原到触发元素', () => {
        const trigger = mountButton('trigger');
        const container = mountContainer();
        const host = document.createElement('test-focus-shadow-host') as HTMLElement;
        container.appendChild(host);

        const handle = makeHandle({
            kind: 'modal',
            container,
            trigger,
            initialFocus: host,
            onEscape: vi.fn(),
        });
        handle.activate();

        // tryFocus 应穿透 shadow 判定聚焦成功，焦点落在内部 input
        const input = host.shadowRoot!.querySelector('input') as HTMLInputElement;
        expect(host.shadowRoot!.activeElement).toBe(input);

        handle.deactivate();
        handle.dispose();
        expect(document.activeElement).toBe(trigger);
    });
});
