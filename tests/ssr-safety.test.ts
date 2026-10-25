// @vitest-environment node
/**
 * SSR / Node 环境冒烟测试
 *
 * 背景：jsdom 测试无法覆盖 Node 侧场景。曾经在 any 收敛改造中，
 * CustomElement 装饰器的 HTMLElement 检查被提取为变量，破坏了
 * `isBrowser &&` 的短路语义，导致 Node 下提前求值抛
 * `ReferenceError: HTMLElement is not defined`；sanitizeSvg 同样
 * 因缺少 DOMParser 守卫而崩溃。本文件锁定这两类回归。
 */
import { describe, it, expect } from 'vitest';

describe('SSR / Node safety', () => {
    it('should not throw when importing decorators in Node (no window/customElements/DOMParser)', async () => {
        // 验证全局环境确实是 Node 形态
        expect(typeof window).toBe('undefined');
        expect(typeof DOMParser).toBe('undefined');

        const mod = await import('../src/runtime/component/decorators');
        expect(typeof mod.CustomElement).toBe('function');
    });

    it('should apply CustomElement decorator in Node without ReferenceError', async () => {
        const { CustomElement } = await import('../src/runtime/component/decorators');

        // Node 下无 HTMLElement，用普通类验证装饰器不求值浏览器全局（isBrowser=false 时跳过检查）
        class Dummy {}

        expect(() => {
            CustomElement({ tagName: 'ssr-dummy', template: '<div></div>' } as never)(Dummy as never);
        }).not.toThrow();
    });

    it('should return empty string from sanitizeSvg in Node (no DOMParser)', async () => {
        const { sanitizeSvg } = await import('../src/shared/svg-sanitize');
        expect(sanitizeSvg('<path d="M0 0h8v8H0z"/>')).toBe('');
        expect(sanitizeSvg('<script>alert(1)</script>')).toBe('');
    });
});

describe('SSR / Node entry safety', () => {
    it('should import the main entry without DOM globals', async () => {
        expect(typeof window).toBe('undefined');
        expect(typeof HTMLElement).toBe('undefined');

        const mod = await import('../src/index');

        expect(typeof mod.BaseElement).toBe('function');
        expect(typeof mod.CustomElement).toBe('function');
        expect(typeof mod.buildIR).toBe('function');
        expect(typeof mod.createRouter).toBe('function');
        expect(typeof mod.observe).toBe('function');
    });

    it('should import the compiler entry without DOM globals', async () => {
        const mod = await import('../src/compiler/index');

        expect(typeof mod.parseHtml).toBe('function');
        expect(typeof mod.buildIR).toBe('function');
    });
});

describe('SSR / Node component entry safety', () => {
    it('should import command and element component entries without DOM globals', async () => {
        const commands = await import('../src/components/commands/index');
        const elements = await import('../src/components/elements/index');

        expect(typeof commands.Message.info).toBe('function');
        expect(typeof commands.Modal.confirm).toBe('function');
        expect(typeof elements.SolelyButton).toBe('function');
    });
});
