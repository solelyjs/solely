/**
 * Message 命令式组件测试
 *
 * 组件通过命令式 API（Message.info/success/...）直接把 DOM 渲染到 document.body，
 * 使用回调（onClose）和实例方法（close/update）而非 CustomEvent 作为“事件”。
 * 关闭动画时长为 ANIMATION_DURATION.NORMAL = 300ms。
 * 参考 tests/components/modal.test.ts 的定时器处理方式（真实定时器 + 等待）。
 *
 * 注意：Message 内部维护 module 级状态（消息列表、容器 Map、清理定时器）。
 * 为避免测试间相互污染（上一个测试遗留的已脱离 body 的容器被复用），
 * 每个用例通过 vi.resetModules() + 动态 import 获取全新模块实例。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MessageConfig } from '../../src/components/commands/message/types';

// 关闭动画 + 兜底，确保 DOM 已移除
const waitClose = () => new Promise<void>(r => setTimeout(r, 350));

// 每次用例使用独立模块实例，重置全局配置
const DEFAULT_CONFIG: Partial<MessageConfig> = {
    duration: 3000,
    maxCount: 5,
    gap: 8,
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
    placement: 'top',
};

// 动态导入得到的当前用例专属 Message 实例
let Message: typeof import('../../src/components/commands/message').Message;

describe('Message command component', () => {
    beforeEach(async () => {
        vi.resetModules(); // 丢弃上一个用例的模块实例，重置内部状态
        const mod = await import('../../src/components/commands/message');
        Message = mod.Message;
        document.body.innerHTML = ''; // 清空上一个用例遗留的 DOM
        Message.config(DEFAULT_CONFIG);
    });

    afterEach(async () => {
        await Message.destroy();
        document.body.innerHTML = '';
    });

    it('info() 应在 body 中渲染消息元素并包含正确内容', () => {
        const inst = Message.info('你好，世界');

        const container = document.querySelector('.solely-message-container');
        expect(container).not.toBeNull();

        const msg = document.querySelector('.solely-message');
        expect(msg).not.toBeNull();
        // 类型 class 映射
        expect(msg!.classList.contains('solely-message--info')).toBe(true);
        // 内容文本
        expect(msg!.querySelector('.solely-message__text')?.textContent).toBe('你好，世界');
        // 实例暴露 close / update 方法
        expect(typeof inst.close).toBe('function');
        expect(typeof inst.update).toBe('function');
    });

    it('不同 type 应渲染对应 class 与图标', () => {
        Message.success('成功');
        Message.warning('警告');
        Message.error('错误');
        const loading = Message.loading('加载中');

        expect(document.querySelectorAll('.solely-message').length).toBe(4);
        expect(document.querySelector('.solely-message--success')).not.toBeNull();
        expect(document.querySelector('.solely-message--warning')).not.toBeNull();
        expect(document.querySelector('.solely-message--error')).not.toBeNull();
        expect(document.querySelector('.solely-message--loading')).not.toBeNull();

        // success 图标为字符串 ✓
        expect(document.querySelector('.solely-message--success .solely-message__icon')?.textContent).toBe('✓');
        // loading 图标为旋转 spinner 元素
        expect(
            loading && document.querySelector('.solely-message--loading .solely-message__loading-spinner'),
        ).not.toBeNull();
    });

    it('duration 到期后消息自动关闭', async () => {
        Message.info('稍后消失', 200);
        expect(document.querySelectorAll('.solely-message').length).toBe(1);

        await new Promise<void>(r => setTimeout(r, 200 + 350));
        expect(document.querySelectorAll('.solely-message').length).toBe(0);
    });

    it('closable 消息显示关闭按钮，点击可手动关闭', async () => {
        const inst = Message.info('可关闭', { closable: true, duration: 0 });
        const msg = document.querySelector('.solely-message')!;
        const btn = msg.querySelector('.solely-message__close') as HTMLButtonElement;
        expect(btn).not.toBeNull();

        btn.click();
        await waitClose();
        expect(document.querySelectorAll('.solely-message').length).toBe(0);
        // 手动关闭的实例再次 close 不应抛错
        expect(() => inst.close()).not.toThrow();
    });

    it('消息关闭时应触发 onClose 回调', async () => {
        const onClose = vi.fn();
        Message.info('带回调', { duration: 100, onClose });

        await new Promise<void>(r => setTimeout(r, 100 + 350));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('loading 类型默认 duration=0，不会自动关闭', async () => {
        Message.loading('一直加载'); // duration 0，不自动关闭
        await new Promise<void>(r => setTimeout(r, 1000));
        expect(document.querySelectorAll('.solely-message').length).toBe(1);
    });

    it('同时存在的消息数量应被 maxCount 限制', async () => {
        for (let i = 0; i < 6; i++) {
            Message.info(`消息 ${i}`, 5000); // 长 duration，避免自动关闭干扰
        }
        // 第 6 条触发最旧一条关闭（其异步动画尚未完成）
        expect(document.querySelectorAll('.solely-message').length).toBe(6);

        await waitClose();
        expect(document.querySelectorAll('.solely-message').length).toBe(5);
    });

    it('update() 应能更新消息文本内容', () => {
        const inst = Message.info('原始文本');
        const msg = document.querySelector('.solely-message')!;
        expect(msg.querySelector('.solely-message__text')?.textContent).toBe('原始文本');

        inst.update('更新后的文本');
        expect(msg.querySelector('.solely-message__text')?.textContent).toBe('更新后的文本');
    });

    it('config() 应更新容器的位置偏移量', () => {
        Message.info('带配置');
        Message.config({ top: 50, placement: 'top' });

        const container = document.querySelector('.solely-message-container') as HTMLElement;
        expect(container).not.toBeNull();
        expect(container.style.top).toBe('50px');
    });

    it('open() 支持 description 辅助描述', () => {
        Message.open({ content: '主内容', description: '这是一段描述', type: 'info' });
        const msg = document.querySelector('.solely-message')!;
        expect(msg.querySelector('.solely-message__content')?.textContent).toContain('主内容');
        expect(msg.querySelector('.solely-message__description')?.textContent).toBe('这是一段描述');
    });
});
