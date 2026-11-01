import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Router } from '../src/router/core';

// Use a mutable container so vi.mock factory can reference it safely
const mockContainer: { router: Router | null; listeners: Array<() => void> } = {
    router: null,
    listeners: [],
};

vi.mock('../src/router/core', async () => {
    const actual = await vi.importActual<typeof import('../src/router/core')>('../src/router/core');
    return {
        ...actual,
        get routerReady() {
            const router = mockContainer.router!;
            const callable = () => Promise.resolve(router);
            return Object.assign(callable, {
                then: (onfulfilled?: any, onrejected?: any) => Promise.resolve(router).then(onfulfilled, onrejected),
                catch: (onrejected?: any) => Promise.resolve(router).catch(onrejected),
                finally: (onfinally?: any) => Promise.resolve(router).finally(onfinally),
                [Symbol.toStringTag]: 'Promise',
            });
        },
        getRouter() {
            return mockContainer.router;
        },
    };
});

// Import RouterView after mock setup
import RouterView from '../src/router/router-view';

describe('router-view', () => {
    beforeEach(() => {
        mockContainer.listeners = [];
        mockContainer.router = {
            getCurrentRoute: vi.fn(() => ({
                fullPath: '/home',
                params: {},
                query: {},
                matched: [{ config: { tagName: 'home-page' } }],
            })),
            push: vi.fn(),
            resolve: vi.fn(),
            prefetch: vi.fn(),
            // 与真实 Router 保持同形状：已就绪 → isReady() 立即 resolve
            isReady: vi.fn(() => Promise.resolve()),
            hasNavigated: true,
            isNavigating: false,
            listen: vi.fn((cb: () => void) => {
                mockContainer.listeners.push(cb);
                return () => {
                    const idx = mockContainer.listeners.indexOf(cb);
                    if (idx > -1) mockContainer.listeners.splice(idx, 1);
                };
            }),
            getComponentFromCache: vi.fn(),
        } as unknown as Router;
    });

    afterEach(() => {
        mockContainer.listeners = [];
        vi.restoreAllMocks();
    });

    it('should create router-view element', () => {
        const el = new RouterView();
        document.body.appendChild(el);

        expect(el.tagName.toLowerCase()).toBe('router-view');
        el.remove();
    });

    it('should render matched component', async () => {
        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).toContain('home-page');
        el.remove();
    });

    it('should show 404 text when no route matched and no notFound set', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/unknown',
            params: {},
            query: {},
            matched: [],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.textContent).toContain('404');
        el.remove();
    });

    it('should render notFound tag when settled without any match', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const el = new RouterView();
        el.setAttribute('not-found', 'not-found-page');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        // 已 settled 且 currentRoute 仍为 null → 这是真正的「无匹配」，渲染 404 组件
        expect(el.innerHTML).toContain('not-found-page');
        el.remove();
    });

    it('should not mount the loading placeholder when already settled without a match', async () => {
        const lifecycle: string[] = [];
        const tag = 'probe-skeleton';
        if (!customElements.get(tag)) {
            customElements.define(
                tag,
                class extends HTMLElement {
                    connectedCallback() {
                        lifecycle.push('mount');
                    }
                    disconnectedCallback() {
                        lifecycle.push('unmount');
                    }
                },
            );
        }

        // 共享 mock：hasNavigated = true 且 isReady() 立即 resolve → 已 settled、无匹配
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const el = new RouterView();
        el.setAttribute('loading', tag);
        el.setAttribute('not-found', 'not-found-page');
        document.body.appendChild(el);
        await new Promise(resolve => setTimeout(resolve, 10));

        // 占位组件不应被挂载再卸载（否则它的 mounted / 请求会白跑一次）
        expect(lifecycle).toEqual([]);
        expect(el.innerHTML).toContain('not-found-page');
        el.remove();
    });

    it('should render the loading placeholder while a later navigation is in flight', async () => {
        const readyPromise = new Promise<void>(() => {
            /* 永不 resolve，模拟导航仍在飞 */
        });
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);
        (mockContainer.router as unknown as { isReady: () => Promise<void> }).isReady = vi.fn(() => readyPromise);
        // hasNavigated 保持共享 mock 的 true：已经 settle 过（哪怕是无匹配），但又有导航在飞
        (mockContainer.router as unknown as { isNavigating: boolean }).isNavigating = true;

        const el = new RouterView();
        el.setAttribute('loading', 'boot-skeleton');
        document.body.appendChild(el);
        await new Promise(resolve => setTimeout(resolve, 10));

        // 同属「等待」状态，不该因为已经 settle 过就退化成空白
        expect(el.innerHTML).toContain('boot-skeleton');
        el.remove();
    });

    it('should not render 404 while the initial navigation is pending', async () => {
        let resolveReady!: () => void;
        const readyPromise = new Promise<void>(resolve => {
            resolveReady = resolve;
        });
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);
        (mockContainer.router as unknown as { isReady: () => Promise<void> }).isReady = vi.fn(() => readyPromise);
        // 与真实 Router 一致：isReady() 还在 pending 时 hasNavigated 必为 false
        (mockContainer.router as unknown as { hasNavigated: boolean }).hasNavigated = false;

        const el = new RouterView();
        document.body.appendChild(el);
        await new Promise(resolve => setTimeout(resolve, 10));

        // 启动中：既不渲染 404，也不残留任何内容
        expect(el.textContent).not.toContain('404');
        expect(el.innerHTML).toBe('');

        // 就绪后按真实路由渲染
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/home',
            params: {},
            query: {},
            matched: [{ config: { tagName: 'home-page' } }],
        });
        resolveReady();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).toContain('home-page');
        el.remove();
    });

    it('should render the loading placeholder while the initial navigation is pending', async () => {
        const readyPromise = new Promise<void>(() => {
            /* 永不 resolve，模拟长时间未就绪 */
        });
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);
        (mockContainer.router as unknown as { isReady: () => Promise<void> }).isReady = vi.fn(() => readyPromise);
        // 与真实 Router 一致：isReady() 还在 pending 时 hasNavigated 必为 false
        (mockContainer.router as unknown as { hasNavigated: boolean }).hasNavigated = false;

        const el = new RouterView();
        el.setAttribute('loading', 'boot-skeleton');
        document.body.appendChild(el);
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).toContain('boot-skeleton');
        expect(el.textContent).not.toContain('404');
        el.remove();
    });

    it('should not load an async route component twice when the listener already started loading', async () => {
        let resolveReady!: () => void;
        const readyPromise = new Promise<void>(resolve => {
            resolveReady = resolve;
        });
        const getCurrentRoute = mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>;
        getCurrentRoute.mockReturnValue(null);
        (mockContainer.router as unknown as { isReady: () => Promise<void> }).isReady = vi.fn(() => readyPromise);
        // 与真实 Router 一致：isReady() 还在 pending 时 hasNavigated 必为 false
        (mockContainer.router as unknown as { hasNavigated: boolean }).hasNavigated = false;

        const loader = vi.fn(async () => 'async-page');
        const el = new RouterView();
        document.body.appendChild(el);
        await new Promise(resolve => setTimeout(resolve, 10));

        // 复刻真实顺序：navigate 成功 → notifyListeners 先排一次加载 → 之后才 resolve isReady。
        // mounted() 恢复后不应再调一次 loadRoute（那会中止上一次的 AbortController 并重复执行 component()）
        getCurrentRoute.mockReturnValue({
            fullPath: '/async',
            params: {},
            query: {},
            matched: [{ config: { component: loader } }],
        });
        mockContainer.listeners.forEach(cb => cb());
        resolveReady();
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(loader).toHaveBeenCalledTimes(1);
        expect(el.innerHTML).toContain('async-page');
        el.remove();
    });

    it('should update on route change', async () => {
        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));
        expect(el.innerHTML).toContain('home-page');

        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/about',
            params: {},
            query: {},
            matched: [{ config: { tagName: 'about-page' } }],
        });

        mockContainer.listeners.forEach(cb => cb());
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).toContain('about-page');
        el.remove();
    });

    it('should handle async component loading', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/async',
            params: {},
            query: {},
            matched: [
                {
                    config: {
                        component: vi.fn(() => Promise.resolve({ tagName: 'async-page' })),
                    },
                },
            ],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(el.innerHTML).toContain('async-page');
        el.remove();
    });

    it('should handle async component load error', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/error',
            params: {},
            query: {},
            matched: [
                {
                    config: {
                        component: vi.fn(() => Promise.reject(new Error('load failed'))),
                    },
                },
            ],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(el.textContent).toContain('Load Error');
        el.remove();
    });

    it('should pass route params to component', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/user/123',
            params: { id: '123' },
            query: {},
            matched: [{ config: { tagName: 'user-page' } }],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        const userPage = el.querySelector('user-page');
        expect(userPage).not.toBeNull();
        expect(userPage!.getAttribute('id')).toBe('123');
        el.remove();
    });

    it('should pass query params to component', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/search?q=test',
            params: {},
            query: { q: 'test' },
            matched: [{ config: { tagName: 'search-page' } }],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        const searchPage = el.querySelector('search-page');
        expect(searchPage).not.toBeNull();
        expect(searchPage!.getAttribute('query-q')).toBe('test');
        el.remove();
    });

    it('should reuse component when tagName is same and forceReload is false', async () => {
        const route1 = {
            fullPath: '/user/123',
            params: { id: '123' },
            query: {},
            matched: [{ config: { tagName: 'user-page', forceReload: false } }],
        };
        const route2 = {
            fullPath: '/user/456',
            params: { id: '456' },
            query: {},
            matched: [{ config: { tagName: 'user-page', forceReload: false } }],
        };

        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(route1);

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));
        const firstPage = el.querySelector('user-page');
        expect(firstPage).not.toBeNull();
        expect(firstPage!.getAttribute('id')).toBe('123');

        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(route2);
        mockContainer.listeners.forEach(cb => cb());
        await new Promise(resolve => setTimeout(resolve, 10));

        const secondPage = el.querySelector('user-page');
        expect(secondPage).toBe(firstPage);
        expect(secondPage!.getAttribute('id')).toBe('456');
        el.remove();
    });

    it('should clear content when route is null', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/home',
            params: {},
            query: {},
            matched: [{ config: { tagName: 'home-page' } }],
        });

        const el = new RouterView();
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));
        expect(el.innerHTML).toContain('home-page');

        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);
        mockContainer.listeners.forEach(cb => cb());
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).not.toContain('home-page');
        el.remove();
    });
});
