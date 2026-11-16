/**
 * 事件契约修复回归测试
 *
 * 覆盖：
 * - pagination / tabs 挂载初始化不派发 change
 * - pagination 页码键盘可访问 + 换页大小派发 change/size-change
 * - tabs 属性赋值与点击统一为带 detail 的 CustomEvent
 * - table 行点击只派发一次 row-click，原生 click 只冒泡一次
 * - upload 一次选择只派发一次 change，clear() 回收 objectURL 并派发 change
 * - timeline reverse 对数组属性同样生效
 * - breadcrumb 新增 item-click 事件（覆盖 href 项），旧自定义 click 改名为 legacy-click
 * - pagination total/pageSize 变化后夹取 current，字符串赋值归一化
 * - pagination disabled 态可访问性与跳页输入 Enter 阻止默认行为
 * - pagination / tabs 值未变化时不重复派发
 * - tabs add / close 路径同样派发 change
 * - upload 空列表/离线 clear 静默、fileList 同步、maxCount=0 生效
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/pagination';
import '../../src/components/elements/tabs';
import '../../src/components/elements/table';
import '../../src/components/elements/upload';
import '../../src/components/elements/timeline';
import '../../src/components/elements/breadcrumb';
import { mount as mountElement, recordEvents, tick } from '../helpers';

/** 本文件断言大量组件私有 API，保留 any 返回类型；挂载实现收敛到 tests/helpers */
const mount = (tag: string, attrs: Record<string, string> = {}): any => mountElement(tag, attrs);

/** 保留原位调用写法，事件录制实现收敛到 tests/helpers */
const collect = (el: EventTarget, type: string): CustomEvent[] => recordEvents<CustomEvent>(el, [type]).events;

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('挂载初始化不派发 change', () => {
    it('pagination 挂载后未操作时 change 次数为 0', async () => {
        const el = document.createElement('solely-pagination') as any;
        const events = collect(el, 'change');
        document.body.appendChild(el);
        await tick();
        expect(events.length).toBe(0);
        expect(el.current).toBe(1);
        expect(el.pageSize).toBe(10);
    });

    it('tabs 挂载后未操作时 change 次数为 0，且默认选中第一项', async () => {
        const el = document.createElement('solely-tabs') as any;
        el.setAttribute(
            'items',
            JSON.stringify([
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B' },
            ]),
        );
        const events = collect(el, 'change');
        document.body.appendChild(el);
        await tick();
        expect(events.length).toBe(0);
        expect(el.activeKey).toBe('a');
    });

    it('pagination 挂载后外部赋值 current 才派发 change', async () => {
        const el = mount('solely-pagination', { total: '50' });
        const events = collect(el, 'change');
        el.current = 2;
        await tick();
        expect(events.length).toBe(1);
        expect(events[0].detail).toEqual({ current: 2, pageSize: 10 });
    });
});

