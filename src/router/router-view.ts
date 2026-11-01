import { BaseElement, CustomElement } from '../runtime/component';
import type { RouteConfig, RouteMatch } from './types';
import { Router, routerReady, getRouter } from './core';
import { IS_DEV } from '../shared/env';

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
    props: [
        { name: 'notFound', type: 'string', default: '' },
        { name: 'loading', type: 'string', default: '' },
    ],
})
class RouterView extends BaseElement<{ notFound: string; loading: string }> {
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
    private warnTimer?: number;

    async mounted() {
        this.disposed = false;
        this.detectLevel();
        this.router = await routerReady();

        if (this.disposed) return;

        this.unsubscribe = this.router.listen(() => this.scheduleLoad());

        // 首次导航尚未 settled 时 currentRoute 必为 null，此时不能当成 404：
        // 先渲染启动占位（未配置 loading 则保持空白），等就绪后再加载真实路由
        if (this.router.getCurrentRoute() === null) {
            const loadIdBeforeWait = this.latestLoadId;
            // 「还在等」的两种情形都要渲染占位：尚未启动过（启动期），或已有导航在飞。
            // 只有「已 settled + 无匹配 + 没有导航在飞」才是真 404 —— 那种情况提前挂载
            // loading 组件会让它的 mounted（可能带请求）白跑一次
            if (!this.router.hasNavigated || this.router.isNavigating) {
                this.renderPending();
                // 告警只针对「从未启动过」：已经 settle 过（哪怕是无匹配）就不该提示 setupListeners
                if (IS_DEV && !this.router.hasNavigated) this.warnIfNeverStarted();
            }
            await this.router.isReady();
            // 就绪后若又有新导航在飞（例如 afterEach 里再次 push），继续等它落地，
            // 否则仍会把「还在导航」读成「无匹配」
            while (!this.disposed && this.router.getCurrentRoute() === null && this.router.isNavigating) {
                await this.router.isReady();
            }
            if (this.disposed) return;
            // 等待期间 router 被 destroy：保持现状，不把「已销毁」当成「无匹配」
            if (getRouter() !== this.router) return;
            // 等待期间已由 listen 回调排过一次加载（含异步组件）：它比本方法先入队，
            // 再调一次会把它的 AbortController 中止并重复执行 component()，这里直接让位
            if (this.latestLoadId !== loadIdBeforeWait) return;
        }

        this.loadRoute(this.router.getCurrentRoute());
    }

    unmounted() {
        this.disposed = true;
        if (this.warnTimer !== undefined) {
            window.clearTimeout(this.warnTimer);
            this.warnTimer = undefined;
        }
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

    /** DEV 提示：首导航 3s 内未 settle —— 可能是忘了 setupListeners()，也可能是守卫本身很慢 */
    private warnIfNeverStarted() {
        this.warnTimer = window.setTimeout(() => {
            this.warnTimer = undefined;
            if (this.disposed || !this.router) return;
            if (this.router.hasNavigated === false) {
                console.warn(
                    '[router-view] 首次导航 3s 内仍未完成，router-view 会保持占位状态：' +
                        '若尚未调用 router.setupListeners() 请补上；若守卫确实耗时较长，可忽略此提示',
                );
            }
        }, 3000);
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
            this.handleEmptyRoute();
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

    private handleEmptyRoute() {
        // 【修复】仅最顶层 RouterView（level === 0）渲染 404 内容，子级保持空白
        if (this.level === 0) {
            this.clear();
            // 注意：启动阶段的 currentRoute === null 已在 mounted() 中被 isReady() 拦下，
            // 走到这里说明首次导航已 settled，属于真正的「没有匹配路由」
            const tag = this.$data.notFound;
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

    /**
     * 渲染占位内容：优先使用 `loading` 指定的占位组件，未配置时按需渲染兜底文本。
     * 启动阶段（首导航未完成）不传 fallbackText，保持空白。
     */
    private renderPlaceholder(fallbackText?: string) {
        this.clear();
        const tag = this.$data.loading;
        if (tag) {
            this.appendManagedNode(document.createElement(tag));
            return;
        }
        if (!fallbackText) return;
        const div = document.createElement('div');
        div.style.cssText = 'padding:20px; color:#999;';
        div.textContent = fallbackText;
        this.appendManagedNode(div);
    }

    private renderLoading() {
        this.renderPlaceholder('Loading...');
    }

    private renderPending() {
        this.renderPlaceholder();
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
