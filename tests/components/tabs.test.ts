import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TabItem } from '../../src/components/elements/tabs/types';

import '../../src/components/elements/tabs';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

const SAMPLE: TabItem[] = [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
    { key: 'c', label: 'C' },
];

function createTabs(items: TabItem[], attrs: Record<string, string> = {}) {
    const el = document.createElement('solely-tabs') as any;
    el.setAttribute('items', JSON.stringify(items));
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el as any;
}

function keydown(target: Element, key: string) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
}

describe('solely-tabs', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should default to top position without extra class', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const root = el.shadowRoot.querySelector('.tabs');
        expect(root.classList.contains('tabs--pos-left')).toBe(false);
        expect(el.shadowRoot.querySelector('[role="tablist"]')).toBeTruthy();
    });

    it('should render position classes and vertical orientation for left/right', async () => {
        const el = createTabs(SAMPLE, { position: 'left' });
        await tick();
        expect(el.shadowRoot.querySelector('.tabs').classList.contains('tabs--pos-left')).toBe(true);
        expect(el.shadowRoot.querySelector('[role="tablist"]').getAttribute('aria-orientation')).toBe('vertical');

        el.setAttribute('position', 'right');
        await tick();
        expect(el.shadowRoot.querySelector('.tabs').classList.contains('tabs--pos-right')).toBe(true);

        el.setAttribute('position', 'bottom');
        await tick();
        expect(el.shadowRoot.querySelector('.tabs').classList.contains('tabs--pos-bottom')).toBe(true);
        expect(el.shadowRoot.querySelector('[role="tablist"]').getAttribute('aria-orientation')).toBe('horizontal');
    });

    it('should center nav when centered is set', async () => {
        const el = createTabs(SAMPLE, { centered: '' });
        await tick();
        expect(el.shadowRoot.querySelector('.tabs').classList.contains('tabs--centered')).toBe(true);
    });

    it('should move active tab with ArrowRight / ArrowLeft and wrap around', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const tabs = el.shadowRoot.querySelectorAll('.tabs__tab');

        keydown(tabs[0], 'ArrowRight');
        await tick();
        expect(el.activeKey).toBe('b');
        expect(el.shadowRoot.querySelectorAll('.tabs__tab')[1].getAttribute('aria-selected')).toBe('true');

        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[1], 'ArrowRight');
        await tick();
        expect(el.activeKey).toBe('c');

        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[2], 'ArrowRight');
        await tick();
        expect(el.activeKey).toBe('a');

        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[0], 'ArrowLeft');
        await tick();
        expect(el.activeKey).toBe('c');
    });

    it('should support Home / End and skip disabled tabs', async () => {
        const el = createTabs([
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', disabled: true },
            { key: 'c', label: 'C' },
            { key: 'd', label: 'D' },
        ]);
        await tick();

        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[2], 'Home');
        await tick();
        expect(el.activeKey).toBe('a');

        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[0], 'End');
        await tick();
        expect(el.activeKey).toBe('d');

        // 从 a 往右应跳过禁用的 b，直接到 c
        keydown(el.shadowRoot.querySelectorAll('.tabs__tab')[0], 'ArrowRight');
        await tick();
        expect(el.activeKey).toBe('c');
    });

    it('should activate tab with Enter and Space', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const tabs = el.shadowRoot.querySelectorAll('.tabs__tab');

        keydown(tabs[1], 'Enter');
        await tick();
        expect(el.activeKey).toBe('b');

        keydown(tabs[2], ' ');
        await tick();
        expect(el.activeKey).toBe('c');
    });

    it('should keep focus on the newly active tab (roving tabindex)', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const tabs = el.shadowRoot.querySelectorAll('.tabs__tab') as NodeListOf<HTMLElement>;

        tabs[0].focus();
        keydown(tabs[0], 'ArrowRight');
        await tick();
        expect(el.shadowRoot.activeElement?.dataset.key).toBe('b');
        // 仅激活项 tabindex=0
        expect(el.shadowRoot.querySelectorAll('.tabs__tab')[1].getAttribute('tabindex')).toBe('0');
        expect(el.shadowRoot.querySelectorAll('.tabs__tab')[0].getAttribute('tabindex')).toBe('-1');
    });

    it('should not dispatch change when activating the current tab again', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const listener = vi.fn();
        el.addEventListener('change', listener);

        el.shadowRoot
            .querySelectorAll('.tabs__tab')[0]
            .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(listener).not.toHaveBeenCalled();
    });

    it('should render icon, badge and custom label slot name', async () => {
        const el = createTabs([{ key: 'a', label: 'A', icon: '★', badge: '3' }]);
        await tick();
        expect(el.shadowRoot.querySelector('.tabs__tab-icon')?.textContent).toBe('★');
        expect(el.shadowRoot.querySelector('.tabs__tab-badge')?.textContent).toBe('3');

        const el2 = createTabs(SAMPLE);
        await tick();
        const slots = [...el2.shadowRoot.querySelectorAll('slot')].map((s: any) => s.getAttribute('name'));
        expect(slots).toContain('tab-label-a');
        expect(slots).toContain('tab-a');
    });

    it('should lazily mount pane slots only after first activation', async () => {
        const el = createTabs(SAMPLE, { lazy: '' });
        await tick();
        const names = () =>
            [...el.shadowRoot.querySelectorAll('.tabs__pane slot')].map((s: any) => s.getAttribute('name'));

        expect(names()).toEqual(['tab-a']);
        el.activeKey = 'b';
        await tick();
        expect(names()).toEqual(['tab-a', 'tab-b']);
    });

    it('lazy 模式下由 attribute 指定 active-key 时首个面板必须渲染', async () => {
        const el = createTabs(SAMPLE, { lazy: '', 'active-key': 'b' });
        await tick();

        const names = () =>
            [...el.shadowRoot.querySelectorAll('.tabs__pane slot')].map((s: any) => s.getAttribute('name'));
        expect(names()).toContain('tab-b');
    });

    it('lazy 模式下挂载后通过 attribute 切换 active-key 时目标面板必须渲染', async () => {
        const el = createTabs(SAMPLE, { lazy: '' });
        await tick();
        expect(el.activeKey).toBe('a');

        el.setAttribute('active-key', 'c');
        await tick();

        const names = () =>
            [...el.shadowRoot.querySelectorAll('.tabs__pane slot')].map((s: any) => s.getAttribute('name'));
        expect(names()).toContain('tab-c');
    });

    it('should link tab and tabpanel with ids for accessibility', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        const tab = el.shadowRoot.querySelector('.tabs__tab');
        const pane = el.shadowRoot.querySelector('.tabs__pane');
        expect(tab.getAttribute('id')).toBe('tab-a');
        expect(tab.getAttribute('aria-controls')).toBe('panel-a');
        expect(pane.getAttribute('id')).toBe('panel-a');
        expect(pane.getAttribute('aria-labelledby')).toBe('tab-a');
    });

    it('should close tab with Enter on close button', async () => {
        const el = createTabs(SAMPLE, { closable: '' });
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tabs__tab').length).toBe(3);

        keydown(el.shadowRoot.querySelector('.tabs__tab:nth-child(2) .tabs__close'), 'Enter');
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tabs__tab').length).toBe(2);
    });

    it('should add tab with Enter on add button', async () => {
        const el = createTabs(SAMPLE, { addable: '' });
        await tick();
        keydown(el.shadowRoot.querySelector('.tabs__add'), 'Enter');
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tabs__tab').length).toBe(4);
    });

    it('setItems 时当前项变为 disabled 会回退到首个可用项', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        el.activeKey = 'b';
        await tick();

        el.setItems([
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', disabled: true },
            { key: 'c', label: 'C' },
        ]);
        await tick();

        expect(el.activeKey).toBe('a');
    });

    it('setItems 回退激活项时派发一次 change，未回退时保持静默', async () => {
        const el = createTabs(SAMPLE);
        await tick();
        el.activeKey = 'b';
        await tick();

        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        // 当前项变为 disabled → 回退到 a，与点击 / 关闭路径一样派发 change
        el.setItems([
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', disabled: true },
            { key: 'c', label: 'C' },
        ]);
        await tick();
        expect(el.activeKey).toBe('a');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].detail).toEqual({ activeKey: 'a' });

        // 新列表仍包含当前激活项：不切换、不派发
        onChange.mockClear();
        el.setItems([
            { key: 'a', label: 'A' },
            { key: 'c', label: 'C' },
        ]);
        await tick();
        expect(el.activeKey).toBe('a');
        expect(onChange).not.toHaveBeenCalled();
    });
});
