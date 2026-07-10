import type { RouteConfig, RouteMatch, NavigationGuard, RouterOptions, NavigationResult } from './types';
import { IS_DEV } from '../shared/env';

let globalRouterInstance: Router | null = null;

// ── routerReady 内部状态 ──────────────────────────────
let routerResolver: ((value: Router) => void) | null = null;
let routerReadyPromise: Promise<Router> | null = null;

function getRouterReadyPromise(): Promise<Router> {
    if (globalRouterInstance) return Promise.resolve(globalRouterInstance);
    if (!routerReadyPromise) {
        routerReadyPromise = new Promise<Router>(resolve => {
            routerResolver = resolve;
        });
    }
    return routerReadyPromise;
}

/**
 * 路由器就绪 Promise（向后兼容）
 *
 * 支持两种用法：
 *   - await routerReady        // 旧版用法，直接 await 常量
 *   - await routerReady()      // 新版用法，函数调用
 *   - routerReady.then(...)    // Promise 链式调用
 */
export const routerReady: Promise<Router> & (() => Promise<Router>) = (() => {
    const callable = (): Promise<Router> => getRouterReadyPromise();

    // 代理 Promise 方法，使 callable 可被 await
    Object.defineProperties(callable, {
        then: {
            value: <TResult1 = Router, TResult2 = never>(
                onfulfilled?: ((value: Router) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): Promise<TResult1 | TResult2> => getRouterReadyPromise().then(onfulfilled, onrejected),
            writable: false,
            enumerable: false,
            configurable: true,
        },
        catch: {
            value: <TResult = never>(
                onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
            ): Promise<Router | TResult> => getRouterReadyPromise().catch(onrejected),
            writable: false,
            enumerable: false,
            configurable: true,
        },
        finally: {
            value: (onfinally?: (() => void) | null): Promise<Router> => getRouterReadyPromise().finally(onfinally),
            writable: false,
            enumerable: false,
            configurable: true,
        },
        [Symbol.toStringTag]: {
            value: 'Promise',
            writable: false,
            enumerable: false,
            configurable: true,
        },
    });

    return callable as Promise<Router> & (() => Promise<Router>);
})();

/**
 * 创建路由器实例（单例）
 */
export function createRouter(options: RouterOptions): Router {
    if (globalRouterInstance) return globalRouterInstance;
    globalRouterInstance = new Router(options);

    if (routerResolver) {
        routerResolver(globalRouterInstance);
    }
    routerResolver = null;
    routerReadyPromise = null;

    return globalRouterInstance;
}

/**
 * 获取路由器实例
 */
export function getRouter(): Router | null {
    return globalRouterInstance;
}

/**
 * 路由器类
 */
export class Router {
    private routes: RouteConfig[];
    private base: string;
    private mode: 'hash' | 'history';
    private beforeEachGuard?: NavigationGuard;
    private afterEachGuard?: (to: RouteMatch, from: RouteMatch | null) => void;
    private currentRoute: RouteMatch | null = null;
    private listeners: Set<() => void> = new Set();
    private componentCache = new Map<string, Promise<string | { tagName: string }>>();
    private keepAliveCache = new Map<string, HTMLElement>();
    private keepAliveKeys: string[] = [];
    private navigationId = 0;
    private maxKeepAlive: number | undefined;

    constructor(options: RouterOptions) {
        this.routes = options.routes;
        this.base = this.normalizeBase(options.base);
        this.mode = options.mode || 'history';
        this.beforeEachGuard = options.beforeEach;
        this.afterEachGuard = options.afterEach;
        this.maxKeepAlive = options.maxKeepAlive;
    }

    private normalizeBase(base?: string): string {
        let normalized = base || '/';
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
        return normalized;
    }

    private static readonly MAX_REDIRECTS = 20;

    // ── 核心匹配逻辑 ────────────────────────────────────
    public matchRoute(path: string = '/'): RouteMatch | null {
        return this.matchRouteInternal(path, new Set(), 0);
    }

    private matchRouteInternal(path: string, visited: Set<string>, redirectCount: number): RouteMatch | null {
        if (redirectCount >= Router.MAX_REDIRECTS) {
            if (IS_DEV) {
                console.error(`[Router] Too many redirects (max ${Router.MAX_REDIRECTS}), last path: ${path}`);
            }
            return null;
        }

        const normalizedSearchPath = this.normalizePath(path);

        if (visited.has(normalizedSearchPath)) {
            if (IS_DEV) {
                console.error(`[Router] Circular redirect detected: ${normalizedSearchPath}`);
            }
            return null;
        }
        visited.add(normalizedSearchPath);

        const [urlPath, queryStr] = normalizedSearchPath.split('?');
        const segments = urlPath.split('/').filter(Boolean);
        const query = this.parseQuery(queryStr);

        const result = this.recursiveMatch(this.routes, segments);

        if (result) {
            const leafMatched = result.matched[result.matched.length - 1];

            if (leafMatched.config.redirect) {
                return this.matchRouteInternal(leafMatched.config.redirect, visited, redirectCount + 1);
            }

            return {
                matched: result.matched,
                params: result.params,
                query: query,
                fullPath: normalizedSearchPath,
                meta: result.matched.reduce((acc, m) => ({ ...acc, ...(m.config.meta || {}) }), {}),
            };
        }
        return null;
    }

    private recursiveMatch(
        routes: RouteConfig[],
        remainingSegments: string[],
    ): { matched: { config: RouteConfig; params: Record<string, string> }[]; params: Record<string, string> } | null {
        const sortedRoutes = [...routes].sort((a, b) => this.calculateScore(b.path) - this.calculateScore(a.path));

        for (const route of sortedRoutes) {
            const routeSegments = route.path.split('/').filter(Boolean);
            const currentLevelParams: Record<string, string> = {};
            let isMatch = true;

            if (routeSegments.length === 0 && remainingSegments.length === 0) {
                return { matched: [{ config: route, params: {} }], params: {} };
            }

            for (let i = 0; i < routeSegments.length; i++) {
                const rSeg = routeSegments[i];
                const pSeg = remainingSegments[i];

                if (rSeg.startsWith(':')) {
                    if (!pSeg) {
                        isMatch = false;
                        break;
                    }
                    Object.defineProperty(currentLevelParams, rSeg.slice(1), {
                        value: pSeg,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
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

                if (nextSegments.length > 0 && route.children) {
                    const childMatch = this.recursiveMatch(route.children, nextSegments);
                    if (childMatch) {
                        return {
                            matched: [currentMatched, ...childMatch.matched],
                            params: { ...currentLevelParams, ...childMatch.params },
                        };
                    }
                } else if (nextSegments.length === 0 || routeSegments.includes('*')) {
                    return { matched: [currentMatched], params: currentLevelParams };
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
        params.forEach((value, key) => {
            Object.defineProperty(query, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        });
        return query;
    }

    private normalizePath(path: string = '/'): string {
        const safePath = path && typeof path === 'string' ? path : '/';
        const qIndex = safePath.indexOf('?');
        const pathname = qIndex === -1 ? safePath : safePath.slice(0, qIndex);
        const search = qIndex === -1 ? '' : safePath.slice(qIndex + 1);
        let normalized = pathname;
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        return search ? `${normalized}?${search}` : normalized;
    }

    // ── 导航逻辑 ────────────────────────────────────────
    public getPath(): string {
        let path: string;
        try {
            if (this.mode === 'hash') {
                path = window.location.hash.slice(1) || '/';
            } else {
                path = `${window.location.pathname}${window.location.search}`;
            }
        } catch {
            path = '/';
        }

        const safeBase = this.base || '/';
        if (safeBase !== '/' && (path === safeBase || path.startsWith(safeBase + '/'))) {
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

    public async navigate(
        path: string = '/',
        replace: boolean = false,
        fromEvent: boolean = false,
    ): Promise<NavigationResult> {
        const navId = ++this.navigationId;
        const safePath = this.normalizePath(path);

        const from = this.currentRoute;
        const to = this.matchRoute(safePath);

        if (!to) return { success: false, error: `No route matched: ${safePath}` };
        if (from && from.fullPath === to.fullPath) return { success: true };

        if (this.beforeEachGuard) {
            try {
                const result = await this.beforeEachGuard(to, from);
                if (navId !== this.navigationId) return { success: false, cancelled: true };
                if (result === false) return { success: false, cancelled: true };
                if (typeof result === 'string') return this.navigate(result, replace);
            } catch (error) {
                if (navId !== this.navigationId) return { success: false, cancelled: true };
                return { success: false, error: error instanceof Error ? error.message : 'Guard Error' };
            }
        }

        if (navId !== this.navigationId) return { success: false, cancelled: true };

        this.currentRoute = to;
        if (!fromEvent) this.updateBrowserHistory(safePath, replace);
        this.notifyListeners();
        if (this.afterEachGuard) this.afterEachGuard(to, from);

        return { success: true };
    }

    // ── 路径解析 ────────────────────────────────────────
    public resolve(path: string = '/'): string {
        const safePath = this.normalizePath(path);
        if (this.mode === 'hash') return `#${safePath}`;
        const basePrefix = this.base.endsWith('/') ? this.base.slice(0, -1) : this.base;
        return basePrefix === '/' ? safePath : basePrefix + safePath;
    }

    public get modeType(): 'hash' | 'history' {
        return this.mode;
    }

    public pushWithQuery(path: string = '/', query: Record<string, string>) {
        const queryString = new URLSearchParams(query).toString();
        const separator = path.includes('?') ? '&' : '?';
        return this.push(path + (queryString ? separator + queryString : ''));
    }

    public push(path: string = '/') {
        return this.navigate(path, false);
    }
    public replace(path: string = '/') {
        return this.navigate(path, true);
    }
    public back() {
        window.history.back();
    }
    public forward() {
        window.history.forward();
    }

    public listen(cb: () => void) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private notifyListeners() {
        this.listeners.forEach(cb => cb());
    }

    // ── 事件监听 ──────────────────────────────────────
    private isStarted = false;
    private handleRouteChange: (() => void) | null = null;

    public setupListeners(): void {
        if (this.isStarted) return;
        this.isStarted = true;

        this.handleRouteChange = () => {
            void this.navigate(this.getPath(), true, true);
        };

        if (this.mode === 'hash') {
            window.addEventListener('hashchange', this.handleRouteChange);
        } else {
            window.addEventListener('popstate', this.handleRouteChange);
        }

        if (this.mode === 'hash' && !window.location.hash) {
            window.location.hash = '/';
        }

        void this.navigate(this.getPath(), true);
    }

    // ── 销毁 ────────────────────────────────────────────
    public destroy(): void {
        if (this.handleRouteChange) {
            if (this.mode === 'hash') {
                window.removeEventListener('hashchange', this.handleRouteChange);
            } else {
                window.removeEventListener('popstate', this.handleRouteChange);
            }
            this.handleRouteChange = null;
        }
        this.isStarted = false;
        this.listeners.clear();
        this.componentCache.clear();
        this.keepAliveCache.clear();
        this.keepAliveKeys = [];
        this.currentRoute = null;
        globalRouterInstance = null;
    }

    public getCurrentRoute(): RouteMatch | null {
        return this.currentRoute;
    }

    // ── KeepAlive ───────────────────────────────────────
    public getKeepAlive(key: string): HTMLElement | undefined {
        const el = this.keepAliveCache.get(key);
        if (el) {
            const idx = this.keepAliveKeys.indexOf(key);
            if (idx !== -1) {
                this.keepAliveKeys.splice(idx, 1);
                this.keepAliveKeys.push(key);
            }
        }
        return el;
    }

    public setKeepAlive(key: string, el: HTMLElement): void {
        if (this.keepAliveCache.has(key)) {
            // key 已存在时更新缓存元素并调整访问顺序
            this.keepAliveCache.set(key, el);
            const idx = this.keepAliveKeys.indexOf(key);
            if (idx !== -1) {
                this.keepAliveKeys.splice(idx, 1);
                this.keepAliveKeys.push(key);
            }
        } else {
            this.keepAliveCache.set(key, el);
            this.keepAliveKeys.push(key);
            this.evictKeepAlive();
        }
    }

    public hasKeepAlive(key: string): boolean {
        return this.keepAliveCache.has(key);
    }

    private evictKeepAlive(): void {
        if (!this.maxKeepAlive) return;
        while (this.keepAliveKeys.length > this.maxKeepAlive) {
            const oldest = this.keepAliveKeys.shift();
            if (oldest) this.keepAliveCache.delete(oldest);
        }
    }

    // ── 组件预加载 ────────────────────────────────────
    private cacheKey(path: string): string {
        return this.normalizePath(path);
    }

    public prefetch(path: string): void {
        const route = this.matchRoute(path);
        if (!route) return;

        const key = this.cacheKey(route.fullPath);
        const leafRoute = route.matched[route.matched.length - 1];
        if (!leafRoute?.config.component) return;

        const componentLoader = leafRoute.config.component;
        if (typeof componentLoader !== 'function') return;
        if (this.componentCache.has(key)) return;

        const promise = componentLoader();
        this.componentCache.set(key, promise);
        promise.catch(() => {
            this.componentCache.delete(key);
        });
    }

    public getComponentFromCache(path: string): Promise<string | { tagName: string }> | undefined {
        return this.componentCache.get(this.cacheKey(path));
    }
}
