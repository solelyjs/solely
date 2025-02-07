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

@CustomElement({
    tagName: 'router-view'
})
export class RouterViewElement extends HTMLElement {
    #vNodes: ASTNode[] = [];
    #remainingPath: string[] = [];
    #matchedRoute: IRouter | null = null;
    #path?: string[];
    #routes: IRouter[] = [];
    #pipe: Record<string, any> = {};

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

    connectedCallback(): void {
        window.addEventListener('hashchange', this.onHashChange.bind(this));
        this.onHashChange();
    }

    disconnectedCallback(): void {
        window.removeEventListener('hashchange', this.onHashChange.bind(this));
    }

    private onHashChange(): void {
        if (!this.isConnected) return;

        const { path } = parseHashUrl(window.location);
        const ancestor = this.findAncestorWithRouterView(this);

        if (ancestor) {
            this.#path = ancestor.$remainingPath;
            this.#routes = ancestor.$matchedRoute?.children || [];
        } else {
            this.#path = path;
        }

        this.#apply();
    }

    #apply(): void {
        const _remainingPath = this.#path || [];
        const { matchedRoute, params, remainingPath } = this.matchRoute(this.#routes, _remainingPath);
        this.#remainingPath = remainingPath;

        const tagName = matchedRoute?.tagName || 'comment';

        const props: Record<string, Function> = {};
        const on: Record<string, (event: Event) => any> = {};

        // 传递路由参数
        for (const [key, value] of Object.entries(params)) {
            props[key] = () => value;
        }

        // 传递管道参数
        for (const [key, value] of Object.entries(this.#pipe)) {
            if (listeners.includes(key) || key.startsWith("on-")) {
                on[key.startsWith("on-") ? key.slice(3) : key.slice(2)] = value as (event: Event) => any;
            } else {
                props[key] = () => value;
            }
        }

        const ast: ASTNode[] = [
            {
                tagName: tagName,
                rootId: 0,
                attrs: {},
                props: props,
                on: on,
                children: [],
            }
        ];

        if (this.#matchedRoute?.tagName !== tagName) {
            this.innerHTML = ''; // 清空子元素
            this.#vNodes = patch(this, ast, []);
        } else {
            this.#vNodes = patch(this, ast, this.#vNodes);
        }

        this.#matchedRoute = matchedRoute || {
            tagName: 'comment',
            path: '',
            children: []
        };

        // 通知后代
        this.propagateRoutes(this);
    }

    private matchRoute(routes: IRouter[], remainingPath: string[]): { matchedRoute: IRouter | null; params: IRouteParams; remainingPath: string[] } {
        for (const route of routes) {
            const paths = route.path.split('/');
            let isMatch = true;
            const params: IRouteParams = {};

            for (let i = 0; i < paths.length; i++) {
                const pathSegment = paths[i];
                if (pathSegment.startsWith(':')) {
                    params[pathSegment.substring(1)] = remainingPath[i];
                } else if (pathSegment === '*') {
                    isMatch = true;
                    break;
                } else if (pathSegment !== remainingPath[i]) {
                    isMatch = false;
                    break;
                }
            }

            if (isMatch) {
                return {
                    matchedRoute: route,
                    params: params,
                    remainingPath: remainingPath.slice(paths.length)
                };
            }
        }

        return {
            matchedRoute: null,
            params: {},
            remainingPath: remainingPath
        };
    }

    private propagateRoutes(node: Node): void {
        for (const item of node.childNodes) {
            if ((item as any).isRouterView) {
                (item as any).onHashChange();
            } else {
                this.propagateRoutes(item);
            }
        }
    }

    private findAncestorWithRouterView(node: Element): RouterViewElement | null {
        let current: Element | null = node.parentNode as Element | null;
        while (current) {
            if ((current as any).isRouterView) {
                return current as RouterViewElement;
            }
            current = current.parentElement;
        }
        return null;
    }
}