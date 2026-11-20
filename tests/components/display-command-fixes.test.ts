/**
 * 展示 / 导航 / 命令式分组的审计缺陷回归
 *
 * 覆盖 R1 枚举白名单、R4 Tab 序列、R6 可访问名称，
 * 以及 steps / skeleton / card / badge / tree / progress / backtop 的具体缺陷。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import '../../src/components/elements/steps';
import '../../src/components/elements/progress';
import '../../src/components/elements/skeleton';
import '../../src/components/elements/tabs';
import '../../src/components/elements/pagination';
import '../../src/components/elements/button';
import '../../src/components/elements/tree';
import '../../src/components/elements/card';
import '../../src/components/elements/badge';
import '../../src/components/elements/breadcrumb';
import '../../src/components/elements/not-found';
import '../../src/components/elements/backtop';
import Modal from '../../src/components/commands/modal';
import Drawer from '../../src/components/commands/drawer';
import Message from '../../src/components/commands/message';
import Popconfirm from '../../src/components/commands/popconfirm';
import Tooltip from '../../src/components/commands/tooltip';
import { clearBody, getShadowRoot, mountAndWait, recordEvents, tick } from '../helpers';
import { getManifest } from '../helpers/manifest';

/** 读取源码 CSS（用于断言纯样式型修复，jsdom 不计算 shadow 内的样式表级联） */
function readCss(relativePath: string): string {
    return readFileSync(resolve(process.cwd(), 'src/components', relativePath), 'utf-8');
}

// 目标放在视口中部，避免浮层因空间不足翻转到另一侧，干扰方位断言
const FAKE_RECT = {
    x: 300,
    y: 500,
    width: 1,
    height: 1,
    top: 500,
    left: 300,
    right: 301,
    bottom: 501,
    toJSON: () => ({}),
};

afterEach(async () => {
    await Modal.destroy();
    await Drawer.destroy();
    await Message.destroy();
    Tooltip.destroy();
    clearBody();
});

describe('steps', () => {
    it('所有触发路径派发统一的 { current, index, item }', async () => {
        const el = await mountAndWait<any>('solely-steps', {
            items: JSON.stringify([{ title: 'A' }, { title: 'B' }, { title: 'C' }]),
            current: 0,
        });
        const rec = recordEvents(el, ['change']);

        el.setCurrent(1);
        el.next();
        expect(rec.of('change').map(e => (e as CustomEvent).detail)).toEqual([
            { current: 1, index: 1, item: { title: 'B' } },
            { current: 2, index: 2, item: { title: 'C' } },
        ]);
        rec.stop();
    });

    it('非法 direction / item.status 回退默认档位，不产生死类名', async () => {
        const el = await mountAndWait<any>('solely-steps', {
            direction: 'diagonal',
            items: JSON.stringify([{ title: 'A', status: 'bogus' }]),
            current: 0,
        });
        const root = getShadowRoot(el).querySelector('.steps') as HTMLElement;
        expect(root.classList.contains('steps--horizontal')).toBe(true);
        expect(root.className).not.toContain('diagonal');

        const step = getShadowRoot(el).querySelector('.step') as HTMLElement;
        // 非法 status 回退为按 current 计算的 process（首步）
        expect(step.classList.contains('step--process')).toBe(true);
        expect(step.className).not.toContain('bogus');
    });
});

