import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RouterViewElement, IRouter } from '../src/base/router-view';
import * as utils from '../src/utils';

// --- 模拟依赖模块 ---
// parseHashUrl、patch、listeners 都模拟，方便测试
vi.mock('../src/utils', () => ({
  parseHashUrl: vi.fn((url) => ({
    path: new URL(url).hash.slice(1).split('/').filter(Boolean),
  })),
  patch: vi.fn((_element, newAst, _oldAst) => newAst),
  listeners: ['click', 'change'],
}));

describe('RouterViewElement', () => {
  let routerView: RouterViewElement;

  beforeEach(() => {
    // 确保自定义元素只注册一次
    if (!customElements.get('router-view')) {
      customElements.define('router-view', RouterViewElement);
    }
    routerView = document.createElement('router-view') as RouterViewElement;
    document.body.appendChild(routerView);
  });

  afterEach(() => {
    // 清理 DOM 和恢复所有 spy/mock
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should define custom element and expose isRouterView property', () => {
    // 验证 router-view 自定义元素是否定义成功，并且有 isRouterView 属性
    expect(routerView.isRouterView).toBe(true);
  });

  it('should update and get $routes correctly when set', () => {
    // 设置 $routes 并验证触发 DOM 更新
    const routes: IRouter[] = [
      { path: '/home', tagName: 'app-home' },
      { path: '/user/:id', tagName: 'app-user' },
    ];
    const patchSpy = vi.spyOn(utils, 'patch');
    routerView.$routes = routes;
    expect(routerView.$routes).toEqual(routes);
    expect(patchSpy).toHaveBeenCalled();
  });

  it('should update when $pipe changes', () => {
    // 修改 $pipe 后应该重新渲染
    const patchSpy = vi.spyOn(utils, 'patch');
    routerView.$pipe = { test: 'value' };
    expect(patchSpy).toHaveBeenCalled();
  });

  it('should add hashchange listener on connectedCallback', () => {
    // 测试 connectedCallback 是否正确监听事件
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    routerView.connectedCallback();
    expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });

  it('should remove hashchange listener on disconnectedCallback', () => {
    // 测试 disconnectedCallback 是否移除事件监听
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    routerView.disconnectedCallback();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });

  it('should update route when hash changes (root route)', () => {
    // 根路由 hash 变化时正确更新匹配结果
    const mockParse = vi.mocked(utils.parseHashUrl);
    mockParse.mockReturnValue({ path: ['home'], query: {} });

    const routes: IRouter[] = [{ path: '/home', tagName: 'app-home' }];
    routerView.$routes = routes;

    // 手动触发 onHashChange 保证同步执行
    (routerView as any).onHashChange();

    expect(routerView.$matchedRoute).toEqual(routes[0]);
    expect(routerView.$remainingPath).toEqual([]);
  });

  it('should update child router-view when parent route changes', () => {
    // 父 router-view 改变时，子 router-view 同步更新
    const parentRouterView = document.createElement('router-view') as RouterViewElement;
    const childRouterView = routerView;
    parentRouterView.appendChild(childRouterView);
    document.body.appendChild(parentRouterView);

    const childRoutes: IRouter[] = [{ path: '/profile', tagName: 'app-profile' }];
    const parentRoutes: IRouter[] = [
      {
        path: '/user',
        tagName: 'app-user',
        children: childRoutes,
      },
    ];

    parentRouterView.$routes = parentRoutes;
    window.location.hash = '#/user/profile';
    window.dispatchEvent(new Event('hashchange'));

    expect(childRouterView.$matchedRoute).toEqual(childRoutes[0]);
  });

  it('should match static route correctly', () => {
    // 测试静态路径匹配
    const routes: IRouter[] = [
      { path: '/home', tagName: 'app-home' },
      { path: '/about', tagName: 'app-about' },
    ];
    const pathSegments = ['home'];
    const result = (routerView as any).matchRoute(routes, pathSegments);
    expect(result.matchedRoute).toEqual(routes[0]);
    expect(result.params).toEqual({});
  });

  it('should match dynamic route correctly', () => {
    // 测试动态路由参数（如 /user/:id）
    const routes: IRouter[] = [{ path: '/user/:id', tagName: 'app-user' }];
    const pathSegments = ['user', '123'];
    const result = (routerView as any).matchRoute(routes, pathSegments);
    expect(result.params).toEqual({ id: '123' });
  });

  it('should match wildcard route correctly', () => {
    // 测试通配符路由（如 /*）
    const routes: IRouter[] = [{ path: '/*', tagName: 'app-404' }];
    const pathSegments = ['unknown', 'path'];
    const result = (routerView as any).matchRoute(routes, pathSegments);
    expect(result.matchedRoute).toEqual(routes[0]);
    expect(result.remainingPath).toEqual([]);
  });

  it('should return null when no route matched', () => {
    // 测试未匹配任何路由时的返回
    const routes: IRouter[] = [{ path: '/home', tagName: 'app-home' }];
    const pathSegments = ['about'];
    const result = (routerView as any).matchRoute(routes, pathSegments);
    expect(result.matchedRoute).toBeNull();
  });

  it('should prepare props and events correctly in prepareComponentData', () => {
    // 测试组件属性与事件绑定的准备逻辑
    const params = { id: '123' };
    const pipe = { test: 'value', onClick: vi.fn() }; // 保存引用
    routerView.$pipe = pipe;

    const result = (routerView as any).prepareComponentData(params);

    expect(result.props).toHaveProperty('id');
    expect(result.props.id()).toBe('123');
    expect(result.props).toHaveProperty('test');
    expect(result.props.test()).toBe('value');
    expect(result.on).toHaveProperty('click');
    expect(result.on.click).toBe(pipe.onClick);
  });

  it('should find ancestor router-view correctly', () => {
    // 测试 findAncestorRouterView 找到父 router-view
    const parentRouterView = document.createElement('router-view') as RouterViewElement;
    document.body.appendChild(parentRouterView);
    parentRouterView.appendChild(routerView);
    const result = (routerView as any).findAncestorRouterView();
    expect(result).toBe(parentRouterView);
  });

  it('should return null if no ancestor router-view found', () => {
    // 测试无父 router-view 时返回 null
    const result = (routerView as any).findAncestorRouterView();
    expect(result).toBeNull();
  });

  // ===== 补充边界测试 =====

  it('should correctly handle remainingPath for partial match', () => {
    // 部分匹配时 remainingPath 正确切割
    const routes: IRouter[] = [
      { path: '/user/:id/profile', tagName: 'app-profile' },
    ];
    routerView.$routes = routes;

    const mockParse = vi.mocked(utils.parseHashUrl);
    mockParse.mockReturnValue({
      path: ['user', '123', 'profile', 'extra'],
      query: {}
    });

    (routerView as any).onHashChange();

    expect(routerView.$matchedRoute).toEqual(routes[0]);
    expect(routerView.$remainingPath).toEqual(['extra']);
  });

  it('should handle different pipe event name formats', () => {
    // 测试管道事件命名多样性：onXxx / on-xxx / 普通属性
    const pipe = {
      onClick: vi.fn(),
      'on-mouseover': vi.fn(),
      normalProp: 'value',
    };
    routerView.$pipe = pipe;

    const result = (routerView as any).prepareComponentData({});

    expect(result.on.click).toBe(pipe.onClick);
    expect(result.on.mouseover).toBe(pipe['on-mouseover']);
    expect(result.props.normalProp()).toBe('value');
  });

  it('should handle unmatched route correctly', () => {
    // 未匹配路由时，$matchedRoute 应该为 null，并触发 patch
    const routes: IRouter[] = [{ path: '/home', tagName: 'app-home' }];
    const patchSpy = vi.spyOn(utils, 'patch');
    routerView.$routes = routes;

    const mockParse = vi.mocked(utils.parseHashUrl);
    mockParse.mockReturnValue({
      path: ['unknown'],
      query: {}
    });

    (routerView as any).onHashChange();

    // 核心断言：匹配结果为 null
    expect(routerView.$matchedRoute).toBeNull();
    // patch 被调用，说明渲染逻辑生效
    expect(patchSpy).toHaveBeenCalled();
  });

  it('should call patch when route changes', () => {
    // 当路由变化时，patch 被调用以更新 DOM
    const routes: IRouter[] = [{ path: '/home', tagName: 'app-home' }];

    routerView.$routes = routes;

    // 模拟 URL hash
    window.location.hash = '#/home';

    // mock parseHashUrl 保证返回对应路径
    const mockParse = vi.mocked(utils.parseHashUrl);
    mockParse.mockReturnValue({
      path: ['home'],
      query: {},
    });

    // spy patch 调用
    const patchSpy = vi.spyOn(utils, 'patch');

    // 触发 hashchange 逻辑
    (routerView as any).onHashChange();

    // 断言匹配到正确路由
    expect(routerView.$matchedRoute).toEqual(routes[0]);

    // 断言 patch 被调用
    expect(patchSpy).toHaveBeenCalled();
  });


});
