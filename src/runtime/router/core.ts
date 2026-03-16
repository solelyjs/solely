import type {
  RouteConfig,
  RouteMatch,
  NavigationGuard,
  RouterOptions,
  NavigationResult
} from './types';

let globalRouterInstance: Router | null = null;
let routerResolver: (value: Router) => void;

export const routerReady = new Promise<Router>((resolve) => {
  routerResolver = resolve;
});

export function createRouter(options: RouterOptions): Router {
  if (globalRouterInstance) return globalRouterInstance;
  globalRouterInstance = new Router(options);

  // 核心：一旦实例化，立即解开 Promise
  routerResolver(globalRouterInstance);

  return globalRouterInstance;
}

export function getRouter(): Router | null {
  return globalRouterInstance;
}

export class Router {
  private routes: RouteConfig[];
  private base: string;
  private mode: 'hash' | 'history';
  private beforeEachGuard?: NavigationGuard;
  private afterEachGuard?: (to: RouteMatch, from: RouteMatch) => void;
  private currentRoute: RouteMatch | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(options: RouterOptions) {
    this.routes = options.routes;
    this.base = options.base ?? '/';
    this.mode = options.mode || 'history';
    this.beforeEachGuard = options.beforeEach;
    this.afterEachGuard = options.afterEach;
  }

  // --- 核心匹配逻辑 ---
  public matchRoute(path: string = '/'): RouteMatch | null {
    // 确保路径以 / 开头
    const normalizedSearchPath = path.startsWith('/') ? path : '/' + path;
    const [urlPath, queryStr] = normalizedSearchPath.split('?');
    const segments = urlPath.split('/').filter(Boolean);
    const query = this.parseQuery(queryStr);

    const result = this.recursiveMatch(this.routes, segments);

    if (result) {
      const leafMatched = result.matched[result.matched.length - 1];

      // 处理重定向 (注意此时取 leafMatched.config)
      if (leafMatched.config.redirect) {
        return this.matchRoute(leafMatched.config.redirect);
      }

      return {
        matched: result.matched, // 这里的结构已经是 [{config, params}, ...]
        params: result.params,   // 全局合并后的 params
        query: query,
        fullPath: normalizedSearchPath,
        // 合并所有层级的 meta
        meta: result.matched.reduce((acc, m) => ({ ...acc, ...(m.config.meta || {}) }), {})
      };
    }
    return null;
  }

  private recursiveMatch(
    routes: RouteConfig[],
    remainingSegments: string[]
  ): { matched: { config: RouteConfig; params: Record<string, string> }[]; params: Record<string, string> } | null {

    // 排序优先级逻辑保持不变
    const sortedRoutes = [...routes].sort((a, b) => this.calculateScore(b.path) - this.calculateScore(a.path));

    for (const route of sortedRoutes) {
      const routeSegments = route.path.split('/').filter(Boolean);
      const currentLevelParams: Record<string, string> = {};
      let isMatch = true;

      // 处理根路径匹配
      if (routeSegments.length === 0 && remainingSegments.length === 0) {
        return {
          matched: [{ config: route, params: {} }],
          params: {}
        };
      }

      // 段匹配逻辑
      for (let i = 0; i < routeSegments.length; i++) {
        const rSeg = routeSegments[i];
        const pSeg = remainingSegments[i];

        if (rSeg.startsWith(':')) {
          if (!pSeg) { isMatch = false; break; }
          currentLevelParams[rSeg.slice(1)] = pSeg;
        } else if (rSeg === '*') {
          isMatch = true;
          break;
        } else if (rSeg !== pSeg) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        const consumedCount = routeSegments.length;
        const nextSegments = remainingSegments.slice(consumedCount);

        const currentMatched = { config: route, params: currentLevelParams };

        // 如果还有剩余段且有子路由，递归匹配
        if (nextSegments.length > 0 && route.children) {
          const childMatch = this.recursiveMatch(route.children, nextSegments);
          if (childMatch) {
            return {
              matched: [currentMatched, ...childMatch.matched],
              params: { ...currentLevelParams, ...childMatch.params } // 全局合并 params
            };
          }
        }
        // 匹配完全结束或遇到通配符
        else if (nextSegments.length === 0 || routeSegments.includes('*')) {
          return {
            matched: [currentMatched],
            params: currentLevelParams
          };
        }
      }
    }
    return null;
  }

  private calculateScore(path: string = '/'): number {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return 1;
    return segments.reduce((score, seg) => {
      if (seg.startsWith(':')) return score + 5;
      if (seg === '*') return score + 0;
      return score + 10;
    }, 0);
  }

