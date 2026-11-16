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
        maskClosable: true,
        okText: '确定',
        cancelText: '取消',
    });
};

/**
 * jsdom 没有布局盒，overlay-stack 的可聚焦判定依赖 getClientRects() 非空。
 * 这里返回一个合成的矩形，才能验证“焦点进入浮层 / 关闭后还原”的真实行为
 * （与 tests/overlay-stack.test.ts 的 jsdom 处理方式一致）。
 */
const FAKE_RECT = { x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) };

describe('Modal command component', () => {
    let rectsSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rectsSpy = vi
            .spyOn(HTMLElement.prototype, 'getClientRects')
            .mockImplementation(() => [FAKE_RECT] as unknown as DOMRectList);
        resetConfig();
    });

    afterEach(async () => {
        await Modal.destroy();
        resetConfig();
        rectsSpy.mockRestore();
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
        expect(icon!.querySelector('svg.solely-linear-icon')).not.toBeNull();

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

    it('should support icon override and icon="" opt-out', async () => {
        Modal.info({ title: 't', content: 'c', icon: '★' });
        expect(document.querySelector('.solely-modal__icon')!.textContent).toBe('★');
        await Modal.destroy();

        // icon="" 明确不要图标，不渲染空占位
        Modal.info({ title: 't', content: 'c', icon: '' });
        expect(document.querySelector('.solely-modal__icon')).toBeNull();
        await Modal.destroy();

        // showIcon=false 优先级最高，即使传了 icon 也不渲染
        Modal.info({ title: 't', content: 'c', icon: '★', showIcon: false });
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

    it('onClose 覆盖确定与取消路径，并透传 onConfirm 结果', async () => {
        const onConfirm = vi.fn(() => ({ saved: true }));
        const onClose = vi.fn();
        Modal.confirm({ title: 't', content: 'c', onConfirm, onClose });

        (document.querySelector('.solely-modal__btn--primary') as HTMLButtonElement).click();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledWith({ saved: true });

        const onCloseCancel = vi.fn();
        Modal.confirm({ title: 't', content: 'c', onClose: onCloseCancel });
        (document.querySelector('.solely-modal__btn--default') as HTMLButtonElement).click();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onCloseCancel).toHaveBeenCalledTimes(1);
    });

    it('onConfirm 返回 false 时保持打开且不触发 onClose', async () => {
        const onClose = vi.fn();
        Modal.confirm({ title: 't', content: 'c', onConfirm: () => false, onClose });

        (document.querySelector('.solely-modal__btn--primary') as HTMLButtonElement).click();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('should close via instance.close()', async () => {
        const instance = Modal.open({ title: 't', content: 'c' });
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();

        instance.close();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
    });

    it('should close on mask click by default, honor maskClosable=false and keep confirm closed', async () => {
        // 默认 maskClosable = true（与 Drawer 统一），点击遮罩关闭并触发 onCancel
        const onCancel = vi.fn();
        Modal.open({ title: 't', content: 'c', onCancel });
        (document.querySelector('.solely-modal-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onCancel).toHaveBeenCalledTimes(1);

        // 显式 maskClosable = false，点击遮罩不关闭
        Modal.open({ title: 't', content: 'c', maskClosable: false });
        (document.querySelector('.solely-modal-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();

        await Modal.destroy();

        // 确认框保持安全默认：不响应遮罩点击
        Modal.confirm({ title: 't', content: 'c' });
        (document.querySelector('.solely-modal-mask') as HTMLElement).click();
        await waitClose();
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();
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

    it('should disable OK and dedupe clicks while async onConfirm is pending', async () => {
        let resolveConfirm!: () => void;
        const onConfirm = vi.fn(
            () =>
                new Promise<void>(resolve => {
                    resolveConfirm = resolve;
                }),
        );

        Modal.confirm({ title: 't', content: 'c', onConfirm });
        const okBtn = document.querySelector('.solely-modal__btn--primary') as HTMLButtonElement;

        okBtn.click();

        // pending：按钮 loading / disabled，二次点击不能再次执行回调
        expect(okBtn.disabled).toBe(true);
        expect(okBtn.getAttribute('aria-busy')).toBe('true');
        expect(okBtn.classList.contains('is-loading')).toBe(true);
        expect(onConfirm).toHaveBeenCalledTimes(1);

        okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        // await 期间不关闭
        expect(document.querySelector('.solely-modal-wrap')).not.toBeNull();

        resolveConfirm();
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onConfirm).toHaveBeenCalledTimes(1);
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

    it('should expose dialog semantics and move focus into the modal', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        Modal.open({ title: 't', content: 'c' });

        const dialog = document.querySelector('.solely-modal') as HTMLElement;
        expect(dialog.getAttribute('role')).toBe('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(document.activeElement).toBe(dialog);

        trigger.remove();
    });

    it('should close on Escape and restore focus to the trigger', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        const onClose = vi.fn();
        Modal.open({ title: 't', content: 'c', onClose });

        const dialog = document.querySelector('.solely-modal') as HTMLElement;
        expect(document.activeElement).toBe(dialog);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await waitClose();

        expect(document.querySelector('.solely-modal-wrap')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(trigger);

        trigger.remove();
    });

    it('should only close the topmost modal on Escape', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        Modal.open({ title: 'first', content: '1' });
        const firstDialog = document.querySelector('.solely-modal') as HTMLElement;

        Modal.open({ title: 'second', content: '2' });
        const secondDialog = document.querySelectorAll('.solely-modal')[1] as HTMLElement;
        expect(document.activeElement).toBe(secondDialog);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await waitClose();

        // 只关闭最上层，焦点回到下层弹层
        expect(document.querySelectorAll('.solely-modal').length).toBe(1);
        expect(document.querySelector('.solely-modal__title')!.textContent).toBe('first');
        expect(document.activeElement).toBe(firstDialog);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await waitClose();

        expect(document.querySelectorAll('.solely-modal').length).toBe(0);
        expect(document.activeElement).toBe(trigger);

        trigger.remove();
    });

    it('should honor globalConfig.mask when options.mask is not provided', async () => {
        Modal.config({ mask: false });
        Modal.open({ title: 't', content: 'c' });
        expect(document.querySelector('.solely-modal-mask')).toBeNull();
    });
});
