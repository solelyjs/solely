/**
 * F-1 收尾回归测试（pagination / tabs / steps）
 *
 * 覆盖三条框架写入路径在挂载期都不派发业务事件：
 * - 无属性挂载（框架写默认值）
 * - 带属性挂载（attribute → state）
 * - 属性升级（元素定义前已有的自有属性）
 *
 * 同时锁定挂载后交互/显式赋值仍照常派发，且 detail 不变。
 */
import { describe, it, expect, beforeEach } from 'vitest';

import '../../src/components/elements/pagination';
import '../../src/components/elements/tabs';
import '../../src/components/elements/steps';
import { defineOwnProperty, recordEvents, tick } from '../helpers';

/** 保留原位调用写法，事件录制实现收敛到 tests/helpers */
const collect = (el: EventTarget, types: string[]): CustomEvent[] => recordEvents<CustomEvent>(el, types).events;

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('pagination 挂载期不派发业务事件', () => {
    const businessTypes = ['change', 'input', 'size-change', 'show-size-change'];

    it('无属性挂载：默认值写入保持静默', async () => {
        const el = document.createElement('solely-pagination') as any;
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.current).toBe(1);
        expect(el.pageSize).toBe(10);
    });

    it('带属性挂载：attribute → state 保持静默', async () => {
        const el = document.createElement('solely-pagination') as any;
        el.setAttribute('total', '50');
        el.setAttribute('current', '3');
        el.setAttribute('page-size', '20');
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.total).toBe(50);
        expect(el.current).toBe(3);
        expect(el.pageSize).toBe(20);
    });

    it('属性升级：挂载前已有的自有属性保持静默', async () => {
        const el = document.createElement('solely-pagination') as any;
        // size / disabled 没有自定义 setter，可验证升级写入确实生效
        defineOwnProperty(el, 'size', 'large');
        defineOwnProperty(el, 'disabled', true);
        // total 有自定义 setter：只断言不派发事件
        defineOwnProperty(el, 'total', 100);
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.size).toBe('large');
        expect(el.disabled).toBe(true);
    });

    it('挂载后 setAttribute 同步仍保持静默', async () => {
        const el = document.createElement('solely-pagination') as any;
        document.body.appendChild(el);
        await tick();

        const events = collect(el, businessTypes);
        el.setAttribute('total', '50');
        el.setAttribute('current', '3');
        el.setAttribute('page-size', '20');
        await tick();

        expect(events.length).toBe(0);
        expect(el.current).toBe(3);
        expect(el.pageSize).toBe(20);
    });

    it('挂载后显式赋值与交互照常派发，detail 不变', async () => {
        const el = document.createElement('solely-pagination') as any;
        el.setAttribute('total', '50');
        document.body.appendChild(el);
        await tick();

        const events = collect(el, ['change']);

        el.current = 2;
        await tick();
        expect(events.length).toBe(1);
        expect(events[0].detail).toEqual({ current: 2, pageSize: 10 });

        const pages = Array.from(el.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        pages[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(events.length).toBe(2);
        expect(events[1].detail).toEqual({ current: 3, pageSize: 10 });
    });
});

