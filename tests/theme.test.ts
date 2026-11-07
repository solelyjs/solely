/**
 * 主题系统测试（浏览器 / jsdom 环境）
 *
 * 主题模块在导入时自动初始化（保存值 → 系统偏好作为首次默认值 → 浅色），
 * 并在 window 上注册 beforeunload 监听，把当前主题写回 localStorage。
 *
 * 由于模块内部维护 module 级状态（currentTheme），且每次导入都会新增一个
 * beforeunload 监听，因此每个用例都先 vi.resetModules() 再动态 import，
 * 并在用例结束后移除本次注册的监听，避免用例之间相互污染。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type ThemeModule = typeof import('../src/components/theme');

// jsdom 中 addEventListener 继承自 EventTarget.prototype，记录原始实现用于透传与清理
const realAddEventListener = window.addEventListener;
let beforeunloadHandlers: EventListener[] = [];

const clearThemeDom = () => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');

    const style = root.style;
    for (let i = style.length - 1; i >= 0; i--) {
        const name = style.item(i);
        if (name.startsWith('--solely-')) {
            style.removeProperty(name);
        }
    }
};

const stubMatchMedia = (matches: boolean) => {
    const matchMedia = vi.fn((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    return matchMedia;
};

const importTheme = async (): Promise<ThemeModule> => {
    vi.resetModules();
    return import('../src/components/theme');
};

const readSaved = () => {
    const raw = localStorage.getItem('solely-theme');
    return raw === null ? null : JSON.parse(raw);
};

describe('主题初始化优先级', () => {
    beforeEach(() => {
        beforeunloadHandlers = [];
        clearThemeDom();
        localStorage.clear();

        // 拦截 beforeunload 监听以便清理；其余事件透传给真实实现
        Object.defineProperty(window, 'addEventListener', {
            configurable: true,
            writable: true,
            value: (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) => {
                if (type === 'beforeunload' && typeof listener === 'function') {
                    beforeunloadHandlers.push(listener);
                }
                realAddEventListener.call(window, type, listener, options);
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();

        beforeunloadHandlers.forEach(h => window.removeEventListener('beforeunload', h));
        beforeunloadHandlers = [];

        // 删除用例中新增的 addEventListener 自有属性，恢复原型上的实现
        delete (window as unknown as Record<string, unknown>).addEventListener;

        clearThemeDom();
        localStorage.clear();
    });

    it('有保存值时优先使用保存值，忽略系统偏好（保存 dark / 系统 light）', async () => {
        stubMatchMedia(false);
        localStorage.setItem('solely-theme', JSON.stringify({ theme: 'dark' }));

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(theme.getTheme()).toEqual({ theme: 'dark' });
    });

    it('保存浅色时也不会被系统深色覆盖（保存 light / 系统 dark）', async () => {
        stubMatchMedia(true);
        localStorage.setItem('solely-theme', JSON.stringify({ theme: 'light' }));

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(theme.getTheme()).toEqual({ theme: 'light' });
    });

    it('保存值中的 colors 应写入 CSS 变量并保留在状态中', async () => {
        stubMatchMedia(false);
        localStorage.setItem(
            'solely-theme',
            JSON.stringify({ theme: 'dark', colors: { primary: '#123456', success: '#00ff00' } }),
        );

        const theme = await importTheme();

        const root = document.documentElement;
        expect(root.getAttribute('data-theme')).toBe('dark');
        expect(root.style.getPropertyValue('--solely-primary')).toBe('#123456');
        expect(root.style.getPropertyValue('--solely-success')).toBe('#00ff00');
        expect(theme.getTheme()).toEqual({ theme: 'dark', colors: { primary: '#123456', success: '#00ff00' } });
    });

    it('无保存值且系统偏好深色时使用深色', async () => {
        const matchMedia = stubMatchMedia(true);

        const theme = await importTheme();

        expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(theme.getTheme()).toEqual({ theme: 'dark' });
    });

    it('无保存值且系统偏好浅色时使用浅色', async () => {
        stubMatchMedia(false);

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(theme.getTheme()).toEqual({ theme: 'light' });
    });

    it('无 matchMedia（jsdom 默认）时导入与初始化不抛异常，落到浅色', async () => {
        expect(typeof window.matchMedia).toBe('undefined');

        let theme: ThemeModule | undefined;
        await expect(
            importTheme().then(m => {
                theme = m;
            }),
        ).resolves.toBeUndefined();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(theme!.getTheme()).toEqual({ theme: 'light' });
    });

    it('matchMedia 抛错时降级为浅色而不是中断导入', async () => {
        vi.stubGlobal('matchMedia', () => {
            throw new Error('matchMedia unavailable');
        });

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(theme.getTheme()).toEqual({ theme: 'light' });
    });

    it('localStorage 访问抛 SecurityError 时不抛异常，并回落到系统分支', async () => {
        stubMatchMedia(true); // 系统深色，用于证明仍走了系统分支
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('access denied', 'SecurityError');
        });

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(theme.getTheme()).toEqual({ theme: 'dark' });
    });
});

describe('畸形保存值', () => {
    beforeEach(() => {
        beforeunloadHandlers = [];
        clearThemeDom();
        localStorage.clear();

        Object.defineProperty(window, 'addEventListener', {
            configurable: true,
            writable: true,
            value: (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) => {
                if (type === 'beforeunload' && typeof listener === 'function') {
                    beforeunloadHandlers.push(listener);
                }
                realAddEventListener.call(window, type, listener, options);
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        beforeunloadHandlers.forEach(h => window.removeEventListener('beforeunload', h));
        beforeunloadHandlers = [];
        delete (window as unknown as Record<string, unknown>).addEventListener;
        clearThemeDom();
        localStorage.clear();
    });

    // 统一让系统偏好为深色，用于证明畸形值被当作“无保存值”回落到系统分支
    const malformedCases: Array<[string, string]> = [
        ['空对象 {}', '{}'],
        ['裸字符串 "dark"', '"dark"'],
        ['theme 非法 blue', JSON.stringify({ theme: 'blue' })],
        ['坏 JSON', '{oops'],
        ['null', 'null'],
        ['数组 []', '[]'],
        ['colors 非对象', JSON.stringify({ theme: 'dark', colors: 'red' })],
    ];

    it.each(malformedCases)('%s 视为无保存值，不产生 data-theme="undefined" 且不污染状态', async (_label, raw) => {
        stubMatchMedia(true);
        localStorage.setItem('solely-theme', raw);

        const theme = await importTheme();

        const root = document.documentElement;
        expect(root.getAttribute('data-theme')).toBe('dark'); // 回落到系统分支
        expect(root.getAttribute('data-theme')).not.toBe('undefined');
        expect(theme.getTheme()).toEqual({ theme: 'dark' });
        expect(theme.getTheme()).not.toHaveProperty('colors');
        expect(root.style.getPropertyValue('--solely-primary')).toBe('');
    });

    it('含多余字段时只保留合法字段，不把脏数据带入状态', async () => {
        localStorage.setItem(
            'solely-theme',
            JSON.stringify({ theme: 'dark', foo: 'bar', extra: 1, colors: { primary: '#111111' } }),
        );

        const theme = await importTheme();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.style.getPropertyValue('--solely-primary')).toBe('#111111');
        expect(theme.getTheme()).toEqual({ theme: 'dark', colors: { primary: '#111111' } });
        expect(theme.getTheme()).not.toHaveProperty('foo');
        expect(theme.getTheme()).not.toHaveProperty('extra');
    });
});

describe('主题持久化', () => {
    beforeEach(() => {
        beforeunloadHandlers = [];
        clearThemeDom();
        localStorage.clear();

        Object.defineProperty(window, 'addEventListener', {
            configurable: true,
            writable: true,
            value: (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) => {
                if (type === 'beforeunload' && typeof listener === 'function') {
                    beforeunloadHandlers.push(listener);
                }
                realAddEventListener.call(window, type, listener, options);
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        beforeunloadHandlers.forEach(h => window.removeEventListener('beforeunload', h));
        beforeunloadHandlers = [];
        delete (window as unknown as Record<string, unknown>).addEventListener;
        clearThemeDom();
        localStorage.clear();
    });

    it('beforeunload 触发时写回当前主题（默认浅色与 setTheme 后均正确）', async () => {
        const theme = await importTheme();
        expect(readSaved()).toBeNull();

        window.dispatchEvent(new Event('beforeunload'));
        expect(readSaved()).toEqual({ theme: 'light' });

        theme.setTheme({ theme: 'dark', colors: { primary: '#abcdef' } });
        window.dispatchEvent(new Event('beforeunload'));
        expect(readSaved()).toEqual({ theme: 'dark', colors: { primary: '#abcdef' } });
    });

    it('setItem 抛 QuotaExceededError 时事件回调不抛异常', async () => {
        await importTheme();

        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow();
        expect(setItem).toHaveBeenCalled();
        expect(readSaved()).toBeNull();
    });
});
