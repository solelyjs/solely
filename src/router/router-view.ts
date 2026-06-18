import { BaseElement, CustomElement } from '../runtime/component';
import type { RouteConfig, RouteMatch } from './types';
import { Router, routerReady } from './core';

interface ComponentState {
    routerAttrs: Set<string>;
    propKeys: Set<string>;
}

const componentStateMap = new WeakMap<HTMLElement, ComponentState>();

function getComponentState(el: HTMLElement): ComponentState {
    let state = componentStateMap.get(el);
    if (!state) {
        state = { routerAttrs: new Set(), propKeys: new Set() };
        componentStateMap.set(el, state);
    }
    return state;
}

@CustomElement({
    tagName: 'router-view',
    props: [{ name: 'notFound', type: 'string', default: '' }],
})
class RouterView extends BaseElement<{ notFound: string }> {
    private unsubscribe?: () => void;
    private level = 0;
    private currentElement: HTMLElement | null = null;
    private currentTagName: string | null = null;

    // 使用 Set 细粒度管理托管的节点，避免使用 replaceChildren 导致 Slot 丢失
    private managedNodes = new Set<Node>();

    private scheduled = false;
    private latestLoadId = 0;
    private abortController: AbortController | null = null;
    private disposed = false;
    private router: Router | null = null;

    async mounted() {
        this.disposed = false;
        this.detectLevel();
        this.router = await routerReady();

        if (this.disposed) return;

        this.unsubscribe = this.router.listen(() => this.scheduleLoad());
        this.loadRoute(this.router.getCurrentRoute());
    }

    unmounted() {
        this.disposed = true;
        this.abortController?.abort();
        this.abortController = null;
        this.unsubscribe?.();
        this.clear();
    }

    private scheduleLoad() {
        if (!this.router || this.scheduled || this.disposed) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            if (this.disposed || !this.router) return;
            this.loadRoute(this.router.getCurrentRoute());
        });
    }

    private detectLevel() {
        let level = 0;
        let node: Element | null = this.parentElement;
        while (node) {
            const found = node.closest('router-view');
            if (found) {
                level++;
                node = found.parentElement;
                if (!node) {
                    const root = found.getRootNode();
                    node = root instanceof ShadowRoot ? root.host : null;
                }
            } else {
                const root = node.getRootNode();
                node = root instanceof ShadowRoot ? root.host : null;
            }
        }
        this.level = level;
    }

    public async loadRoute(route: RouteMatch | null) {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        const loadId = ++this.latestLoadId;
        const matched = route?.matched[this.level];

        if (!matched) {
            this.handleEmptyRoute(route);
            return;
        }

        const { config } = matched;
        let tagName = config.tagName;

        if (!tagName && typeof config.component === 'function') {
            this.renderLoading();
            const controller = new AbortController();
            this.abortController = controller;

            try {
                const cached = this.router?.getComponentFromCache?.(route?.fullPath);
                const result = cached ? await cached : await config.component();

                if (controller.signal.aborted || loadId !== this.latestLoadId || this.disposed) return;
                tagName = typeof result === 'string' ? result : result.tagName;
            } catch (err) {
                if (controller.signal.aborted || loadId !== this.latestLoadId || this.disposed) return;
                this.renderError(`Load Error: ${err}`);
                return;
            } finally {
                if (this.abortController === controller) this.abortController = null;
            }
        }

        if (loadId !== this.latestLoadId || this.disposed) return;
        if (!tagName) {
            this.clear();
            return;
        }

        if (!config.forceReload && this.currentElement && this.currentTagName === tagName.toLowerCase()) {
            this.syncState(this.currentElement, route?.params || {}, route?.query || {}, config.props);
        } else {
            this.clear();
            const el = this.getOrCreateComponent(tagName, config, route);
            this.syncState(el, route?.params || {}, route?.query || {}, config.props);
            this.appendManagedNode(el);
            this.currentElement = el;
            this.currentTagName = tagName.toLowerCase();
        }
    }

    private syncState(
        el: HTMLElement,
        params: Record<string, string>,
        query: Record<string, string>,
        props: Record<string, unknown> = {},
    ) {
        const toKebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const state = getComponentState(el);
        const newAttrs = new Map<string, string>();

        Object.entries(params).forEach(([k, v]) => newAttrs.set(toKebab(k), String(v)));
        Object.entries(query).forEach(([k, v]) => newAttrs.set(`query-${toKebab(k)}`, String(v)));

        state.routerAttrs.forEach(attr => {
            if (!newAttrs.has(attr)) {
                el.removeAttribute(attr);
                state.routerAttrs.delete(attr);
            }
        });
        newAttrs.forEach((val, attr) => {
            if (el.getAttribute(attr) !== val) el.setAttribute(attr, val);
            state.routerAttrs.add(attr);
        });

        const newPropKeys = new Set(Object.keys(props));
        const elProps = el as unknown as Record<string, unknown>;
        state.propKeys.forEach(k => {
            if (!newPropKeys.has(k)) elProps[k] = undefined;
        });
        Object.entries(props).forEach(([k, v]) => {
            if (elProps[k] !== v) elProps[k] = v;
        });
        state.propKeys = newPropKeys;
    }

    private getOrCreateComponent(tagName: string, config: RouteConfig, route: RouteMatch | null): HTMLElement {
        if (!route) {
            throw new Error('Route is required to create or retrieve component');
        }
        const key = config.keepAliveKey
            ? config.keepAliveKey(route, this.level)
            : this.buildKeepAliveKey(tagName, route);
        const cached = config.keepAlive && this.router?.getKeepAlive(key);
        if (cached) return cached;

        const el = document.createElement(tagName);
        if (config.keepAlive) this.router?.setKeepAlive(key, el);
        return el;
    }

    private buildKeepAliveKey(tagName: string, route: RouteMatch): string {
        const matched = route.matched[this.level];
        const pathPart = matched?.config.path ?? tagName.toLowerCase();
        const params = Object.values(matched?.params ?? {});
        return params.length ? `${this.level}:${pathPart}:${params.join('|')}` : `${this.level}:${pathPart}`;
    }

    private handleEmptyRoute(route: RouteMatch | null) {
        // 【修复】仅最顶层 RouterView（level === 0）渲染 404 内容，子级保持空白
        if (this.level === 0) {
            this.clear();
            const matched = route?.matched?.[0];
            const tag = matched?.config?.notFoundComponent || this.$data.notFound;
            if (tag) {
                const el = document.createElement(tag);
                this.appendManagedNode(el);
                this.currentElement = el;
                this.currentTagName = tag.toLowerCase();
            } else {
                this.renderError('404 Not Found');
            }
        } else {
            // 非顶层仅清空，不渲染任何内容
            this.clear();
        }
    }

    private appendManagedNode(node: Node) {
        if (node.parentNode !== this) this.appendChild(node);
        this.managedNodes.add(node);
    }

    private clear() {
        this.managedNodes.forEach(node => {
            if (node.parentNode === this) this.removeChild(node);
        });
        this.managedNodes.clear();
        this.currentElement = null;
        this.currentTagName = null;
    }

    private renderLoading() {
        this.clear();
        const div = document.createElement('div');
        div.style.cssText = 'padding:20px; color:#999;';
        div.textContent = 'Loading...';
        this.appendManagedNode(div);
    }

    private renderError(msg: string) {
        this.clear();
        const div = document.createElement('div');
        div.style.cssText = 'padding:20px; color:#ff4d4f;';
        div.textContent = msg;
        this.appendManagedNode(div);
    }
}

export default RouterView;
