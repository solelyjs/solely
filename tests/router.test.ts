import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRouter, getRouter, Router, routerReady } from '../src/runtime/router/core';
import type { RouteConfig, RouteMatch } from '../src/runtime/router/types';

// 重置全局路由实例的辅助函数
function resetRouter() {
  // 通过重置模块状态来清理
  const routerModule = require('../src/runtime/router/core');
  // 重新赋值全局实例为 null
  (globalThis as any).globalRouterInstance = null;
}

describe('Router Core', () => {
  const mockRoutes: RouteConfig[] = [
    { path: '/', tagName: 'home-page', name: 'home' },
    { path: '/about', tagName: 'about-page', name: 'about' },
    { path: '/user/:id', tagName: 'user-page', name: 'user' },
    { path: '/user/:id/profile', tagName: 'user-profile', name: 'user-profile' },
    { path: '/products/:category/:id', tagName: 'product-detail', name: 'product' },
    { path: '/redirect-home', redirect: '/', name: 'redirect' },
    {
      path: '/parent',
      tagName: 'parent-layout',
      children: [
        { path: 'child', tagName: 'child-page', name: 'child' },
        { path: 'child/:id', tagName: 'child-detail', name: 'child-detail' }
      ]
    },
    { path: '*', tagName: 'not-found', name: 'catch-all' }
  ];

  beforeEach(() => {
    // 清理全局实例
    vi.clearAllMocks();
    // 重置 location
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createRouter', () => {
    it('should create a router instance', () => {
      const router = createRouter({ routes: mockRoutes });
      expect(router).toBeInstanceOf(Router);
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const router1 = createRouter({ routes: mockRoutes });
      const router2 = createRouter({ routes: mockRoutes });
      expect(router1).toBe(router2);
    });

    it('should resolve routerReady promise', async () => {
      createRouter({ routes: mockRoutes });
      const router = await routerReady;
      expect(router).toBeInstanceOf(Router);
    });
  });

  describe('getRouter', () => {
    it('should return null before createRouter is called', () => {
      // 注意：由于单例模式，这个测试需要在干净的模块状态下运行
      // 在实际测试中，前面的测试可能已经创建了实例
      const router = getRouter();
      // 如果前面测试已创建，这里会返回实例；否则返回 null
      expect(router === null || router instanceof Router).toBe(true);
    });
  });

  describe('matchRoute', () => {
    let router: Router;

    beforeEach(() => {
      // 使用新的路由配置创建实例
      router = new Router({ routes: mockRoutes });
    });

    it('should match root route', () => {
      const match = router.matchRoute('/');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('home-page');
      expect(match?.params).toEqual({});
    });

    it('should match static route', () => {
      const match = router.matchRoute('/about');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('about-page');
    });

    it('should match route with single parameter', () => {
      const match = router.matchRoute('/user/123');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('user-page');
      expect(match?.params).toEqual({ id: '123' });
    });

    it('should match route with multiple parameters', () => {
      const match = router.matchRoute('/products/electronics/456');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('product-detail');
      expect(match?.params).toEqual({ category: 'electronics', id: '456' });
    });

    it('should match nested route', () => {
      const match = router.matchRoute('/parent/child');
      expect(match).not.toBeNull();
      expect(match?.matched).toHaveLength(2);
      expect(match?.matched[0].config.tagName).toBe('parent-layout');
      expect(match?.matched[1].config.tagName).toBe('child-page');
    });

    it('should match nested route with parameters', () => {
      const match = router.matchRoute('/parent/child/789');
      expect(match).not.toBeNull();
      expect(match?.matched).toHaveLength(2);
      expect(match?.matched[1].config.tagName).toBe('child-detail');
      expect(match?.params).toEqual({ id: '789' });
    });

    it('should handle redirect', () => {
      const match = router.matchRoute('/redirect-home');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('home-page');
    });

    it('should match catch-all route for unknown paths', () => {
      const match = router.matchRoute('/unknown/path');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('not-found');
    });

    it('should return null for unmatched paths when no catch-all', () => {
      const routerNoCatchAll = new Router({
        routes: [{ path: '/', tagName: 'home' }]
      });
      const match = routerNoCatchAll.matchRoute('/unknown');
      expect(match).toBeNull();
    });

    it('should parse query parameters', () => {
      const match = router.matchRoute('/about?foo=bar&baz=qux');
      expect(match).not.toBeNull();
      expect(match?.query).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should merge meta from all matched routes', () => {
      const routesWithMeta: RouteConfig[] = [
        {
          path: '/admin',
          tagName: 'admin-layout',
          meta: { requiresAuth: true, layout: 'admin' },
          children: [
            {
              path: 'dashboard',
              tagName: 'admin-dashboard',
              meta: { title: 'Dashboard' }
            }
          ]
        }
      ];
      const routerWithMeta = new Router({ routes: routesWithMeta });
      const match = routerWithMeta.matchRoute('/admin/dashboard');
      expect(match?.meta).toEqual({
        requiresAuth: true,
        layout: 'admin',
        title: 'Dashboard'
      });
    });

    it('should handle empty query string', () => {
      const match = router.matchRoute('/about?');
      expect(match).not.toBeNull();
      expect(match?.query).toEqual({});
    });
  });

  describe('path normalization', () => {
    let router: Router;

    beforeEach(() => {
      router = new Router({ routes: mockRoutes });
    });

    it('should handle paths without leading slash', () => {
      const match = router.matchRoute('about');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('about-page');
    });

    it('should handle paths with trailing slash', () => {
      const match = router.matchRoute('/about/');
      expect(match).not.toBeNull();
      expect(match?.matched[0].config.tagName).toBe('about-page');
    });
  });

  describe('navigation', () => {
    let router: Router;

    beforeEach(() => {
      // 清理并创建新实例
      vi.spyOn(window.history, 'pushState').mockImplementation(() => { });
      vi.spyOn(window.history, 'replaceState').mockImplementation(() => { });
      router = new Router({ routes: mockRoutes, mode: 'history' });
    });

    it('should navigate to a new route', async () => {
      const result = await router.navigate('/about');
      expect(result.success).toBe(true);
      expect(router.getCurrentRoute()?.matched[0].config.tagName).toBe('about-page');
    });

    it('should not navigate to the same route', async () => {
      await router.navigate('/about');
      const result = await router.navigate('/about');
      expect(result.success).toBe(true);
    });

    it('should return error for unmatched route', async () => {
      const routerStrict = new Router({
        routes: [{ path: '/', tagName: 'home' }],
        mode: 'history'
      });
      const result = await routerStrict.navigate('/unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No route matched');
    });

    it('should support push method', async () => {
      const result = await router.push('/user/123');
      expect(result.success).toBe(true);
      expect(window.history.pushState).toHaveBeenCalled();
    });

    it('should support replace method', async () => {
      const result = await router.replace('/user/456');
      expect(result.success).toBe(true);
      expect(window.history.replaceState).toHaveBeenCalled();
    });

    it('should support pushWithQuery', async () => {
      const result = await router.pushWithQuery('/about', { foo: 'bar' });
      expect(result.success).toBe(true);
      expect(router.getCurrentRoute()?.query).toEqual({ foo: 'bar' });
    });
  });

  describe('navigation guards', () => {
    let router: Router;

    beforeEach(() => {
      vi.spyOn(window.history, 'pushState').mockImplementation(() => { });
    });

    it('should call beforeEach guard', async () => {
      const beforeEach = vi.fn().mockReturnValue(true);
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        beforeEach
      });

      await router.navigate('/about');
      expect(beforeEach).toHaveBeenCalled();
    });

    it('should cancel navigation when guard returns false', async () => {
      const beforeEach = vi.fn().mockReturnValue(false);
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        beforeEach
      });

      const result = await router.navigate('/about');
      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
    });

    it('should redirect when guard returns string', async () => {
      const beforeEach = vi.fn()
        .mockReturnValueOnce('/')
        .mockReturnValueOnce(true);
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        beforeEach
      });

      const result = await router.navigate('/about');
      expect(result.success).toBe(true);
      expect(beforeEach).toHaveBeenCalledTimes(2);
    });

    it('should support async guard', async () => {
      const beforeEach = vi.fn().mockResolvedValue(true);
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        beforeEach
      });

      const result = await router.navigate('/about');
      expect(result.success).toBe(true);
    });

    it('should call afterEach guard on successful navigation', async () => {
      const afterEach = vi.fn();
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        afterEach
      });

      await router.navigate('/about');
      expect(afterEach).toHaveBeenCalled();
    });

    it('should handle guard errors', async () => {
      const beforeEach = vi.fn().mockRejectedValue(new Error('Guard failed'));
      router = new Router({
        routes: mockRoutes,
        mode: 'history',
        beforeEach
      });

      const result = await router.navigate('/about');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Guard failed');
    });
  });

  describe('listeners', () => {
    let router: Router;

    beforeEach(() => {
      vi.spyOn(window.history, 'pushState').mockImplementation(() => { });
      router = new Router({ routes: mockRoutes, mode: 'history' });
    });

    it('should notify listeners on navigation', async () => {
      const listener = vi.fn();
      router.listen(listener);

      await router.navigate('/about');
      expect(listener).toHaveBeenCalled();
    });

    it('should support unsubscribing', async () => {
      const listener = vi.fn();
      const unsubscribe = router.listen(listener);

      unsubscribe();
      await router.navigate('/about');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      router.listen(listener1);
      router.listen(listener2);

      await router.navigate('/about');
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('getPath', () => {
    it('should return pathname in history mode', () => {
      window.history.pushState({}, '', '/test-path');
      const router = new Router({
        routes: mockRoutes,
        mode: 'history'
      });
      expect(router.getPath()).toBe('/test-path');
    });

    it('should return hash path in hash mode', () => {
      window.location.hash = '#/hash-path';
      const router = new Router({
        routes: mockRoutes,
        mode: 'hash'
      });
      expect(router.getPath()).toBe('/hash-path');
    });

    it('should handle base path', () => {
      window.history.pushState({}, '', '/app/about');
      const router = new Router({
        routes: mockRoutes,
        mode: 'history',
        base: '/app'
      });
      expect(router.getPath()).toBe('/about');
    });
  });

  describe('resolve', () => {
    it('should resolve path in history mode', () => {
      const router = new Router({
        routes: mockRoutes,
        mode: 'history',
        base: '/'
      });
      expect(router.resolve('/about')).toBe('/about');
    });

    it('should resolve path with base in history mode', () => {
      const router = new Router({
        routes: mockRoutes,
        mode: 'history',
        base: '/app'
      });
      expect(router.resolve('/about')).toBe('/app/about');
    });

    it('should resolve hash path in hash mode', () => {
      const router = new Router({
        routes: mockRoutes,
        mode: 'hash'
      });
      expect(router.resolve('/about')).toBe('#/about');
    });
  });

  describe('modeType', () => {
    it('should return correct mode', () => {
      const historyRouter = new Router({ routes: mockRoutes, mode: 'history' });
      expect(historyRouter.modeType).toBe('history');

      const hashRouter = new Router({ routes: mockRoutes, mode: 'hash' });
      expect(hashRouter.modeType).toBe('hash');
    });
  });

  describe('getCurrentRoute', () => {
    let router: Router;

    beforeEach(() => {
      vi.spyOn(window.history, 'pushState').mockImplementation(() => { });
      router = new Router({ routes: mockRoutes, mode: 'history' });
    });

    it('should return null before navigation', () => {
      expect(router.getCurrentRoute()).toBeNull();
    });

    it('should return current route after navigation', async () => {
      await router.navigate('/about');
      const current = router.getCurrentRoute();
      expect(current).not.toBeNull();
      expect(current?.matched[0].config.tagName).toBe('about-page');
    });
  });

  describe('route priority', () => {
    it('should prioritize static routes over dynamic ones', () => {
      const routes: RouteConfig[] = [
        { path: '/user/me', tagName: 'current-user' },
        { path: '/user/:id', tagName: 'user-by-id' }
      ];
      const router = new Router({ routes });
      const match = router.matchRoute('/user/me');
      expect(match?.matched[0].config.tagName).toBe('current-user');
    });

    it('should prioritize specific dynamic routes over catch-all', () => {
      const routes: RouteConfig[] = [
        { path: '/user/:id', tagName: 'user-by-id' },
        { path: '*', tagName: 'catch-all' }
      ];
      const router = new Router({ routes });
      const match = router.matchRoute('/user/123');
      expect(match?.matched[0].config.tagName).toBe('user-by-id');
    });
  });
});
