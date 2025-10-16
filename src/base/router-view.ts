import { CustomElement } from "./decorators";
import { ASTNode, listeners, parseHashUrl, patch } from "../utils";

// 定义路由参数的接口
interface IRouteParams {
    [key: string]: string;
}

export interface IRouter {
    path: string;
    tagName: string;
    children?: IRouter[];
}

/**
 * 判断一个节点是否是 RouterViewElement
 * @param node 待检查的节点
 * @returns boolean
 */
function isRouterViewElement(node: any): node is RouterViewElement {
    return node instanceof HTMLElement && (node as RouterViewElement).isRouterView === true;
}

@CustomElement({
    tagName: 'router-view'
})
export class RouterViewElement extends HTMLElement {
    // #region 私有属性
    #vNodes: ASTNode[] = [];
    #remainingPath: string[] = [];
    #matchedRoute: IRouter | null = null;
    #currentPath?: string[];
    #routes: IRouter[] = [];
    #pipe: Record<string, any> = {};

    /**
     * 将 onHashChange 方法绑定 this，确保 add/removeEventListener 使用同一个函数实例
     */
    #boundOnHashChange = this.onHashChange.bind(this);
    // #endregion

    // #region 公共属性和访问器
    public get isRouterView(): boolean {
        return true;
    }

    public get $routes(): IRouter[] {
        return this.#routes;
    }

    public set $routes(v: IRouter[]) {
        this.#routes = v;
        this.onHashChange();
    }

    public get $remainingPath(): string[] {
        return this.#remainingPath;
    }

    public get $matchedRoute(): IRouter | null {
        return this.#matchedRoute;
    }

    public set $pipe(v: Record<string, any>) {
        this.#pipe = v || {};
        this.onHashChange();
    }
    // #endregion

    // #region 生命周期回调
    connectedCallback(): void {
        window.addEventListener('hashchange', this.#boundOnHashChange);
        this.onHashChange(); // 初始加载时执行一次
    }

    disconnectedCallback(): void {
        window.removeEventListener('hashchange', this.#boundOnHashChange);
    }
    // #endregion

    /**
     * Hash 变化时的核心处理函数
     */
    private onHashChange(): void {
        if (!this.isConnected) return;

        const parentRouter = this.findAncestorRouterView();

        if (parentRouter) {
            // 作为子路由，继承父路由的路径和路由表
            this.#currentPath = parentRouter.$remainingPath;
            this.#routes = parentRouter.$matchedRoute?.children || [];
        } else {
            // 作为根路由，从 URL 获取完整路径
            const { path } = parseHashUrl(window.location);
            this.#currentPath = path;
        }

        this.#apply();
    }

    /**
     * 计算并应用路由匹配结果，更新 DOM
     */
    #apply(): void {
        const pathSegments = this.#currentPath || [];
        const { matchedRoute, params, remainingPath } = this.matchRoute(this.#routes, pathSegments);

        this.#remainingPath = remainingPath;
        this.#matchedRoute = matchedRoute;

        const tagName = matchedRoute?.tagName || 'comment'; // 未匹配到则渲染为注释节点
        const { props, on } = this.prepareComponentData(params);

        const newAst: ASTNode[] = [{
            tagName: tagName,
            rootId: '0', // 假设 rootId 是固定的
            attrs: {},
            props: props,
            on: on,
            children: [],
        }];

        // 统一交由 patch 函数处理 DOM 更新，无论 tagName 是否变化
        this.#vNodes = patch(this, newAst, this.#vNodes);

        // 通知子 router-view 更新
        this.propagateToChildRouterViews();
    }

    /**
     * 准备传递给子组件的 props 和事件监听
     * @param params 从路由中解析出的参数
     * @returns 包含 props 和 on 的对象
     */
    private prepareComponentData(params: IRouteParams): { props: Record<string, Function>, on: Record<string, (event: Event) => any> } {
        const props: Record<string, Function> = {};
        const on: Record<string, (event: Event) => any> = {};
        // 1. 传递路由参数
        for (const [key, value] of Object.entries(params)) {
            props[key] = () => value;
        }

        // 2. 传递管道数据（pipe）
        for (const [key, value] of Object.entries(this.#pipe)) {
            const lowerKey = key.toLowerCase();
            let eventName: string | null = null;
            if (lowerKey.startsWith("on-")) {
                eventName = lowerKey.slice(3);
            } else if (lowerKey.startsWith("on") && listeners.includes(lowerKey.slice(2))) {
                eventName = lowerKey.slice(2);
            }
            if (eventName) {
                on[eventName] = value as (event: Event) => any;
            } else {
                props[key] = () => value;
            }
        }
        return { props, on };
    }

    /**
     * 在路由表中查找与当前路径匹配的路由
     * @param routes 路由配置数组
     * @param pathSegments URL 路径分段数组
     * @returns 匹配结果
     */
    private matchRoute(routes: IRouter[], pathSegments: string[]): { matchedRoute: IRouter | null; params: IRouteParams; remainingPath: string[] } {
        for (const route of routes) {
            const routePaths = route.path.split('/').filter(p => p); // 过滤空字符串
            const params: IRouteParams = {};

            // 如果路径段数量不匹配（除非有通配符*），则跳过
            if (routePaths.length > pathSegments.length && !routePaths.includes('*')) {
                continue;
            }

            let isMatch = true;
            for (let i = 0; i < routePaths.length; i++) {
                const routeSegment = routePaths[i];
                const pathSegment = pathSegments[i];

                if (routeSegment.startsWith(':')) {
                    // 动态参数匹配
                    params[routeSegment.substring(1)] = pathSegment;
                } else if (routeSegment === '*') {
                    // 通配符匹配，匹配所有剩余路径
                    return {
                        matchedRoute: route,
                        params,
                        remainingPath: [] // 通配符消耗所有剩余路径
                    };
                } else if (routeSegment !== pathSegment) {
                    isMatch = false;
                    break;
                }
            }

            if (isMatch) {
                return {
                    matchedRoute: route,
                    params,
                    remainingPath: pathSegments.slice(routePaths.length)
                };
            }
        }

        return { matchedRoute: null, params: {}, remainingPath: pathSegments };
    }

    /**
     * 递归通知所有子节点中的 router-view 进行更新
     * @param node 当前遍历的起始节点
     */
    private propagateToChildRouterViews(node: Node = this): void {
        for (const child of node.childNodes) {
            if (isRouterViewElement(child)) {
                child.onHashChange();
            } else {
                this.propagateToChildRouterViews(child);
            }
        }
    }

    /**
     * 沿 DOM 树向上查找最近的父 router-view 实例
     * @returns 父 RouterViewElement 实例或 null
     */
    private findAncestorRouterView(): RouterViewElement | null {
        let parent = this.parentElement;
        while (parent) {
            if (isRouterViewElement(parent)) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }
}