  private parseQuery(queryStr: string): Record<string, string> {
    const query: Record<string, string> = {};
    if (!queryStr) return query;
    const params = new URLSearchParams(queryStr);
    params.forEach((value, key) => { query[key] = value; });
    return query;
  }

  private normalizePath(path: string = '/'): string {
    // 确保字符串类型
    let safePath = path && typeof path === 'string' ? path : '/';
    // 以 / 开头
    if (!safePath.startsWith('/')) safePath = '/' + safePath;
    // 去掉末尾多余 /
    if (safePath.length > 1 && safePath.endsWith('/')) {
      safePath = safePath.slice(0, -1);
    }
    return safePath;
  }

  // --- 导航逻辑  ---
  public getPath(): string {
    let path: string;
    try {
      path = this.mode === 'hash'
        ? (window.location.hash.slice(1) || '/')
        : window.location.pathname || '/';
    } catch {
      path = '/';
    }

    const safeBase = this.base || '/';
    if (safeBase !== '/' && path.startsWith(safeBase)) {
      path = path.slice(safeBase.length) || '/';
    }

    return this.normalizePath(path);
  }

  private updateBrowserHistory(path: string = '/', replace: boolean): void {
    const safePath = this.normalizePath(path);
    const safeBase = this.base || '/';

    if (this.mode === 'hash') {
      if (replace) window.location.replace(`#${safePath}`);
      else window.location.hash = safePath;
    } else {
      const basePrefix = safeBase.endsWith('/') ? safeBase.slice(0, -1) : safeBase;
      const fullPath = basePrefix === '/' ? safePath : basePrefix + safePath;

      if (replace) window.history.replaceState({ path: fullPath }, '', fullPath);
      else window.history.pushState({ path: fullPath }, '', fullPath);
    }
  }

  /**
   * @param fromEvent 标志位：是否由浏览器 popstate 事件触发
   */
  public async navigate(path: string = '/', replace: boolean = false, fromEvent: boolean = false): Promise<NavigationResult> {
    const safePath = this.normalizePath(path);

    const from = this.currentRoute;
    const to = this.matchRoute(safePath);

    if (!to) return { success: false, error: `No route matched: ${safePath}` };

    if (from && from.fullPath === to.fullPath) return { success: true };

    if (this.beforeEachGuard) {
      try {
        const result = await this.beforeEachGuard(to, from!);
        if (result === false) return { success: false, cancelled: true };
        if (typeof result === 'string') return this.navigate(result, replace);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Guard Error' };
      }
    }

    this.currentRoute = to;

    if (!fromEvent) this.updateBrowserHistory(safePath, replace);

    this.notifyListeners();
    if (this.afterEachGuard) this.afterEachGuard(to, from!);

    return { success: true };
  }


  // --- 路径解析逻辑 ---

  /**
   * 将逻辑路径解析为浏览器真实的 URL 路径
   * 供 RouterLink 等组件生成 href 使用
   */
  public resolve(path: string = '/'): string {
    const safePath = this.normalizePath(path);

    if (this.mode === 'hash') return `#${safePath}`;

    const basePrefix = this.base.endsWith('/') ? this.base.slice(0, -1) : this.base;
    return basePrefix === '/' ? safePath : basePrefix + safePath;
  }

  /**
   * 获取当前模式（供外部组件判断，如 RouterLink）
   */
  public get modeType(): 'hash' | 'history' {
    return this.mode;
  }

  public pushWithQuery(path: string = '/', query: Record<string, string>) {
    const queryString = new URLSearchParams(query).toString();
    const separator = path.includes('?') ? '&' : '?';
    return this.push(path + (queryString ? separator + queryString : ''));
  }

  public push(path: string = '/') { return this.navigate(path, false); }
  public replace(path: string = '/') { return this.navigate(path, true); }
  public back() { window.history.back(); }
  public listen(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners() { this.listeners.forEach(cb => cb()); }


  private isStarted = false;
  public setupListeners(): void {
    if (this.isStarted) return; // 已经启动过了，直接返回
    const handlePopState = () => {
      // 传入 true，告知 navigate 此次导航来自系统事件
      this.navigate(this.getPath(), true, true);
    };

    window.addEventListener('popstate', handlePopState);

    if (this.mode === 'hash' && !window.location.hash) {
      window.location.hash = '/';
    }

    // 初次启动导航
    this.navigate(this.getPath(), true);
  }

  public getCurrentRoute(): RouteMatch | null { return this.currentRoute; }
}