describe('progress', () => {
    it('非法 type / status 回退 line / normal，且 success 提供 aria-valuetext', async () => {
        const el = await mountAndWait<any>('solely-progress', {
            type: 'bogus',
            status: 'bogus',
            percent: 30,
        });
        const root = getShadowRoot(el);
        expect((root.querySelector('.progress') as HTMLElement).classList.contains('progress--line')).toBe(true);
        expect(root.querySelector('.progress__track, .progress__outer')).not.toBeNull();
        expect((root.querySelector('.progress__inner') as HTMLElement).className).not.toContain('bogus');

        el.status = 'success';
        await tick();
        expect(root.querySelector('.progress')?.getAttribute('aria-valuetext')).toBe('完成');
    });

    it('active 状态具备可见渐变与圆环样式，并提供减少动态效果回退', () => {
        const css = readCss('elements/progress/style.css');
        expect(css).toMatch(/\.progress__inner--active\s*\{[^}]*background-image:/);
        expect(css).toMatch(/\.progress__circle-path--active\s*\{/);
        expect(css).toContain('prefers-reduced-motion: reduce');
    });
});

describe('tabs', () => {
    it('close 按钮退出 Tab 序列，Delete 键提供键盘等价', async () => {
        const el = await mountAndWait<any>('solely-tabs', {
            items: JSON.stringify([
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B' },
            ]),
            closable: true,
        });
        const root = getShadowRoot(el);
        const close = root.querySelector('.tabs__close') as HTMLElement;
        expect(close.getAttribute('tabindex')).toBe('-1');

        const rec = recordEvents(el, ['close']);
        const activeTab = root.querySelector('.tabs__tab') as HTMLElement;
        activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        await tick();
        expect(rec.of('close')).toHaveLength(1);
        rec.stop();
    });

    it('非法 type / position 回退 line / top，label 映射到 tablist 名称', async () => {
        const el = await mountAndWait<any>('solely-tabs', {
            type: 'bogus',
            position: 'diagonal',
            label: '主导航',
            items: JSON.stringify([{ key: 'a', label: 'A' }]),
        });
        const nav = getShadowRoot(el).querySelector('.tabs__nav') as HTMLElement;
        expect(nav.getAttribute('aria-orientation')).toBe('horizontal');
        expect(nav.getAttribute('aria-label')).toBe('主导航');
        expect((getShadowRoot(el).querySelector('.tabs') as HTMLElement).classList.contains('tabs--line')).toBe(true);
        expect(getShadowRoot(el).innerHTML).not.toContain('diagonal');
    });
});

describe('pagination', () => {
    it('disabled 时 select 与快速跳转 input 真正禁用', async () => {
        const el = await mountAndWait<any>('solely-pagination', {
            total: 50,
            'show-size-changer': true,
            'show-quick-jumper': true,
            disabled: true,
        });
        const root = getShadowRoot(el);
        expect((root.querySelector('select') as HTMLSelectElement).disabled).toBe(true);
        expect((root.querySelector('input') as HTMLInputElement).disabled).toBe(true);
        expect(root.querySelector('select')?.getAttribute('aria-label')).toBe('每页条数');
    });

    it('pageSize 不在默认选项中时，下拉仍显示当前每页条数而非第一项', async () => {
        // 复现文档「与分页联动」截图：page-size=2 但 pageSizeOptions 默认 [10,20,50,100]，
        // <select> 没有任何 option 带 selected，浏览器会回退显示「10 条/页」。
        const el = await mountAndWait<any>('solely-pagination', {
            total: 6,
            'page-size': 2,
            'show-size-changer': true,
        });
        const select = getShadowRoot(el).querySelector('select') as HTMLSelectElement;
        expect([...select.options].map(option => option.value)).toContain('2');
        expect(select.value).toBe('2');
        expect(select.options[select.selectedIndex]?.textContent?.trim()).toBe('2 条/页');
    });

    it('自定义选项与当前 pageSize 合并去重后升序排列', async () => {
        const el = await mountAndWait<any>('solely-pagination', {
            total: 30,
            'page-size': 5,
            'page-size-options': '[10, 3]',
            'show-size-changer': true,
        });
        const select = getShadowRoot(el).querySelector('select') as HTMLSelectElement;
        expect([...select.options].map(option => option.value)).toEqual(['3', '5', '10']);
        expect(select.value).toBe('5');
    });

    it('外部修改 pageSize property 后下拉选中项同步更新', async () => {
        const el = await mountAndWait<any>('solely-pagination', {
            total: 100,
            'page-size': 4,
            'show-size-changer': true,
        });
        el.pageSize = 20;
        await tick();
        const select = getShadowRoot(el).querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('20');
    });
});

describe('button', () => {
    it('非法 type/shape 回退 default，pill 有真实样式', async () => {
        const el = await mountAndWait<any>('solely-button', { type: 'bogus', shape: 'pill' });
        const btn = getShadowRoot(el).querySelector('.btn') as HTMLElement;
        expect(btn.classList.contains('btn--default')).toBe(true);
        expect(btn.classList.contains('btn--shape-pill')).toBe(true);
        expect(btn.className).not.toContain('bogus');
        expect(readCss('elements/button/style.css')).toMatch(/\.btn--shape-pill\s*\{/);
    });

    it('href 禁用态退出 Tab 序列且保留可访问名称', async () => {
        const el = await mountAndWait<any>('solely-button', {
            href: '/next',
            disabled: true,
            label: '下一步',
        });
        const link = getShadowRoot(el).querySelector('a') as HTMLAnchorElement;
        expect(link.getAttribute('tabindex')).toBe('-1');
        expect(link.getAttribute('aria-label')).toBe('下一步');
    });
});

describe('tree', () => {
    it('checkedKeys / expandedKeys 可作为 property 与 attribute 写入并读取', async () => {
        const data = JSON.stringify([{ key: '1', title: 'A', children: [{ key: '1-1', title: 'A-1' }] }]);
        const el = await mountAndWait<any>('solely-tree', {
            'tree-data': data,
            'checked-keys': JSON.stringify(['1-1']),
            'expanded-keys': JSON.stringify(['1']),
        });
        // 非严格模式：父节点状态由子节点重算，全部子节点勾选后父节点同步勾选
        expect(el.checkedKeys).toEqual(['1', '1-1']);
        expect(el.expandedKeys).toEqual(['1']);

        el.checkedKeys = ['1'];
        await tick();
        // 勾选父节点向下级联
        expect(el.checkedKeys).toEqual(['1', '1-1']);
    });

    it('搜索过滤派发 change，label 映射到 role=tree 名称', async () => {
        const el = await mountAndWait<any>('solely-tree', {
            searchable: true,
            label: '目录',
            'tree-data': JSON.stringify([
                { key: '1', title: 'Alpha' },
                { key: '2', title: 'Beta' },
            ]),
        });
        expect((getShadowRoot(el).querySelector('.tree') as HTMLElement).getAttribute('aria-label')).toBe('目录');

        const rec = recordEvents(el, ['change']);
        const input = getShadowRoot(el).querySelector('input') as HTMLInputElement;
        input.value = 'Alpha';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(rec.of('change').length).toBeGreaterThan(0);
        rec.stop();
    });
});

describe('card / badge / breadcrumb / not-found', () => {
    it('card actions 接受数组，coverAlt 映射到 alt，CardRefs.card 可用', async () => {
        const el = await mountAndWait<any>('solely-card', {
            actions: JSON.stringify(['详情', '编辑']),
            cover: 'https://example.com/a.png',
            'cover-alt': '封面图',
        });
        const root = getShadowRoot(el);
        expect(root.querySelectorAll('.card__action')).toHaveLength(2);
        expect(root.querySelector('img')?.getAttribute('alt')).toBe('封面图');
        expect(el.$refs.card).toBeTruthy();
    });

    it('badge 不再声明 title；状态点非法值回退 default 且有 role/aria', async () => {
        const el = await mountAndWait<any>('solely-badge', { dot: true });
        const dot = getShadowRoot(el).querySelector('.badge__dot') as HTMLElement;
        expect(dot.getAttribute('role')).toBe('status');
        expect(dot.getAttribute('aria-label')).toBe('有新内容');

        const manifest = getManifest(el.constructor);
        expect(manifest?.props?.some((p: any) => (p as any).name === 'title') ?? false).toBe(false);

        el.dot = false;
        el.status = 'bogus';
        await tick();
        const statusDot = getShadowRoot(el).querySelector('.badge__status-dot') as HTMLElement;
        expect(statusDot.classList.contains('badge__status-dot--default')).toBe(true);
    });

    it('breadcrumb nav 具有可访问名称', async () => {
        const el = await mountAndWait<any>('solely-breadcrumb', {
            label: '位置',
            items: JSON.stringify([{ title: '首页' }]),
        });
        expect(getShadowRoot(el).querySelector('nav')?.getAttribute('aria-label')).toBe('位置');
    });

    it('not-found 清空 title 时回退 404，装饰 SVG 不进入无障碍树', async () => {
        const el = await mountAndWait<any>('solely-not-found', { title: '' });
        expect((getShadowRoot(el).querySelector('.not-found__title') as HTMLElement).textContent?.trim()).toBe('404');
        for (const svg of Array.from(getShadowRoot(el).querySelectorAll('svg'))) {
            expect(svg.getAttribute('aria-hidden')).toBe('true');
        }
    });
});

describe('backtop', () => {
    it('文档模式使用 CSS 默认右下角定位', async () => {
        const el = await mountAndWait<any>('solely-backtop', { target: 'document', visibilityHeight: 0 });
        expect(el.style.right).toBe('');
        expect(el.style.bottom).toBe('');
        const css = readCss('elements/backtop/style.css');
        expect(css).toMatch(/:host\s*\{[^}]*right:\s*24px/i);
        expect(css).toMatch(/:host\s*\{[^}]*bottom:\s*24px/i);
    });
});

describe('command components', () => {
    it('modal 非法 type 回退 info，标题通过 aria-labelledby 关联', async () => {
        const instance = Modal.open({ type: 'bogus' as any, title: '标题' });
        const dialog = document.querySelector('.solely-modal') as HTMLElement;
        expect(dialog.className).not.toContain('bogus');
        expect(document.querySelector('.solely-modal__icon--info')).not.toBeNull();

        const labelledby = dialog.getAttribute('aria-labelledby');
        expect(labelledby).toBeTruthy();
        expect(document.getElementById(labelledby as string)).not.toBeNull();
        instance.close();
    });

    it('modal 无标题时提供 aria-label 兜底', async () => {
        const instance = Modal.open({ title: '' });
        expect(document.querySelector('.solely-modal')?.getAttribute('aria-label')).toBe('对话框');
        instance.close();
    });

    it('drawer 非法 placement 回退 right，标题通过 aria-labelledby 关联', async () => {
        const instance = Drawer.open({ title: '抽屉标题', placement: 'diagonal' as any });
        const dialog = document.querySelector('.solely-drawer') as HTMLElement;
        expect(dialog.className).toContain('solely-drawer--right');
        expect(dialog.className).not.toContain('diagonal');
        const labelledby = dialog.getAttribute('aria-labelledby');
        expect(labelledby).toBeTruthy();
        expect(document.getElementById(labelledby as string)).not.toBeNull();
        instance.close();
    });

    it('message 非法 placement 回退 top 容器', async () => {
        const instance = Message.open({ content: '消息', placement: 'diagonal' as any, duration: 0 });
        const container = document.querySelector('.solely-message-container') as HTMLElement;
        expect(container.style.top).toBe('24px');
        expect(container.style.left).toBe('50%');
        instance.close();
    });

    it('popconfirm 非法 placement 回退 top，default okType 有独立样式类', () => {
        const target = document.createElement('button');
        target.textContent = '删除';
        document.body.appendChild(target);
        target.getBoundingClientRect = () => FAKE_RECT as DOMRect;
        const rectSpy = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(FAKE_RECT as DOMRect);

        const instance = Popconfirm.show(target, {
            title: '确认？',
            placement: 'diagonal' as any,
            okType: 'default' as any,
        }) as any;
        const popconfirm = document.querySelector('.solely-popconfirm') as HTMLElement;
        expect(popconfirm.className).toContain('solely-popconfirm--top');
        expect(popconfirm.className).not.toContain('diagonal');
        expect(popconfirm.querySelector('.solely-popconfirm__btn--default')).not.toBeNull();
        instance?.close?.();
        rectSpy.mockRestore();
    });

    it('tooltip 命令式非法 placement 回退 top', () => {
        const target = document.createElement('button');
        target.textContent = '提示';
        document.body.appendChild(target);
        target.getBoundingClientRect = () => FAKE_RECT as DOMRect;

        const instance = Tooltip.bind(target, {
            content: '气泡',
            placement: 'diagonal' as any,
            trigger: 'bogus' as any,
        });
        instance.show();
        const tooltip = document.querySelector('.solely-tooltip') as HTMLElement;
        expect(tooltip.className).toContain('solely-tooltip--top');
        expect(tooltip.className).not.toContain('diagonal');
        instance.hide();
    });
});
