/**
 * Tooltip 组件测试
 * - 命令式 Tooltip：重复 bind 复用实例、显隐与销毁
 * - 声明式 <solely-tooltip>：role="tooltip"、aria-describedby 关联、多子元素事件解绑
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import Tooltip from '../../src/components/commands/tooltip';
import '../../src/components/elements/tooltip';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

describe('Tooltip command component', () => {
    afterEach(() => {
        Tooltip.destroy();
        document.body.innerHTML = '';
    });

    it('should reuse the existing instance when binding the same target twice', () => {
        const target = document.createElement('button');
        document.body.appendChild(target);

        const first = Tooltip.bind(target, { content: '第一份提示', trigger: 'click' });
        const second = Tooltip.bind(target, { content: '第二份提示', trigger: 'click' });

        expect(second).toBe(first);

        // destroy 后允许重新绑定并获得新实例
        first.destroy();
        const third = Tooltip.bind(target, { content: '重新绑定', trigger: 'click' });
        expect(third).not.toBe(first);
    });

    it('should show and hide a bound tooltip', () => {
        const target = document.createElement('button');
        document.body.appendChild(target);

        const instance = Tooltip.bind(target, { content: '提示内容', trigger: 'click' });
        instance.show();

        const tooltip = document.querySelector('.solely-tooltip') as HTMLElement;
        expect(tooltip).not.toBeNull();
        expect(tooltip.textContent).toContain('提示内容');

        instance.hide();
        expect(document.querySelector('.solely-tooltip')).toBeNull();
    });

    it('API 重建同目标 tooltip 时会复位原 bind 状态', () => {
        const target = document.createElement('button');
        document.body.appendChild(target);

        const instance = Tooltip.bind(target, { content: '绑定提示', trigger: 'click' });
        instance.show();
        expect(document.querySelector('.solely-tooltip')!.textContent).toContain('绑定提示');

        // 同目标重建：旧 bind 的 visible / currentTooltipId 必须复位
        Tooltip.show(target, { content: 'API 提示', duration: 0 });
        expect(document.querySelector('.solely-tooltip')!.textContent).toContain('API 提示');

        instance.show();
        expect(document.querySelector('.solely-tooltip')!.textContent).toContain('绑定提示');
        instance.hide();
    });

    it('should close on Escape without consuming the event', async () => {
        const target = document.createElement('button');
        document.body.appendChild(target);

        const instance = Tooltip.bind(target, { content: '提示内容', trigger: 'click' });
        instance.show();
        await tick();

        const tooltip = document.querySelector('.solely-tooltip') as HTMLElement;
        expect(tooltip.getAttribute('aria-hidden')).toBe('false');

        const bodyKeydown = vi.fn();
        document.body.addEventListener('keydown', bodyKeydown);
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        await tick();

        // tooltip 关闭，但不消费 Esc：不阻止默认行为、不阻断冒泡
        expect(document.querySelector('.solely-tooltip')).toBeNull();
        expect(event.defaultPrevented).toBe(false);
        expect(bodyKeydown).toHaveBeenCalledTimes(1);
        document.body.removeEventListener('keydown', bodyKeydown);

        // 关闭后 bind 状态同步复位，可再次显示
        instance.show();
        expect(document.querySelector('.solely-tooltip')).not.toBeNull();
        instance.hide();
    });

    it('命令式 tooltip 的目标位于 shadow root 时，aria-describedby 在目标树内可解析', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const target = document.createElement('button');
        root.appendChild(target);

        const instance = Tooltip.bind(target, { content: '跨树提示', trigger: 'click' });
        instance.show();

        const describedBy = target.getAttribute('aria-describedby') as string;
        expect(describedBy).toBeTruthy();
        // IDREF 必须在 target 所在的 shadow root 内可解析
        const proxy = root.querySelector(`#${describedBy}`) as HTMLElement;
        expect(proxy).not.toBeNull();
        expect(proxy.getAttribute('role')).toBe('tooltip');
        expect(proxy.textContent).toContain('跨树提示');

        instance.hide();
        expect(target.hasAttribute('aria-describedby')).toBe(false);
        expect(root.querySelector(`#${describedBy}`)).toBeNull();
    });
});

describe('solely-tooltip element', () => {
    const mounted: HTMLElement[] = [];

    function createTooltip(attrs: Record<string, string>, children: HTMLElement[]): any {
        const el = document.createElement('solely-tooltip') as any;
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, v);
        }
        children.forEach(child => el.appendChild(child));
        document.body.appendChild(el);
        mounted.push(el);
        return el;
    }

    afterEach(() => {
        mounted.forEach(el => el.remove());
        mounted.length = 0;
        document.body.innerHTML = '';
    });

    it('should render role="tooltip" and append aria-describedby while visible', async () => {
        const button = document.createElement('button');
        button.textContent = '聚焦';
        button.setAttribute('aria-describedby', 'existing-id');
        const el = createTooltip({ content: '提示内容', trigger: 'focus' }, [button]);
        await tick();

        button.focus();
        await tick();

        const tooltip = el.shadowRoot.querySelector('.tooltip') as HTMLElement;
        expect(tooltip).not.toBeNull();
        expect(tooltip.getAttribute('role')).toBe('tooltip');
        // 视觉节点不承载 id，避免与 light DOM 代理重复
        expect(tooltip.hasAttribute('id')).toBe(false);
        // 可见时不再对读屏隐藏
        expect(tooltip.getAttribute('aria-hidden')).toBe('false');

        // 保留用户原有描述并追加 tooltip id
        const describedBy = button.getAttribute('aria-describedby') as string;
        expect(describedBy.split(/\s+/)).toEqual(['existing-id', el.getTooltipId()]);

        // light DOM 代理节点可被 document.getElementById 解析（可跨 shadow 的 IDREF 载体）
        const proxy = document.getElementById(el.getTooltipId());
        expect(proxy).not.toBeNull();
        expect(proxy!.getAttribute('role')).toBe('tooltip');
        expect(proxy!.textContent).toBe('提示内容');

        button.blur();
        await tick();

        // 隐藏后精确还原原有的 aria-describedby，并移除代理节点
        expect(button.getAttribute('aria-describedby')).toBe('existing-id');
        expect(document.getElementById(el.getTooltipId())).toBeNull();
    });

    it('should render structured content via slot="content" and flatten it for aria', async () => {
        const button = document.createElement('button');
        const rich = document.createElement('span');
        rich.setAttribute('slot', 'content');
        rich.innerHTML = '<strong>粗体</strong> 说明';

        const el = createTooltip({ trigger: 'focus' }, [rich, button]);
        await tick();

        button.focus();
        await tick();

        const slot = el.shadowRoot.querySelector('slot[name="content"]') as HTMLSlotElement;
        expect(slot).not.toBeNull();
        expect(slot.assignedElements()).toContain(rich);

        // aria-describedby 只承载文本：结构化内容按 textContent 扁平化
        const proxy = document.getElementById(el.getTooltipId());
        expect(proxy).not.toBeNull();
        expect(proxy!.textContent).toBe('粗体 说明');

        // 内容插槽节点不参与触发器事件绑定
        expect(rich.hasAttribute('aria-describedby')).toBe(false);
        expect(button.getAttribute('aria-describedby')).toBe(el.getTooltipId());
    });

    it('hover 触发模式可被键盘 focus 唤起，并在失焦后关闭', async () => {
        const button = document.createElement('button');
        const el = createTooltip({ content: '悬停提示', trigger: 'hover' }, [button]);
        await tick();

        button.focus();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).not.toBeNull();
        expect(button.getAttribute('aria-describedby')).toBe(el.getTooltipId());

        button.blur();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).toBeNull();
        expect(button.hasAttribute('aria-describedby')).toBe(false);
    });

    it('should close on Escape without consuming the event and restore aria-describedby', async () => {
        const button = document.createElement('button');
        const el = createTooltip({ content: '提示内容', trigger: 'focus' }, [button]);
        await tick();

        button.focus();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).not.toBeNull();

        const bodyKeydown = vi.fn();
        document.body.addEventListener('keydown', bodyKeydown);
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        await tick();

        // 只关闭自身，不消费 Esc
        expect(el.shadowRoot.querySelector('.tooltip')).toBeNull();
        expect(button.hasAttribute('aria-describedby')).toBe(false);
        expect(event.defaultPrevented).toBe(false);
        expect(bodyKeydown).toHaveBeenCalledTimes(1);
        document.body.removeEventListener('keydown', bodyKeydown);
    });

    it('should bind focus/blur for every child element and unbind all of them', async () => {
        const first = document.createElement('button');
        const second = document.createElement('button');
        const el = createTooltip({ content: '提示内容', trigger: 'focus' }, [first, second]);
        await tick();

        first.focus();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).not.toBeNull();
        expect(first.getAttribute('aria-describedby')).toBe(el.getTooltipId());
        first.blur();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).toBeNull();
        expect(first.hasAttribute('aria-describedby')).toBe(false);

        second.focus();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).not.toBeNull();
        expect(second.getAttribute('aria-describedby')).toBe(el.getTooltipId());
        second.blur();
        await tick();
        expect(el.shadowRoot.querySelector('.tooltip')).toBeNull();
        expect(second.hasAttribute('aria-describedby')).toBe(false);
    });
});
