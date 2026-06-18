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

    it('should handle empty route with notFound attribute', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const el = new RouterView();
        el.setAttribute('not-found', 'not-found-page');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.innerHTML).toContain('not-found-page');
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
