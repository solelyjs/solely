import { BaseElement, CustomElement } from '../runtime/component';
import type { RouteConfig, RouteMatch } from './types';
import { Router, routerReady } from './core';

// 全局缓存，所有 router-view 实例共享，支持跨实例 keepAlive
const globalKeepAliveCache = new Map<string, HTMLElement>();

@CustomElement({
    tagName: 'router-view',
    // 注意：删除了 shadowDOM 配置，默认为 false
})
class RouterView extends BaseElement {
    private unsubscribe?: () => void;
    private level = 0;
    private currentElement: HTMLElement | null = null;
    private currentTagName: string | null = null;

    private routerAttrs = new Set<string>();
    private prevPropKeys = new Set<string>();

    private scheduled = false;
    private latestLoadId = 0;
    private abortController: AbortController | null = null;

    /* -------------------- 生命周期 -------------------- */

    private router: Router | null = null;

    async mounted() {
        this.detectLevel();
        this.router = await routerReady;

        this.unsubscribe = this.router.listen(() => {
            this.scheduleLoad();
        });

        this.loadRoute(this.router.getCurrentRoute());
    }

    unmounted() {
        this.unsubscribe?.();
        // 注意：不清除全局 keepAlive 缓存，以支持嵌套路由跨实例保活
    }

    /* -------------------- 逻辑核心 -------------------- */

    private scheduleLoad() {
        if (!this.router) return;
        const route = this.router;
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            // 重新获取当前路由，确保是最新的
            this.loadRoute(route.getCurrentRoute());
        });
    }

    private detectLevel() {
        let level = 0;
        let node = this.parentElement;
        while (node) {
            if (node instanceof RouterView) level++;
            node = node.parentElement;
        }
        this.level = level;
    }

    public async loadRoute(route: RouteMatch | null) {
        // 立即取消之前的异步加载
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        const loadId = ++this.latestLoadId;
        const matched = route?.matched[this.level];

        if (!matched) {
            this.handleEmptyRoute();
            return;
        }

        const { config } = matched;
        let tagName = config.tagName;

        // 异步组件处理
        if (!tagName && typeof config.component === 'function') {
            // 先清空，准备显示 Loading
            this.clear();
            this.renderLoading();
            // 创建新的 AbortController
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            try {
                let result: string | { tagName: string };

                // 优先从缓存获取组件（避免重复加载）
                const cached = this.router?.getComponentFromCache?.(route?.fullPath);
                if (cached) {
                    result = await cached;
                } else {
                    result = await config.component();
                }

                // 检查是否已被取消
                if (signal.aborted || loadId !== this.latestLoadId) {
                    return;
                }
                tagName = typeof result === 'string' ? result : result.tagName;
            } catch (err) {
                // 检查是否已被取消
                if (signal.aborted || loadId !== this.latestLoadId) {
                    return;
                }
                this.renderError(`Load Error: ${err}`);
                // 标记当前显示的是错误状态
                this.currentElement = null;
                this.currentTagName = null;
                return;
            } finally {
                // 清理 abortController
                if (this.abortController && !signal.aborted) {
                    this.abortController = null;
                }
            }
        }

        if (loadId !== this.latestLoadId) return;
        if (!tagName) {
            this.clear();
            return;
        }

        // 复用逻辑 - 如果组件类型没变，只更新状态，不清空重新创建
        if (!config.forceReload && this.currentElement && this.currentTagName === tagName.toLowerCase()) {
            this.syncState(this.currentElement, route?.params, route?.query || {}, config.props);
            return;
        }

        // 组件类型变化，需要切换 - 先清理旧组件
        this.clear();

        const el = this.getOrCreateComponent(tagName, config);
        this.syncState(el, route?.params, route?.query || {}, config.props);

        this.appendChild(el); // 直接 append 到 this (Host) 之下
        this.currentElement = el;
        this.currentTagName = tagName.toLowerCase();
    }

    private getOrCreateComponent(tagName: string, config: RouteConfig): HTMLElement {
        const key = `${this.level}-${tagName.toLowerCase()}`;
        if (config.keepAlive && globalKeepAliveCache.has(key)) {
            const cached = globalKeepAliveCache.get(key);
            if (cached) return cached;
        }
        const el = document.createElement(tagName);
        if (config.keepAlive) globalKeepAliveCache.set(key, el);
        return el;
    }

    private syncState(
        el: HTMLElement,
        params: Record<string, string>,
        query: Record<string, string>,
        props: Record<string, unknown> = {},
    ) {
        const toKebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const newAttrs = new Map<string, string>();

        Object.entries(params).forEach(([k, v]) => newAttrs.set(toKebab(k), String(v)));
        Object.entries(query).forEach(([k, v]) => newAttrs.set(`query-${toKebab(k)}`, String(v)));

        this.routerAttrs.forEach(attr => {
            if (!newAttrs.has(attr)) {
                el.removeAttribute(attr);
                this.routerAttrs.delete(attr);
            }
        });
        newAttrs.forEach((val, attr) => {
            if (el.getAttribute(attr) !== val) el.setAttribute(attr, val);
            this.routerAttrs.add(attr);
        });

        const newPropKeys = new Set(Object.keys(props));
        this.prevPropKeys.forEach(k => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!newPropKeys.has(k)) (el as any)[k] = undefined;
        });
        Object.entries(props).forEach(([k, v]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((el as any)[k] !== v) (el as any)[k] = v;
        });
        this.prevPropKeys = newPropKeys;
    }

    private handleEmptyRoute() {
        this.clear();
        if (this.level === 0) this.renderError('404 Not Found');
    }

    private renderLoading() {
        this.textContent = '';
        const div = document.createElement('div');
        div.style.cssText = 'padding:20px; color:#999;';
        div.textContent = 'Loading...';
        this.appendChild(div);
    }

    private renderError(msg: string) {
        this.textContent = '';
        const div = document.createElement('div');
        div.style.cssText = 'padding:20px; color:#ff4d4f;';
        div.textContent = String(msg);
        this.appendChild(div);
    }

    private clear() {
        // 如果当前有元素，且我们需要缓存它，则通过 removeChild 移出 DOM 但保留内存引用
        if (this.currentElement) {
            if (this.contains(this.currentElement)) {
                this.removeChild(this.currentElement);
            }
        }

        // 总是清空内容（包括 Loading、Error 等临时状态）
        this.innerHTML = '';

        this.currentElement = null;
        this.currentTagName = null;
        this.routerAttrs.clear();
        this.prevPropKeys.clear();
    }
}

export default RouterView;
