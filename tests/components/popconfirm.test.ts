/**
 * Popconfirm 命令式组件测试
 * 覆盖 ARIA 语义、键盘可达性、关闭/销毁语义以及回调异常安全。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Popconfirm from '../../src/components/commands/popconfirm';

// 关闭动画 ANIMATION_DURATION.FAST = 200ms，多等一点确保 DOM 已移除
const waitClose = () => new Promise<void>(r => setTimeout(r, 250));

function createTarget(): HTMLButtonElement {
    const target = document.createElement('button');
    target.textContent = '触发';
    document.body.appendChild(target);
    target.focus();
    return target;
}

/**
 * jsdom 没有布局盒，overlay-stack 的可聚焦判定依赖 getClientRects() 非空。
 * 返回合成矩形才能验证焦点进入浮层与关闭后还原（与 overlay-stack.test.ts 一致）。
 */
const FAKE_RECT = { x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) };

describe('Popconfirm command component', () => {
    let rectsSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rectsSpy = vi
            .spyOn(HTMLElement.prototype, 'getClientRects')
            .mockImplementation(() => [FAKE_RECT] as unknown as DOMRectList);
    });

    afterEach(async () => {
        Popconfirm.destroy();
        await waitClose();
        document.body.innerHTML = '';
        rectsSpy.mockRestore();
    });

    it('should expose dialog semantics and associate title/description', () => {
        const target = createTarget();
        Popconfirm.show(target, { title: '确定删除吗？', description: '删除后无法恢复' });

        const popconfirm = document.querySelector('.solely-popconfirm') as HTMLElement;
        expect(popconfirm.getAttribute('role')).toBe('dialog');

        const title = popconfirm.querySelector('.solely-popconfirm__title') as HTMLElement;
        const description = popconfirm.querySelector('.solely-popconfirm__description') as HTMLElement;
        expect(title.id).toBeTruthy();
        expect(description.id).toBeTruthy();
        expect(popconfirm.getAttribute('aria-labelledby')).toBe(title.id);
        expect(popconfirm.getAttribute('aria-describedby')).toBe(description.id);

        // 打开后焦点进入浮层，按钮在 Tab 序列内
        expect(document.activeElement).toBe(popconfirm);
        const okBtn = popconfirm.querySelector('.solely-popconfirm__btn--ok') as HTMLButtonElement;
        expect(okBtn.tabIndex).toBe(0);
    });

    it('bind：激活另一个已绑定目标时直接切换到新 Popconfirm', () => {
        const first = createTarget();
        const second = createTarget();
        const firstInstance = Popconfirm.bind(first, { title: '第一个' });
        const secondInstance = Popconfirm.bind(second, { title: '第二个' });

        // 键盘 Enter / 程序化 click 不会先触发 mousedown 的外部关闭逻辑
        first.click();
        expect(document.querySelector('.solely-popconfirm__title')!.textContent).toBe('第一个');

        second.click();
        const popconfirms = document.querySelectorAll('.solely-popconfirm');
        expect(popconfirms.length).toBe(1);
        expect(popconfirms[0].querySelector('.solely-popconfirm__title')!.textContent).toBe('第二个');

        firstInstance.destroy();
        secondInstance.destroy();
    });

    it('overlay 不拦截页面点击，外部点击可关闭气泡', async () => {
        const target = createTarget();
        Popconfirm.show(target, { title: '外部点击测试' });

        const overlay = document.querySelector('.solely-popconfirm-overlay') as HTMLElement;
        const popconfirm = document.querySelector('.solely-popconfirm') as HTMLElement;
        // 全屏透明 overlay 不能吃掉其它按钮的点击
        expect(overlay.style.pointerEvents).toBe('none');
        expect(popconfirm.style.pointerEvents).toBe('auto');

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
    });

    it('should support icon override, icon="" and showIcon=false', () => {
        const t1 = createTarget();
        Popconfirm.show(t1, { title: '确定？', icon: '★' });
        expect(document.querySelector('.solely-popconfirm__icon')!.textContent).toBe('★');

        // icon="" 明确不要图标，不渲染空占位
        const t2 = createTarget();
        Popconfirm.show(t2, { title: '确定？', icon: '' });
        expect(document.querySelector('.solely-popconfirm__icon')).toBeNull();

        // showIcon=false 优先级最高，即使传了 icon 也不渲染
        const t3 = createTarget();
        Popconfirm.show(t3, { title: '确定？', icon: '★', showIcon: false });
        expect(document.querySelector('.solely-popconfirm__icon')).toBeNull();
    });

    it('should confirm via the OK button and restore focus to the target', async () => {
        const target = createTarget();
        const onConfirm = vi.fn();
        Popconfirm.show(target, { title: '确定？', onConfirm });

        const popconfirm = document.querySelector('.solely-popconfirm') as HTMLElement;
        const okBtn = popconfirm.querySelector('.solely-popconfirm__btn--ok') as HTMLButtonElement;
        okBtn.focus();
        expect(document.activeElement).toBe(okBtn);

        okBtn.click();

        expect(onConfirm).toHaveBeenCalledTimes(1);

        // 契约 D8：关闭动画结束后才释放浮层并还原焦点，动画期间不抢焦点
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
        expect(document.activeElement).toBe(target);
    });

    it('should close on Escape and restore focus', async () => {
        const target = createTarget();
        const onCancel = vi.fn();
        Popconfirm.show(target, { title: '确定？', onCancel });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(onCancel).toHaveBeenCalledTimes(1);

        // 契约 D8：动画结束后基座还原焦点
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
        expect(document.activeElement).toBe(target);
    });

    it('should keep close() animated but destroy() remove immediately', async () => {
        const target = createTarget();
        const instance = Popconfirm.show(target, { title: '确定？' });

        instance.close();
        expect(document.querySelector('.solely-popconfirm')).not.toBeNull();
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();

        const second = Popconfirm.show(target, { title: '确定？' });
        second.destroy();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
    });

    it('should not break the close flow when onConfirm throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const target = createTarget();
        const onConfirm = vi.fn(() => {
            throw new Error('boom');
        });

        Popconfirm.show(target, { title: '确定？', onConfirm });
        (document.querySelector('.solely-popconfirm__btn--ok') as HTMLButtonElement).click();

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalled();

        // 关闭流程仍正常执行（带动画，结束后还原焦点）
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
        expect(document.activeElement).toBe(target);

        errorSpy.mockRestore();
    });

    it('should stay open with loading while async onConfirm is pending and dedupe clicks', async () => {
        const target = createTarget();
        let resolveConfirm!: () => void;
        const onConfirm = vi.fn(
            () =>
                new Promise<void>(resolve => {
                    resolveConfirm = resolve;
                }),
        );

        Popconfirm.show(target, { title: '确定？', onConfirm });
        const okBtn = document.querySelector('.solely-popconfirm__btn--ok') as HTMLButtonElement;
        const cancelBtn = document.querySelector('.solely-popconfirm__btn--cancel') as HTMLButtonElement;

        okBtn.click();

        // pending：保持打开，按钮 loading / 不可重复触发
        expect(document.querySelector('.solely-popconfirm')).not.toBeNull();
        expect(okBtn.disabled).toBe(true);
        expect(cancelBtn.disabled).toBe(true);
        expect(okBtn.getAttribute('aria-busy')).toBe('true');
        expect(okBtn.classList.contains('is-loading')).toBe(true);
        expect(onConfirm).toHaveBeenCalledTimes(1);

        // 绕过 disabled 直接派发 click，验证组件自身的去重
        okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        // pending 期间 Esc 不应关闭
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.querySelector('.solely-popconfirm')).not.toBeNull();

        resolveConfirm();
        await waitClose();
        expect(document.querySelector('.solely-popconfirm')).toBeNull();
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should stay open and show failure info when async onConfirm rejects', async () => {
        const target = createTarget();
        let rejectConfirm!: (error: Error) => void;
        const onConfirm = vi.fn(
            () =>
                new Promise<void>((_, reject) => {
                    rejectConfirm = reject;
                }),
        );

        Popconfirm.show(target, { title: '确定？', onConfirm });
        const okBtn = document.querySelector('.solely-popconfirm__btn--ok') as HTMLButtonElement;
        okBtn.click();
        expect(okBtn.disabled).toBe(true);

        rejectConfirm(new Error('网络错误'));
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        const popconfirm = document.querySelector('.solely-popconfirm') as HTMLElement;
        expect(popconfirm).not.toBeNull();
        expect(popconfirm.classList.contains('solely-popconfirm--error')).toBe(true);

        const errorEl = document.querySelector('.solely-popconfirm__error') as HTMLElement;
        expect(errorEl.hidden).toBe(false);
        expect(errorEl.textContent).toContain('网络错误');
        expect(errorEl.getAttribute('role')).toBe('alert');

        // 恢复可交互，允许重试
        expect(okBtn.disabled).toBe(false);
        expect(okBtn.classList.contains('is-loading')).toBe(false);
    });
});
