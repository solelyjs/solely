/**
 * Drawer 命令式组件测试
 * 与 Modal 类似，Drawer 通过命令式 API 把 DOM 渲染到 document.body，
 * 使用回调（onClose）作为“事件”。注意 cloneElement 默认 true（与 Modal 相反）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Drawer from '../../src/components/commands/drawer';

const waitClose = () => new Promise<void>(r => setTimeout(r, 350));

const resetConfig = () => {
    Drawer.config({
        width: 378,
        height: 378,
        mask: true,
        maskClosable: true,
        closable: true,
    });
};

/**
 * jsdom 没有布局盒，overlay-stack 的可聚焦判定依赖 getClientRects() 非空。
 * 返回合成矩形才能在测试中验证焦点进入/还原（与 overlay-stack.test.ts 一致）。
 */
const FAKE_RECT = { x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) };

describe('Drawer command component', () => {
    let rectsSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rectsSpy = vi
            .spyOn(HTMLElement.prototype, 'getClientRects')
            .mockImplementation(() => [FAKE_RECT] as unknown as DOMRectList);
        resetConfig();
    });

    afterEach(async () => {
        await Drawer.destroy();
        resetConfig();
        rectsSpy.mockRestore();
    });

    it('should render title/content, add body scroll lock, and default to right placement', async () => {
        Drawer.open({ title: '标题', content: '内容' });

        const wrap = document.querySelector('.solely-drawer-wrap');
        expect(wrap).not.toBeNull();
        expect(document.querySelector('.solely-drawer__title')!.textContent).toBe('标题');
        expect(document.querySelector('.solely-drawer__body')!.textContent).toBe('内容');

        // 默认 right 方向
        expect(document.querySelector('.solely-drawer--right')).not.toBeNull();
        // 默认宽度 378px 应用到 drawer
        expect((document.querySelector('.solely-drawer') as HTMLElement).style.width).toBe('378px');

        // 打开时锁定背景滚动（由基座 lockScroll() 引用计数实现，不再使用空类名）
        expect(document.body.style.overflow).toBe('hidden');
    });

    it('should apply width for left/right and height for top/bottom', async () => {
        Drawer.open({ title: 't', content: 'c', placement: 'left', width: 500 });
        const leftDrawer = document.querySelector('.solely-drawer') as HTMLElement;
        expect(leftDrawer.classList.contains('solely-drawer--left')).toBe(true);
        expect(leftDrawer.style.width).toBe('500px');
        await Drawer.destroy();

        Drawer.open({ title: 't', content: 'c', placement: 'top', height: 240 });
        const topDrawer = document.querySelector('.solely-drawer') as HTMLElement;
        expect(topDrawer.classList.contains('solely-drawer--top')).toBe(true);
        expect(topDrawer.style.height).toBe('240px');
        // top/bottom 不设置 width
        expect(topDrawer.style.width).toBe('');
    });

    it('should respect mask / closable props', async () => {
        Drawer.open({ title: 't', content: 'c', mask: false, closable: false });

        expect(document.querySelector('.solely-drawer-mask')).toBeNull();
        // 有标题时 header 仍渲染（含标题），但无关闭按钮
        expect(document.querySelector('.solely-drawer__header')).not.toBeNull();
        expect(document.querySelector('.solely-drawer__title')!.textContent).toBe('t');
        expect(document.querySelector('.solely-drawer__close')).toBeNull();

        await Drawer.destroy();

        // 无标题且 closable:false，header 不渲染
        Drawer.open({ content: 'c', closable: false });
        expect(document.querySelector('.solely-drawer__header')).toBeNull();
        expect(document.querySelector('.solely-drawer__close')).toBeNull();
    });

    it('should close via close button, fire onClose, and release body lock', async () => {
        const onClose = vi.fn();
        Drawer.open({ title: 't', content: 'c', onClose });

        (document.querySelector('.solely-drawer__close') as HTMLButtonElement).click();
        await waitClose();

        expect(document.querySelector('.solely-drawer-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        // 所有抽屉关闭后释放背景锁定
        expect(document.body.style.overflow).toBe('');
    });

    it('should close on mask click by default and not when maskClosable is false', async () => {
        const onClose = vi.fn();
        Drawer.open({ title: 't', content: 'c', onClose });
        (document.querySelector('.solely-drawer-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-drawer-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);

        await Drawer.destroy();

        // maskClosable:false，点击遮罩不关闭
        Drawer.open({ title: 't', content: 'c', maskClosable: false });
        (document.querySelector('.solely-drawer-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-drawer-wrap')).not.toBeNull();
    });

    it('should clone HTMLElement content by default and update at runtime', async () => {
        const node = document.createElement('div');
        node.textContent = 'DOM 内容';
        const instance = Drawer.open({ title: 't', content: node });

        const bodyEl = document.querySelector('.solely-drawer__body')!;
        // 默认 cloneElement=true，原节点不会被移动进抽屉
        expect(bodyEl.contains(node)).toBe(false);
        expect(bodyEl.textContent).toBe('DOM 内容');

        instance.update({ title: '新标题', content: '新内容' });
        expect(document.querySelector('.solely-drawer__title')!.textContent).toBe('新标题');
        expect(document.querySelector('.solely-drawer__body')!.textContent).toBe('新内容');

        // cloneElement:false 时原节点会被挂载
        const node2 = document.createElement('div');
        node2.textContent = '直接挂载';
        instance.update({ content: node2, cloneElement: false });
        expect(document.querySelector('.solely-drawer__body')!.contains(node2)).toBe(true);
    });

    it('should support multiple drawers and destroy all', async () => {
        Drawer.open({ title: 'a', content: '1' });
        Drawer.open({ title: 'b', content: '2' });
        expect(document.querySelectorAll('.solely-drawer-wrap').length).toBe(2);
        expect(document.body.style.overflow).toBe('hidden');

        await Drawer.destroy();
        expect(document.querySelectorAll('.solely-drawer-wrap').length).toBe(0);
        expect(document.body.style.overflow).toBe('');
    });

    it('should expose dialog semantics, move focus in, and close on Escape with focus restore', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        const onClose = vi.fn();
        Drawer.open({ title: 't', content: 'c', onClose });

        const drawer = document.querySelector('.solely-drawer') as HTMLElement;
        expect(drawer.getAttribute('role')).toBe('dialog');
        expect(drawer.getAttribute('aria-modal')).toBe('true');
        expect(document.activeElement).toBe(drawer);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await waitClose();

        expect(document.querySelector('.solely-drawer-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(trigger);
        expect(document.body.style.overflow).toBe('');

        trigger.remove();
    });

    it('should only close the topmost drawer on Escape', async () => {
        Drawer.open({ title: 'first', content: '1' });
        const firstDrawer = document.querySelector('.solely-drawer') as HTMLElement;

        Drawer.open({ title: 'second', content: '2' });
        const secondDrawer = document.querySelectorAll('.solely-drawer')[1] as HTMLElement;
        expect(document.activeElement).toBe(secondDrawer);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await waitClose();

        expect(document.querySelectorAll('.solely-drawer').length).toBe(1);
        expect(document.activeElement).toBe(firstDrawer);
    });

    it('should update placement class and corresponding size via update()', async () => {
        const instance = Drawer.open({ title: 't', content: 'c', placement: 'right', width: 400 });

        instance.update({ placement: 'top', height: 200 });

        const drawerEl = document.querySelector('.solely-drawer') as HTMLElement;
        expect(drawerEl.classList.contains('solely-drawer--top')).toBe(true);
        expect(drawerEl.classList.contains('solely-drawer--right')).toBe(false);
        // 切换方向后旧方向的行内宽度被清理，并按新方向应用高度
        expect(drawerEl.style.width).toBe('');
        expect(drawerEl.style.height).toBe('200px');

        // 保留自定义类名与当前方向修饰类
        instance.update({ className: 'custom-drawer' });
        expect(drawerEl.className).toBe('solely-drawer solely-drawer--top custom-drawer');
    });

    it('update() 补标题 / 清空标题时同步 aria-labelledby 与 aria-label', () => {
        const instance = Drawer.open({ content: 'c' });
        const drawerEl = document.querySelector('.solely-drawer') as HTMLElement;
        expect(drawerEl.hasAttribute('aria-labelledby')).toBe(false);
        expect(drawerEl.getAttribute('aria-label')).toBe('抽屉');

        // 原本没有标题：补标题时必须带 id 并切换到 aria-labelledby
        instance.update({ title: '新标题' });
        const title = drawerEl.querySelector('.solely-drawer__title') as HTMLElement;
        expect(title.id).toBeTruthy();
        expect(drawerEl.getAttribute('aria-labelledby')).toBe(title.id);
        expect(drawerEl.hasAttribute('aria-label')).toBe(false);

        // 标题清空后不能继续指向空节点
        instance.update({ title: '' });
        expect(drawerEl.hasAttribute('aria-labelledby')).toBe(false);
        expect(drawerEl.getAttribute('aria-label')).toBe('抽屉');
    });

    it('update() 忽略非法 placement，保持当前方向', () => {
        const instance = Drawer.open({ title: 't', placement: 'right' });
        instance.update({ placement: 'bogus' as never });

        const drawerEl = document.querySelector('.solely-drawer') as HTMLElement;
        expect(drawerEl.classList.contains('solely-drawer--right')).toBe(true);
        expect(drawerEl.className).not.toContain('bogus');
    });

    it('关闭按钮渲染线性 SVG 而不是 × 文本字符', () => {
        Drawer.open({ title: 't', content: 'c' });
        const close = document.querySelector('.solely-drawer__close') as HTMLElement;
        expect(close.querySelector('svg.solely-linear-icon')).toBeTruthy();
        expect(close.textContent?.trim()).toBe('');
    });

    it('onClose 抛错时仍完成关闭并释放浮层资源', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        Drawer.open({
            title: 't',
            content: 'c',
            onClose: () => {
                throw new Error('onClose boom');
            },
        });

        (document.querySelector('.solely-drawer__close') as HTMLElement).click();
        await waitClose();

        expect(document.querySelector('.solely-drawer-wrap')).toBeNull();
        expect(document.body.style.overflow).toBe('');
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
