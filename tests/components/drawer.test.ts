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

describe('Drawer command component', () => {
    beforeEach(() => {
        resetConfig();
    });

    afterEach(async () => {
        await Drawer.destroy();
        resetConfig();
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

        // 打开时锁定背景滚动
        expect(document.body.classList.contains('solely-drawer-open')).toBe(true);
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
        // 所有抽屉关闭后移除背景锁定
        expect(document.body.classList.contains('solely-drawer-open')).toBe(false);
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
        expect(document.body.classList.contains('solely-drawer-open')).toBe(true);

        await Drawer.destroy();
        expect(document.querySelectorAll('.solely-drawer-wrap').length).toBe(0);
        expect(document.body.classList.contains('solely-drawer-open')).toBe(false);
    });
});
