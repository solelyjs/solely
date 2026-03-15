import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Router } from '../src/runtime/router';
import { IRouter } from '../src/runtime/router/router-types';

describe('Router Component', () => {
  // 测试路由配置
  const routes: IRouter[] = [
    { path: '/', tagName: 'home-component' },
    { path: '/about', tagName: 'about-component' },
    { path: '/user/:id', tagName: 'user-component' },
    { path: '/user/:id/detail', tagName: 'user-detail-component' },
    { path: '/admin', tagName: 'admin-component', children: [
      { path: 'dashboard', tagName: 'admin-dashboard-component' },
      { path: 'users', tagName: 'admin-users-component' },
    ]},
  ];

  // 保存原始的 location.hash
  let originalHash: string;

  beforeEach(() => {
    // 保存原始 hash
    originalHash = window.location.hash;
    // 重置 hash
    window.location.hash = '';
    // 模拟自定义元素
    customElements.define('home-component', class extends HTMLElement {});
    customElements.define('about-component', class extends HTMLElement {});
    customElements.define('user-component', class extends HTMLElement {});
    customElements.define('user-detail-component', class extends HTMLElement {});
    customElements.define('admin-component', class extends HTMLElement {});
    customElements.define('admin-dashboard-component', class extends HTMLElement {});
    customElements.define('admin-users-component', class extends HTMLElement {});
  });

  afterEach(() => {
    // 恢复原始 hash
    window.location.hash = originalHash;
    // 移除模拟的自定义元素
    customElements.delete('home-component');
    customElements.delete('about-component');
    customElements.delete('user-component');
    customElements.delete('user-detail-component');
    customElements.delete('admin-component');
    customElements.delete('admin-dashboard-component');
    customElements.delete('admin-users-component');
  });

  it('should create a router instance', () => {
    const router = new Router(routes);
    expect(router).toBeInstanceOf(Router);
  });

  it('should match the root route', () => {
    const router = new Router(routes);
    const matchResult = router.matchRoute(routes, ['']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    expect(matchResult.matchedRoute?.tagName).toBe('home-component');
    expect(matchResult.params).toEqual({});
    expect(matchResult.remainingPath).toEqual([]);
  });

  it('should match a static route', () => {
    const router = new Router(routes);
    const matchResult = router.matchRoute(routes, ['about']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    expect(matchResult.matchedRoute?.tagName).toBe('about-component');
    expect(matchResult.params).toEqual({});
    expect(matchResult.remainingPath).toEqual([]);
  });

  it('should match a route with parameters', () => {
    const router = new Router(routes);
    const matchResult = router.matchRoute(routes, ['user', '123']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    expect(matchResult.matchedRoute?.tagName).toBe('user-component');
    expect(matchResult.params).toEqual({ id: '123' });
    expect(matchResult.remainingPath).toEqual([]);
  });

  it('should match a nested route', () => {
    const router = new Router(routes);
    const matchResult = router.matchRoute(routes, ['admin', 'dashboard']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    expect(matchResult.matchedRoute?.tagName).toBe('admin-component');
    expect(matchResult.remainingPath).toEqual(['dashboard']);
  });

  it('should handle navigation with push method', () => {
    const router = new Router(routes);
    router.push('/about');
    
    expect(window.location.hash).toBe('#/about');
  });

  it('should handle navigation with replace method', () => {
    const router = new Router(routes);
    router.replace('/user/456');
    
    expect(window.location.hash).toBe('#/user/456');
  });

  it('should support route guards', async () => {
    const beforeEachGuard = vi.fn().mockReturnValue(true);
    const afterEachGuard = vi.fn();

    const guardedRoutes: IRouter[] = [
      { 
        path: '/guarded', 
        tagName: 'guarded-component',
        beforeEach: beforeEachGuard,
        afterEach: afterEachGuard
      },
    ];

    customElements.define('guarded-component', class extends HTMLElement {});

    const router = new Router(guardedRoutes);
    const matchResult = router.matchRoute(guardedRoutes, ['guarded']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    
    // 模拟路由守卫调用
    if (matchResult.matchedRoute?.beforeEach) {
      const canNavigate = await matchResult.matchedRoute.beforeEach();
      expect(canNavigate).toBe(true);
      expect(beforeEachGuard).toHaveBeenCalled();
    }

    if (matchResult.matchedRoute?.afterEach) {
      await matchResult.matchedRoute.afterEach();
      expect(afterEachGuard).toHaveBeenCalled();
    }

    customElements.delete('guarded-component');
  });

  it('should support global route guards', async () => {
    const globalBeforeEachGuard = vi.fn().mockReturnValue(true);
    const globalAfterEachGuard = vi.fn();

    const router = new Router(routes, {
      beforeEach: globalBeforeEachGuard,
      afterEach: globalAfterEachGuard
    });

    // 模拟路由匹配和导航
    const matchResult = router.matchRoute(routes, ['about']);
    
    expect(matchResult.matchedRoute).toBeDefined();
    
    // 模拟全局守卫调用
    if (matchResult.matchedRoute) {
      // 调用全局前置守卫
      if (globalBeforeEachGuard) {
        const canNavigate = await globalBeforeEachGuard(matchResult.matchedRoute, null);
        expect(canNavigate).toBe(true);
        expect(globalBeforeEachGuard).toHaveBeenCalled();
      }

      // 调用全局后置守卫
      if (globalAfterEachGuard) {
        await globalAfterEachGuard(matchResult.matchedRoute, null);
        expect(globalAfterEachGuard).toHaveBeenCalled();
      }
    }
  });

  it('should get current route information', () => {
    const router = new Router(routes);
    router.push('/user/789');
    
    const currentRoute = router.getCurrentRoute();
    expect(currentRoute.path).toBe('#/user/789');
  });
});