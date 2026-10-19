/**
 * Modal 命令式组件测试
 * 组件通过命令式 API 直接把 DOM 渲染到 document.body，
 * 使用回调（onConfirm/onCancel/onClose）而非 CustomEvent 作为“事件”。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Modal from '../../src/components/commands/modal';

// 关闭动画时长为 ANIMATION_DURATION.NORMAL = 300ms，多等一点确保 DOM 已移除
const waitClose = () => new Promise<void>(r => setTimeout(r, 350));

// 重置全局配置，避免测试之间相互影响
const resetConfig = () => {
    Modal.config({
        width: 520,
        mask: true,
        maskClosable: false,
        okText: '确定',
        cancelText: '取消',
    });
};

describe('Modal command component', () => {
    beforeEach(() => {
        resetConfig();
    });

    afterEach(async () => {
        await Modal.destroy();
        resetConfig();
    });

    it('should render title, content and default icon into body', async () => {
        Modal.info({ title: '标题', content: '内容' });

        const wrap = document.querySelector('.solely-modal-wrap');
        expect(wrap).not.toBeNull();
        expect(wrap!.contains(document.body.querySelector('.solely-modal__title')!)).toBe(true);

        expect(document.querySelector('.solely-modal__title')!.textContent).toBe('标题');
        expect(document.querySelector('.solely-modal__content')!.textContent).toBe('内容');

        // info 类型默认显示图标
        const icon = document.querySelector('.solely-modal__icon--info');
        expect(icon).not.toBeNull();
        expect(icon!.textContent).toBe('ℹ');

        // 默认宽度 520px
        expect((document.querySelector('.solely-modal') as HTMLElement).style.width).toBe('520px');
    });

    it('should show cancel button for confirm type but only OK for info', async () => {
        Modal.confirm({ title: 't', content: 'c' });
        let buttons = document.querySelectorAll('.solely-modal__footer .solely-modal__btn');
        expect(buttons.length).toBe(2); // 取消 + 确定
        expect(document.querySelector('.solely-modal__btn--default')!.textContent).toBe('取消');
        expect(document.querySelector('.solely-modal__btn--primary')!.textContent).toBe('确定');

        await Modal.destroy();

        Modal.info({ title: 't', content: 'c' });
        buttons = document.querySelectorAll('.solely-modal__footer .solely-modal__btn');
        expect(buttons.length).toBe(1); // 仅确定
    });

    it('should respect mask / closable / showIcon props', async () => {
        Modal.open({
            title: 't',
            content: 'c',
            type: 'info',
            mask: false,
            closable: false,
            showIcon: false,
        });

        // 无遮罩
        expect(document.querySelector('.solely-modal-mask')).toBeNull();
        // 无关闭按钮
        expect(document.querySelector('.solely-modal__close')).toBeNull();
        // 无图标
        expect(document.querySelector('.solely-modal__icon')).toBeNull();
    });

    it('should close via the close button and fire onClose', async () => {
        const onClose = vi.fn();
        Modal.open({ title: 't', content: 'c', onClose });

        const closeBtn = document.querySelector('.solely-modal__close') as HTMLButtonElement;
        expect(closeBtn).not.toBeNull();
        closeBtn.click();

        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should close via instance.close()', async () => {
        const instance = Modal.open({ title: 't', content: 'c' });
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();

        instance.close();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
    });

    it('should not close on mask click by default but close when maskClosable and fire onCancel', async () => {
        // 默认 maskClosable = false，点击遮罩不关闭
        Modal.open({ title: 't', content: 'c' });
        (document.querySelector('.solely-modal-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();

        await Modal.destroy();

        // 显式 maskClosable = true，点击遮罩关闭并触发 onCancel
        const onCancel = vi.fn();
        Modal.open({ title: 't', content: 'c', maskClosable: true, onCancel });
        (document.querySelector('.solely-modal-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should keep open when onConfirm returns false and render custom buttons', async () => {
        // onConfirm 返回 false 阻止关闭
        const onConfirm = vi.fn((): false => false);
        const instance = Modal.confirm({ title: 't', content: 'c', onConfirm });
        (document.querySelector('.solely-modal__btn--primary') as HTMLButtonElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();
        expect(onConfirm).toHaveBeenCalledTimes(1);

        instance.close();
        await waitClose();

        // 自定义按钮数组：渲染自定义文案，点击触发 onClick 且不自动关闭
        const onClick = vi.fn();
        Modal.open({
            title: 't',
            content: 'c',
            buttons: [{ text: '自定义', type: 'danger', onClick }],
        });
        const customBtn = document.querySelector('.solely-modal__footer .solely-modal__btn') as HTMLButtonElement;
        expect(customBtn.textContent).toBe('自定义');
        expect(customBtn.className).toContain('solely-modal__btn--danger');
        customBtn.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        // 自定义按钮不会自动关闭
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();
    });

    it('should accept HTMLElement content and update title/content at runtime', async () => {
        const node = document.createElement('div');
        node.textContent = 'DOM 内容';
        const instance = Modal.open({ title: 't', content: node });

        const contentEl = document.querySelector('.solely-modal__content')!;
        expect(contentEl.contains(node)).toBe(true); // 默认 cloneElement=false，直接挂载原节点

        instance.update({ title: '新标题', content: '新内容' });
        expect(document.querySelector('.solely-modal__title')!.textContent).toBe('新标题');
        expect(document.querySelector('.solely-modal__content')!.textContent).toBe('新内容');

        // 自定义宽度生效
        instance.update({ width: 800 });
        expect((document.querySelector('.solely-modal') as HTMLElement).style.width).toBe('800px');
    });
});