describe('pagination 键盘与换页大小', () => {
    it('页码可聚焦、带 role/aria，并可键盘换页', async () => {
        const el = mount('solely-pagination', { total: '50' });
        await tick();
        const pages = Array.from(el.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        expect(pages.length).toBe(5);
        for (const page of pages) {
            expect(page.tabIndex).toBe(0);
            expect(page.getAttribute('role')).toBe('button');
            expect(page.getAttribute('aria-label')).toContain('页');
        }
        expect(pages[0].getAttribute('aria-current')).toBe('page');
        // 非当前页不再输出 aria-current="false"
        expect(pages[1].hasAttribute('aria-current')).toBe(false);

        // 第一页时「上一页」不可聚焦，与 aria-disabled 保持一致
        const prev = el.shadowRoot.querySelector('.pagination__prev') as HTMLElement;
        expect(prev.getAttribute('aria-disabled')).toBe('true');
        expect(prev.getAttribute('tabindex')).toBe('-1');

        const events = collect(el, 'change');
        pages[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        await tick();
        expect(el.current).toBe(2);
        expect(events.length).toBe(1);
        expect(events[0].detail).toEqual({ current: 2, pageSize: 10 });
    });

    it('上下页按钮支持 Enter 键', async () => {
        const el = mount('solely-pagination', { total: '50' });
        await tick();
        const next = el.shadowRoot.querySelector('.pagination__next') as HTMLElement;
        expect(next.tabIndex).toBe(0);
        next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        await tick();
        expect(el.current).toBe(2);
    });

    it('最后一页时「下一页」不可聚焦', async () => {
        const el = mount('solely-pagination', { total: '50', current: '5' });
        await tick();
        const next = el.shadowRoot.querySelector('.pagination__next') as HTMLElement;
        expect(next.getAttribute('aria-disabled')).toBe('true');
        expect(next.getAttribute('tabindex')).toBe('-1');
    });

    it('current 越界时高亮页与展示页一致', async () => {
        const el = mount('solely-pagination', { total: '50', current: '9' });
        await tick();

        const active = el.shadowRoot.querySelector('.pagination__item--active') as HTMLElement;
        expect(active).not.toBeNull();
        // 有效页被钳制到最后一页（50 / 10 = 5），高亮与 aria-current 必须跟随同一值
        expect(active.textContent).toBe('5');
        expect(active.getAttribute('aria-current')).toBe('page');
        expect(el.shadowRoot.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    });

    it('每页条数改变时 change / size-change / show-size-change 各一次', async () => {
        const el = mount('solely-pagination', {
            total: '100',
            'show-size-changer': '',
        });
        await tick();
        const change = collect(el, 'change');
        const sizeChange = collect(el, 'size-change');
        const showSizeChange = collect(el, 'show-size-change');

        const select = el.shadowRoot.querySelector('select') as HTMLSelectElement;
        select.value = '20';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(el.pageSize).toBe(20);
        expect(el.current).toBe(1);
        expect(change.length).toBe(1);
        expect(sizeChange.length).toBe(1);
        expect(showSizeChange.length).toBe(1);
        expect(change[0].detail).toEqual({ current: 1, pageSize: 20 });
        expect(sizeChange[0].detail).toEqual(change[0].detail);
        expect(showSizeChange[0].detail).toEqual(change[0].detail);
    });
});

describe('tabs change payload 统一', () => {
    it('属性赋值与点击都派发 CustomEvent，detail 为 { activeKey }', async () => {
        const el = mount('solely-tabs', {
            items: JSON.stringify([
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B' },
            ]),
        });
        await tick();
        const events = collect(el, 'change');

        el.activeKey = 'b';
        await tick();
        expect(events.length).toBe(1);
        expect(events[0]).toBeInstanceOf(CustomEvent);
        expect(events[0].detail).toEqual({ activeKey: 'b' });

        events.length = 0;
        const tabA = Array.from(el.shadowRoot.querySelectorAll('.tabs__tab')).find((t: any) =>
            t.textContent.trim().startsWith('A'),
        ) as HTMLElement;
        tabA.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(events.length).toBe(1);
        expect(events[0]).toBeInstanceOf(CustomEvent);
        expect(events[0].detail).toEqual({ activeKey: 'a' });
        expect(el.activeKey).toBe('a');
    });
});

describe('table 行点击事件', () => {
    it('一次真实点击只派发一次 row-click，原生 click 只冒泡一次', async () => {
        const el = mount('solely-table', {
            'row-clickable': '',
            columns: JSON.stringify([{ key: 'name', dataIndex: 'name', title: 'Name' }]),
            'data-source': JSON.stringify([{ name: 'Alice' }, { name: 'Bob' }]),
        });
        await tick();
        const rowClick = collect(el, 'row-click');
        const clicks = collect(el, 'click');

        const firstCell = el.shadowRoot.querySelector('tbody tr td') as HTMLElement;
        firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(rowClick.length).toBe(1);
        expect(rowClick[0].detail).toEqual({ row: { name: 'Alice' }, index: 0 });
        expect(clicks.length).toBe(1);
        expect(clicks[0]).toBeInstanceOf(MouseEvent);
    });
});

describe('upload 事件与 objectURL 清理', () => {
    let created: string[];
    let revoked: string[];

    beforeEach(() => {
        created = [];
        revoked = [];
        (URL as any).createObjectURL = vi.fn(() => {
            const url = `blob:test/${created.length + 1}`;
            created.push(url);
            return url;
        });
        (URL as any).revokeObjectURL = vi.fn((url: string) => {
            revoked.push(url);
        });
    });

    it('一次选择 3 个文件只派发一次汇总 change', async () => {
        const el = mount('solely-upload', { multiple: '' });
        await tick();
        const change = collect(el, 'change');
        const success = collect(el, 'success');
        const errors = collect(el, 'error');

        const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt')];
        const fileList = {
            0: files[0],
            1: files[1],
            2: files[2],
            length: 3,
            item: (i: number) => files[i],
        };
        Object.defineProperty(input, 'files', { value: fileList, configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(el.getFileList().length).toBe(3);
        expect(change.length).toBe(1);
        // 未配置上传目标：逐文件失败，不伪造 success
        expect(success.length).toBe(0);
        expect(errors.length).toBe(3);
        expect(created.length).toBe(0);
    });

    it('clear() 清空列表并派发一次 change', async () => {
        const el = mount('solely-upload', { multiple: '' });
        await tick();
        const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
        Object.defineProperty(input, 'files', {
            value: { 0: files[0], 1: files[1], length: 2, item: (i: number) => files[i] },
            configurable: true,
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        const change = collect(el, 'change');
        el.clear();
        await tick();

        expect(el.getFileList().length).toBe(0);
        expect(change.length).toBe(1);
        expect(revoked.length).toBe(0);
    });

    it('移除单个文件时从列表删除', async () => {
        const el = mount('solely-upload', {});
        await tick();
        const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['a'], 'a.txt');
        Object.defineProperty(input, 'files', {
            value: { 0: file, length: 1, item: () => file },
            configurable: true,
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        const [uploadFile] = el.getFileList();
        el.handleRemove(uploadFile);
        await tick();
        expect(el.getFileList().length).toBe(0);
    });
});

describe('timeline reverse', () => {
    const items = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];

    it('数组属性赋值 + reverse 同样倒序', async () => {
        const el = document.createElement('solely-timeline') as any;
        el.items = items.map(i => ({ ...i }));
        el.reverse = true;
        document.body.appendChild(el);
        await tick();
        const titles = Array.from(el.shadowRoot.querySelectorAll('.timeline__title')).map((e: any) =>
            e.textContent.trim(),
        );
        expect(titles).toEqual(['C', 'B', 'A']);
    });

    it('挂载后切换 reverse 会重新倒序', async () => {
        const el = document.createElement('solely-timeline') as any;
        el.items = items.map(i => ({ ...i }));
        document.body.appendChild(el);
        await tick();
        el.reverse = true;
        await tick();
        const titles = Array.from(el.shadowRoot.querySelectorAll('.timeline__title')).map((e: any) =>
            e.textContent.trim(),
        );
        expect(titles).toEqual(['C', 'B', 'A']);
    });
});

describe('breadcrumb item-click', () => {
    it('点击无 href 的项派发 item-click / legacy-click，原生 click 只冒泡一次', async () => {
        const el = mount('solely-breadcrumb', {
            items: JSON.stringify([{ title: '首页' }, { title: '当前' }]),
        });
        await tick();
        const itemClick = collect(el, 'item-click');
        const legacyClick = collect(el, 'legacy-click');
        const clicks: Event[] = [];
        el.addEventListener('click', (e: Event) => clicks.push(e));

        const firstLink = el.shadowRoot.querySelector('.breadcrumb__link') as HTMLElement;
        firstLink.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(itemClick.length).toBe(1);
        expect(itemClick[0].detail).toEqual({ item: { title: '首页' } });
        expect(legacyClick.length).toBe(1);
        expect(legacyClick[0].detail).toEqual({ item: { title: '首页' } });
        // 组件不再合成同名 click，宿主只会看到一次原生 click
        expect(clicks.length).toBe(1);
        expect(clicks[0]).toBeInstanceOf(MouseEvent);
        // 原生 MouseEvent 的 detail 是点击次数，不含 item
        expect((clicks[0] as any).detail?.item).toBeUndefined();
    });

    it('带 href 的项同样派发 item-click，且 clickedItem 被记录', async () => {
        const el = mount('solely-breadcrumb', {
            items: JSON.stringify([{ title: '首页', href: '#home' }, { title: '当前' }]),
        });
        await tick();
        const itemClick = collect(el, 'item-click');
        const legacyClick = collect(el, 'legacy-click');

        const link = el.shadowRoot.querySelector('.breadcrumb__link') as HTMLElement;
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
        await tick();

        expect(itemClick.length).toBe(1);
        expect(itemClick[0].detail.item).toEqual({ title: '首页', href: '#home' });
        expect(legacyClick.length).toBe(1);
        expect(el.clickedItem).toEqual({ title: '首页', href: '#home' });
    });

    it('末项带 href 时渲染为可点击链接并保留 aria-current="page"（R-12）', async () => {
        const el = mount('solely-breadcrumb', {
            items: JSON.stringify([
                { title: '首页', href: '#home' },
                { title: '当前页', href: '#current' },
            ]),
        });
        await tick();
        const itemClick = collect(el, 'item-click');

        const current = el.shadowRoot.querySelector('[aria-current="page"]') as HTMLElement;
        expect(current.tagName.toLowerCase()).toBe('a');
        expect(current.getAttribute('href')).toBe('#current');
        expect(current.textContent!.trim()).toBe('当前页');

        current.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
        await tick();
        expect(itemClick.length).toBe(1);
        expect(itemClick[0].detail.item).toEqual({ title: '当前页', href: '#current' });
        expect(el.clickedItem).toEqual({ title: '当前页', href: '#current' });
    });

    it('末项无 href 时仍渲染为不可点击的文本并保留 aria-current', async () => {
        const el = mount('solely-breadcrumb', {
            items: JSON.stringify([{ title: '首页', href: '#home' }, { title: '当前页' }]),
        });
        await tick();

        const current = el.shadowRoot.querySelector('[aria-current="page"]') as HTMLElement;
        expect(current.tagName.toLowerCase()).toBe('span');
        expect(current.hasAttribute('href')).toBe(false);
    });
});

describe('pagination current 夹取', () => {
    it('total 缩小时把 current 夹到合法范围，detail 反映夹取后的值', async () => {
        const el = mount('solely-pagination', { total: '1000' });
        await tick();
        el.current = 5;
        await tick();

        const change = collect(el, 'change');
        el.total = 20; // totalPages = 2
        await tick();

        expect(el.totalPages).toBe(2);
        expect(el.current).toBe(2);
        expect(change.length).toBe(1);
        expect(change[0].detail).toEqual({ current: 2, pageSize: 10 });

        const pages = Array.from(el.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        expect(pages.map(p => p.textContent.trim())).toEqual(['1', '2']);
        expect(pages[1].getAttribute('aria-current')).toBe('page');

        // 此时上一页只能退到第 1 页，不会翻出越界页
        const prev = el.shadowRoot.querySelector('.pagination__prev') as HTMLElement;
        prev.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(el.current).toBe(1);
        expect(change.length).toBe(2);
        expect(change[1].detail).toEqual({ current: 1, pageSize: 10 });
    });

    it('pageSize 变大导致 current 越界时同样夹取', async () => {
        const el = mount('solely-pagination', { total: '100' });
        await tick();
        el.current = 8;
        await tick();

        const change = collect(el, 'change');
        el.pageSize = 50; // totalPages = 2
        await tick();

        expect(el.current).toBe(2);
        expect(change.length).toBe(1);
        expect(change[0].detail).toEqual({ current: 2, pageSize: 50 });
    });
});

describe('pagination simple 模式（R-13）', () => {
    it('输出 pagination--simple 并压缩为首页 / 当前页 / 末页', async () => {
        const el = mount('solely-pagination', { total: '1000', current: '5', simple: '' });
        await tick();

        const base = el.shadowRoot.querySelector('.pagination') as HTMLElement;
        expect(base.classList.contains('pagination--simple')).toBe(true);

        const items = Array.from(el.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        expect(items.map(item => item.textContent!.trim())).toEqual(['1', '5', '100']);
        expect(el.shadowRoot.querySelectorAll('.pagination__ellipsis').length).toBe(2);
    });

    it('非 simple 模式不输出 simple class，相邻页不插入冗余省略号', async () => {
        const normal = mount('solely-pagination', { total: '1000', current: '5' });
        await tick();
        expect(
            (normal.shadowRoot.querySelector('.pagination') as HTMLElement).classList.contains('pagination--simple'),
        ).toBe(false);

        const edge = mount('solely-pagination', { total: '100', current: '1', simple: '' });
        await tick();
        const items = Array.from(edge.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        // total=100、pageSize=10 → 共 10 页
        expect(items.map(item => item.textContent!.trim())).toEqual(['1', '10']);
        expect(edge.shadowRoot.querySelectorAll('.pagination__ellipsis').length).toBe(1);
    });
});

describe('pagination 数字归一化', () => {
    it('pageSize / current 赋字符串时按数字处理，不污染内部类型', async () => {
        const el = mount('solely-pagination', { total: '100', 'show-size-changer': '' });
        await tick();

        const change = collect(el, 'change');
        el.pageSize = '20' as any;
        await tick();

        expect(typeof el.pageSize).toBe('number');
        expect(el.pageSize).toBe(20);
        expect(change.length).toBe(1);
        expect(change[0].detail).toEqual({ current: 1, pageSize: 20 });

        const select = el.shadowRoot.querySelector('select') as HTMLSelectElement;
        const option20 = Array.from(select.querySelectorAll('option')).find(o => o.value === '20') as HTMLOptionElement;
        expect(option20.selected).toBe(true);

        el.current = 3;
        await tick();
        const countBefore = change.length;
        el.current = '3' as any;
        await tick();
        expect(el.current).toBe(3);
        expect(change.length).toBe(countBefore);
    });

    it('非法 pageSize 保持原值且不派发事件', async () => {
        const el = mount('solely-pagination', { total: '100' });
        await tick();
        const change = collect(el, 'change');

        el.pageSize = 'abc' as any;
        await tick();

        expect(el.pageSize).toBe(10);
        expect(change.length).toBe(0);
    });
});

describe('pagination disabled 可访问性', () => {
    it('整体 disabled 时页码/上下页/跳页步进 tabindex=-1 且 aria-disabled=true', async () => {
        const el = mount('solely-pagination', { total: '50', disabled: '', 'show-quick-jumper': '' });
        await tick();

        const pages = Array.from(el.shadowRoot.querySelectorAll('.pagination__item')) as HTMLElement[];
        for (const page of pages) {
            expect(page.tabIndex).toBe(-1);
            expect(page.getAttribute('aria-disabled')).toBe('true');
        }

        const jumpControls = [
            '.pagination__prev',
            '.pagination__next',
            '.pagination__jumper-up',
            '.pagination__jumper-down',
        ];
        for (const selector of jumpControls) {
            const target = el.shadowRoot.querySelector(selector) as HTMLElement;
            expect(target.tabIndex).toBe(-1);
            expect(target.getAttribute('aria-disabled')).toBe('true');
        }
    });

    it('未 disabled 时页码为 0 且 aria-disabled=false', async () => {
        const el = mount('solely-pagination', { total: '50' });
        await tick();
        const page = el.shadowRoot.querySelector('.pagination__item') as HTMLElement;
        expect(page.tabIndex).toBe(0);
        expect(page.getAttribute('aria-disabled')).toBe('false');
    });

    it('跳页输入框 Enter 会 preventDefault，避免 form 提交', async () => {
        const el = mount('solely-pagination', { total: '50', 'show-quick-jumper': '' });
        await tick();
        const input = el.shadowRoot.querySelector('input[type="number"]') as HTMLInputElement;
        input.value = '3';

        const event = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        input.dispatchEvent(event);
        await tick();

        expect(event.defaultPrevented).toBe(true);
        expect(el.current).toBe(3);
    });
});

describe('pagination 同值交互不派发', () => {
    it('选择与当前相同的 pageSize 不派发任何事件', async () => {
        const el = mount('solely-pagination', { total: '100', 'show-size-changer': '' });
        await tick();
        const change = collect(el, 'change');
        const sizeChange = collect(el, 'size-change');
        const showSizeChange = collect(el, 'show-size-change');

        const select = el.shadowRoot.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('10');
        select.value = '10';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(change.length).toBe(0);
        expect(sizeChange.length).toBe(0);
        expect(showSizeChange.length).toBe(0);
    });
});

describe('tabs 同值与 add/close 路径', () => {
    it('点击已激活的 tab 不再派发 change', async () => {
        const el = mount('solely-tabs', {
            items: JSON.stringify([
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B' },
            ]),
        });
        await tick();
        const change = collect(el, 'change');
        const tabs = Array.from(el.shadowRoot.querySelectorAll('.tabs__tab')) as HTMLElement[];
        const tabA = tabs.find(t => t.textContent.trim().startsWith('A')) as HTMLElement;

        tabA.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(change.length).toBe(0);

        const tabB = tabs.find(t => t.textContent.trim().startsWith('B')) as HTMLElement;
        tabB.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(change.length).toBe(1);

        tabB.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(change.length).toBe(1);
    });

    it('handleAdd 切换 activeKey 时派发 change', async () => {
        const el = mount('solely-tabs', {
            items: JSON.stringify([{ key: 'a', label: 'A' }]),
            addable: '',
        });
        await tick();
        const change = collect(el, 'change');
        const add = collect(el, 'add');

        el.handleAdd();
        await tick();

        const activeKey = el.activeKey;
        expect(activeKey).toMatch(/^new-/);
        expect(change.length).toBe(1);
        expect(change[0].detail).toEqual({ activeKey });
        expect(add.length).toBe(1);
    });

    it('关闭当前激活 tab 切换到相邻项时派发 change', async () => {
        const el = mount('solely-tabs', {
            items: JSON.stringify([
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B' },
            ]),
            closable: '',
        });
        await tick();
        el.activeKey = 'b';
        await tick();
        const change = collect(el, 'change');
        const close = collect(el, 'close');

        el.handleClose({ key: 'b', label: 'B' }, new MouseEvent('click'));
        await tick();

        expect(el.activeKey).toBe('a');
        expect(change.length).toBe(1);
        expect(change[0].detail).toEqual({ activeKey: 'a' });
        expect(close.length).toBe(1);
    });
});

describe('upload clear 边界与 maxCount', () => {
    let created: string[];
    let revoked: string[];

    beforeEach(() => {
        created = [];
        revoked = [];
        (URL as any).createObjectURL = vi.fn(() => {
            const url = `blob:edge/${created.length + 1}`;
            created.push(url);
            return url;
        });
        (URL as any).revokeObjectURL = vi.fn((url: string) => {
            revoked.push(url);
        });
    });

    function selectOne(el: any, file: File): void {
        const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', {
            value: { 0: file, length: 1, item: () => file },
            configurable: true,
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('空列表 clear() 不派发 change', async () => {
        const el = mount('solely-upload', {});
        await tick();
        const change = collect(el, 'change');
        el.clear();
        await tick();
        expect(change.length).toBe(0);
    });

    it('已卸载元素上的 clear() 不派发 change', async () => {
        const el = mount('solely-upload', {});
        await tick();
        selectOne(el, new File(['a'], 'a.txt'));
        await tick();
        const change = collect(el, 'change');
        el.remove();
        await tick();
        el.clear();
        await tick();
        expect(change.length).toBe(0);
        expect(el.getFileList().length).toBe(0);
    });

    it('clear() 同步 fileList 字符串属性，重挂载后不会复活已删文件', async () => {
        const el = document.createElement('solely-upload') as any;
        el.fileList = [{ uid: 'u1', name: 'saved.txt', status: 'done' }];
        document.body.appendChild(el);
        await tick();
        expect(el.getFileList().length).toBe(1);

        el.clear();
        await tick();
        el.remove();
        await tick();
        document.body.appendChild(el);
        await tick();

        expect(el.getFileList().length).toBe(0);
    });

    it('maxCount=0 时禁止选择，change 不派发且逐项报错', async () => {
        const el = mount('solely-upload', { 'max-count': '0' });
        await tick();
        const change = collect(el, 'change');
        const errors = collect(el, 'error');

        selectOne(el, new File(['a'], 'a.txt'));
        await tick();

        expect(el.getFileList().length).toBe(0);
        expect(change.length).toBe(0);
        expect(errors.length).toBe(1);
        expect(errors[0].detail.message).toContain('最多 0 个');
    });

    it('未配置上传目标时不创建 objectURL，卸载也不回收', async () => {
        const el = mount('solely-upload', {});
        await tick();
        selectOne(el, new File(['a'], 'a.txt'));
        await tick();
        expect(created.length).toBe(0);

        el.remove();
        await tick();
        expect(revoked.length).toBe(0);
    });
});

describe('pagination 跳页步进与翻页图标', () => {
    it('上下按钮改用线性 SVG chevron，方向正确且无文字符号', async () => {
        const el = mount('solely-pagination', { total: '50', 'show-quick-jumper': '' });
        await tick();

        const up = el.shadowRoot.querySelector('.pagination__jumper-up') as HTMLElement;
        const down = el.shadowRoot.querySelector('.pagination__jumper-down') as HTMLElement;
        expect(up.querySelector('svg.pagination__jumper-icon path')?.getAttribute('d')).toBe('M3.5 10 8 5.5 12.5 10');
        expect(down.querySelector('svg.pagination__jumper-icon path')?.getAttribute('d')).toBe('M3.5 6 8 10.5 12.5 6');
        expect(up.textContent?.trim()).toBe('');
        expect(down.textContent?.trim()).toBe('');
    });

    it('上一页/下一页也改为线性 chevron，不再输出 < > 文本字符', async () => {
        const el = mount('solely-pagination', { total: '50' });
        await tick();

        const prev = el.shadowRoot.querySelector('.pagination__prev') as HTMLElement;
        const next = el.shadowRoot.querySelector('.pagination__next') as HTMLElement;
        expect(prev.querySelector('svg.pagination__nav-icon path')?.getAttribute('d')).toBe('M10 3.5 5.5 8 10 12.5');
        expect(next.querySelector('svg.pagination__nav-icon path')?.getAttribute('d')).toBe('M6 3.5 10.5 8 6 12.5');
        expect(prev.textContent?.trim()).toBe('');
        expect(next.textContent?.trim()).toBe('');
    });
});