describe('tabs 挂载期不派发业务事件', () => {
    const items = JSON.stringify([
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
    ]);
    const businessTypes = ['change', 'input', 'close', 'add'];

    it('无属性挂载：默认值写入保持静默', async () => {
        const el = document.createElement('solely-tabs') as any;
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.activeKey).toBe('');
    });

    it('带属性挂载：attribute → state 与默认选中首项保持静默', async () => {
        const el = document.createElement('solely-tabs') as any;
        el.setAttribute('items', items);
        el.setAttribute('active-key', 'b');
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.activeKey).toBe('b');
    });

    it('属性升级：挂载前已有的自有属性保持静默', async () => {
        const el = document.createElement('solely-tabs') as any;
        // items 没有自定义 setter，可验证升级写入确实生效
        defineOwnProperty(el, 'items', items);
        // activeKey 有自定义 setter：只断言不派发事件
        defineOwnProperty(el, 'activeKey', 'b');
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.getParsedItems().length).toBe(2);
    });

    it('挂载后 setAttribute 同步仍保持静默', async () => {
        const el = document.createElement('solely-tabs') as any;
        el.setAttribute('items', items);
        document.body.appendChild(el);
        await tick();

        const events = collect(el, businessTypes);
        el.setAttribute('active-key', 'b');
        await tick();

        expect(events.length).toBe(0);
        expect(el.activeKey).toBe('b');
    });

    it('挂载后显式赋值与点击照常派发，detail 不变', async () => {
        const el = document.createElement('solely-tabs') as any;
        el.setAttribute('items', items);
        document.body.appendChild(el);
        await tick();

        const events = collect(el, ['change']);

        el.activeKey = 'b';
        await tick();
        expect(events.length).toBe(1);
        expect(events[0].detail).toEqual({ activeKey: 'b' });

        const tabA = Array.from(el.shadowRoot.querySelectorAll('.tabs__tab')).find((t: any) =>
            t.textContent.trim().startsWith('A'),
        ) as HTMLElement;
        tabA.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(events.length).toBe(2);
        expect(events[1].detail).toEqual({ activeKey: 'a' });
    });
});

describe('steps 挂载期不派发业务事件', () => {
    const items = JSON.stringify([{ title: '步骤一' }, { title: '步骤二' }, { title: '步骤三' }]);
    const businessTypes = ['change', 'input'];

    it('无属性挂载：默认值写入保持静默', async () => {
        const el = document.createElement('solely-steps') as any;
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.current).toBe(0);
    });

    it('带属性挂载：attribute → state 保持静默', async () => {
        const el = document.createElement('solely-steps') as any;
        el.setAttribute('items', items);
        el.setAttribute('current', '1');
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.current).toBe(1);
    });

    it('属性升级：挂载前已有的自有属性保持静默', async () => {
        const el = document.createElement('solely-steps') as any;
        // items 没有自定义 setter，可验证升级写入确实生效
        defineOwnProperty(el, 'items', items);
        // current 有自定义 setter：只断言不派发事件
        defineOwnProperty(el, 'current', 2);
        const events = collect(el, businessTypes);
        document.body.appendChild(el);
        await tick();

        expect(events.length).toBe(0);
        expect(el.getParsedItems().length).toBe(3);
    });

    it('挂载后 setAttribute 同步仍保持静默', async () => {
        const el = document.createElement('solely-steps') as any;
        el.setAttribute('items', items);
        document.body.appendChild(el);
        await tick();

        const events = collect(el, businessTypes);
        el.setAttribute('current', '2');
        await tick();

        expect(events.length).toBe(0);
        expect(el.current).toBe(2);
    });

    it('挂载后点击步骤照常派发，detail 不变', async () => {
        const el = document.createElement('solely-steps') as any;
        el.setAttribute('items', items);
        el.setAttribute('clickable', '');
        document.body.appendChild(el);
        await tick();

        const events = collect(el, ['change']);
        const steps = Array.from(el.shadowRoot.querySelectorAll('.step')) as HTMLElement[];
        steps[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(events.length).toBe(1);
        expect(events[0].detail).toMatchObject({ index: 1, item: { title: '步骤二' } });
        expect(el.current).toBe(1);
    });

    it('挂载后显式赋值照常派发，同值赋值不重复派发', async () => {
        const el = document.createElement('solely-steps') as any;
        el.setAttribute('items', items);
        document.body.appendChild(el);
        await tick();

        const events = collect(el, ['change']);

        el.current = 2;
        await tick();
        expect(events.length).toBe(1);
        // detail 统一为 { current, index, item }，current 仍然是不变量
        expect(events[0].detail).toMatchObject({ current: 2 });

        el.current = 2;
        await tick();
        expect(events.length).toBe(1);
    });
});
