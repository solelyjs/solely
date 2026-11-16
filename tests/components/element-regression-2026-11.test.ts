/**
 * 元素组件回归测试（2026-11）
 *
 * 覆盖：
 * - input 挂载/attribute 同步静默，显式赋值与 setValue 才派发 change
 * - input 新旧属性名（show-password/showpassword 等）任一存在即生效
 * - radio 支持 property 分组、attribute/property 混用
 * - radio 仅在 form / radiogroup / 根节点分组边界内互斥
 * - alert auto-close 动态变化后重新排期或取消
 * - alert 关闭动画期间移动节点后能完成移除，不永久停留在 closing
 * - divider 忽略 <template>、空元素和纯空白文本
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/input';
import '../../src/components/elements/radio';
import '../../src/components/elements/alert';
import '../../src/components/elements/divider';

const tick = (ms = 20) => new Promise<void>(r => setTimeout(r, ms));

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('solely-input 挂载静默', () => {
    it('无 value 属性时挂载不派发 change', async () => {
        const el = document.createElement('solely-input') as any;
        const onChange = vi.fn();
        el.addEventListener('change', onChange);
        document.body.appendChild(el);
        await tick();

        expect(onChange).not.toHaveBeenCalled();
        expect(el.getValue()).toBe('');
    });

    it('挂载前设置 value 属性不派发 change，且值正确', async () => {
        const el = document.createElement('solely-input') as any;
        const onChange = vi.fn();
        el.addEventListener('change', onChange);
        el.setAttribute('value', 'abc');
        document.body.appendChild(el);
        await tick();

        expect(onChange).not.toHaveBeenCalled();
        expect(el.getValue()).toBe('abc');
    });

    it('挂载后 setAttribute(value) 同步不派发 change', async () => {
        const el = document.createElement('solely-input') as any;
        document.body.appendChild(el);
        await tick();

        const onChange = vi.fn();
        el.addEventListener('change', onChange);
        el.setAttribute('value', 'runtime');
        await tick();

        expect(onChange).not.toHaveBeenCalled();
        expect(el.getValue()).toBe('runtime');
    });

    it('property 赋值静默，setValue 派发 change，silent 可关闭（契约 D3）', async () => {
        const el = document.createElement('solely-input') as any;
        document.body.appendChild(el);
        await tick();

        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        el.value = 'a';
        expect(onChange).not.toHaveBeenCalled();
        expect(el.getValue()).toBe('a');

        el.setValue('b');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(el.getValue()).toBe('b');

        el.setValue('c', true);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(el.getValue()).toBe('c');
    });
});

describe('solely-input 新旧属性名并存', () => {
    async function mountWithAttrs(attrs: Record<string, string>): Promise<any> {
        const el = document.createElement('solely-input') as any;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        document.body.appendChild(el);
        await tick();
        return el;
    }

    it('show-password / showpassword 移除任意一个仍为 true，全部移除才为 false', async () => {
        const el = await mountWithAttrs({ 'show-password': '', showpassword: '' });
        expect(el.showPassword).toBe(true);

        el.removeAttribute('show-password');
        await tick();
        expect(el.showPassword).toBe(true);

        el.removeAttribute('showpassword');
        await tick();
        expect(el.showPassword).toBe(false);
    });

    it('show-count / showcount 与 select-all / selectall 遵循同样规则', async () => {
        const el = await mountWithAttrs({
            'show-count': '',
            showcount: '',
            'select-all': '',
            selectall: '',
        });

        expect(el.showCount).toBe(true);
        expect(el.selectAll).toBe(true);

        el.removeAttribute('show-count');
        el.removeAttribute('select-all');
        await tick();
        expect(el.showCount).toBe(true);
        expect(el.selectAll).toBe(true);

        el.removeAttribute('showcount');
        el.removeAttribute('selectall');
        await tick();
        expect(el.showCount).toBe(false);
        expect(el.selectAll).toBe(false);
    });
});

describe('solely-radio 分组', () => {
    it('仅通过 property 设置 name 时也能互斥', async () => {
        const first = document.createElement('solely-radio') as any;
        first.name = 'prop-group';
        first.checked = true;

        const second = document.createElement('solely-radio') as any;
        second.name = 'prop-group';
        second.checked = true;

        document.body.appendChild(first);
        document.body.appendChild(second);
        await tick();

        expect(first.checked).toBe(false);
        expect(second.checked).toBe(true);
    });

    it('attribute 与 property 混用时能互相识别', async () => {
        const first = document.createElement('solely-radio') as any;
        first.setAttribute('name', 'mixed-group');
        first.checked = true;
        document.body.appendChild(first);
        await tick();

        const second = document.createElement('solely-radio') as any;
        second.name = 'mixed-group';
        document.body.appendChild(second);
        await tick();

        second.shadowRoot.querySelector('.radio').click();
        await tick();

        expect(second.checked).toBe(true);
        expect(first.checked).toBe(false);
    });

    it('两个独立 <form> 内同名 radio 不跨容器互斥', async () => {
        const formA = document.createElement('form');
        const a = document.createElement('solely-radio') as any;
        a.setAttribute('name', 'cross-form');
        a.setAttribute('checked', '');
        formA.appendChild(a);
        document.body.appendChild(formA);

        const formB = document.createElement('form');
        const b = document.createElement('solely-radio') as any;
        b.setAttribute('name', 'cross-form');
        b.setAttribute('checked', '');
        formB.appendChild(b);
        document.body.appendChild(formB);
        await tick();

        expect(a.checked).toBe(true);
        expect(b.checked).toBe(true);

        // 点击 B 只影响 B 所在表单分组
        b.shadowRoot.querySelector('.radio').click();
        await tick();
        expect(a.checked).toBe(true);
        expect(b.checked).toBe(true);
    });

    it('两个独立 role=radiogroup 容器内同名 radio 不跨容器互斥', async () => {
        const groupA = document.createElement('div');
        groupA.setAttribute('role', 'radiogroup');
        const a = document.createElement('solely-radio') as any;
        a.setAttribute('name', 'cross-group');
        a.setAttribute('checked', '');
        groupA.appendChild(a);
        document.body.appendChild(groupA);

        const groupB = document.createElement('div');
        groupB.setAttribute('role', 'radiogroup');
        const b = document.createElement('solely-radio') as any;
        b.setAttribute('name', 'cross-group');
        b.setAttribute('checked', '');
        groupB.appendChild(b);
        document.body.appendChild(groupB);
        await tick();

        expect(a.checked).toBe(true);
        expect(b.checked).toBe(true);
    });

    it('同一 form 内同名 radio 仍然互斥', async () => {
        const form = document.createElement('form');
        const a = document.createElement('solely-radio') as any;
        a.setAttribute('name', 'same-form');
        a.setAttribute('checked', '');
        form.appendChild(a);

        const b = document.createElement('solely-radio') as any;
        b.setAttribute('name', 'same-form');
        form.appendChild(b);
        document.body.appendChild(form);
        await tick();

        b.shadowRoot.querySelector('.radio').click();
        await tick();

        expect(b.checked).toBe(true);
        expect(a.checked).toBe(false);
    });
});

describe('solely-alert auto-close 生命周期', () => {
    function mountAlert(attrs: Record<string, string> = {}): any {
        const el = document.createElement('solely-alert') as any;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        document.body.appendChild(el);
        return el;
    }

    it('挂载后新增 auto-close 会开始倒计时', async () => {
        const el = mountAlert();
        await tick();
        expect(el.isConnected).toBe(true);

        el.setAttribute('auto-close', '20');
        // 自动关闭延时 + 300ms 关闭动画
        await tick(400);

        expect(el.isConnected).toBe(false);
    });

    it('挂载后修改 auto-close 会按新值重新排期', async () => {
        const el = mountAlert({ 'auto-close': '2000' });
        await tick();

        el.setAttribute('auto-close', '20');
        await tick(400);

        expect(el.isConnected).toBe(false);
    });

    it('改为 0 或移除 auto-close 会取消定时器', async () => {
        const el = mountAlert({ 'auto-close': '20' });
        await tick(5);

        el.removeAttribute('auto-close');
        await tick(80);

        expect(el.isConnected).toBe(true);
    });

    it('preventDefault 阻止自动关闭后不残留定时器', async () => {
        const el = mountAlert({ 'auto-close': '10' });
        const prevent = (e: Event) => e.preventDefault();
        el.addEventListener('close', prevent);

        await tick(40);
        expect(el.isConnected).toBe(true);

        // 移除拦截后继续等待，若存在残留定时器会再次触发并移除节点
        el.removeEventListener('close', prevent);
        await tick(200);

        expect(el.isConnected).toBe(true);
        expect(el.$data.closing).toBeFalsy();
    });

    it('关闭动画期间移动节点仍能完成移除', async () => {
        const el = mountAlert({ message: 'hello', closable: '' });
        await tick();

        el.shadowRoot.querySelector('.alert__close').click();
        expect(el.$data.closing).toBe(true);

        // 动画期间（300ms 内）移动节点，触发 disconnect → reconnect
        await tick(100);
        const holder = document.createElement('div');
        document.body.appendChild(holder);
        holder.appendChild(el);
        await tick();

        // 重新挂载后不能永久停留在 closing
        await tick(400);
        expect(el.isConnected).toBe(false);
    });
});

describe('solely-divider 内容判定', () => {
    async function mountDivider(...nodes: Node[]): Promise<any> {
        const el = document.createElement('solely-divider');
        for (const node of nodes) el.appendChild(node);
        document.body.appendChild(el);
        await tick();
        return el;
    }

    it('<template> 不算内容', async () => {
        const template = document.createElement('template');
        template.innerHTML = '<span>hidden</span>';
        const el = await mountDivider(template);
        expect(el.shadowRoot.querySelector('.divider__content')).toBeNull();
    });

    it('空元素与纯空白文本不算内容', async () => {
        const emptySpan = document.createElement('span');
        const whitespaceSpan = document.createElement('span');
        whitespaceSpan.textContent = '   ';
        const el = await mountDivider(emptySpan, whitespaceSpan, document.createTextNode('\n  '));
        expect(el.shadowRoot.querySelector('.divider__content')).toBeNull();
    });

    it('非空白文本或含文本的元素算内容', async () => {
        const span = document.createElement('span');
        span.textContent = '标题';
        const el = await mountDivider(span);
        expect(el.shadowRoot.querySelector('.divider__content')).not.toBeNull();
    });
});
