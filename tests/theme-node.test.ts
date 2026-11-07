// @vitest-environment node
/**
 * 主题系统在 Node / SSR 环境的冒烟测试
 *
 * 主题模块依靠 `typeof window !== 'undefined'` 判断是否自动初始化与注册监听。
 * Node 下既没有 window 也没有 document，导入和调用 API 都必须安全，
 * 且 setTheme 只更新内部状态、不触碰 DOM。
 */
import { describe, it, expect } from 'vitest';

describe('主题系统在 Node 环境', () => {
    it('导入时不抛异常，也不触发自动初始化（保持默认浅色）', async () => {
        expect(typeof window).toBe('undefined');
        expect(typeof document).toBe('undefined');

        const theme = await import('../src/components/theme');

        expect(typeof theme.setTheme).toBe('function');
        expect(typeof theme.initTheme).toBe('function');
        expect(typeof theme.persistTheme).toBe('function');
        expect(theme.getTheme()).toEqual({ theme: 'light' });
    });

    it('setTheme / initTheme / toggleTheme / persistTheme 可安全调用且只更新状态', async () => {
        const theme = await import('../src/components/theme');

        expect(() => theme.setTheme({ theme: 'dark', colors: { primary: '#000000' } })).not.toThrow();
        expect(theme.getTheme()).toEqual({ theme: 'dark', colors: { primary: '#000000' } });

        // setTheme 采用合并语义：initTheme 只重置 theme，已设置的 colors 会保留
        expect(() => theme.initTheme()).not.toThrow();
        expect(theme.getTheme()).toEqual({ theme: 'light', colors: { primary: '#000000' } });

        expect(() => theme.toggleTheme()).not.toThrow();
        expect(theme.getTheme()).toEqual({ theme: 'dark', colors: { primary: '#000000' } });

        expect(() => theme.persistTheme()).not.toThrow();
    });
});
