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

    constructor() {
        super();
        window.addEventListener('hashchange', this.onHashChange.bind(this));
    }

    public $path?: string[];
    #routes: IRouter[] = [];
    public get $routes(): IRouter[] {
        return this.#routes;
    }

    public set $routes(v: IRouter[]) {
        this.#routes = v;
        this.#apply();
    }

    public get $remainingPath() {
        return this.#remainingPath;
    }

    public get $matchedRoute() {
        return this.#matchedRoute;
    }

    #pipe: any = {};
    public set $pipe(v: any) {
        this.#pipe = v || {};
        this.#apply();
    }

    connectedCallback() {
        this.onHashChange();
    }

    onHashChange() {
        const { path } = parseHashUrl(window.location);
        const ancestor: RouterViewElement | null = this.findAncestorWithRouterView(this);
        if (ancestor) {
            this.$path = ancestor.$remainingPath;
            this.$routes = ancestor.$matchedRoute?.children || [];
        }
        else {
            this.$path = path;
            // this.$routes = this.$routes;
            this.#apply();
        }
    }

    #apply() {
        const _remainingPath = this.$path || [];
        const { matchedRoute, params, remainingPath } = this.matchRoute(this.$routes, _remainingPath); // 匹配路由
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
                on[key.startsWith("on-") ? key.slice(3) : key.slice(2)] = value as any;
            }
            else {
                props[key] = () => value;
            }
        }

        let ast: ASTNode[] = [
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
            ast = [{
                rootId: 0,
                tagName: "If", // 带有If标记的ast会被重建
                attrs: {},
                props: {},
                on: {},
                fn: () => true,
                children: ast
            }];
        }
        this.#vNodes = patch(this, ast, this.#vNodes);

        this.#matchedRoute = matchedRoute || {
            tagName: 'comment',
            path: '',
            children: []
        }

        // 通知后代
        this.propagateRoutes(this);
    }

    matchRoute(routes: IRouter[], remainingPath: string[]) {
        for (const route of routes) {
            const paths = route.path.split('/');
            let isMatch = true;
            let params: IRouteParams = {};
            for (let i = 0; i < paths.length; i++) {
                const pathSegment = paths[i];
                if (pathSegment.startsWith(':')) {
                    // 将参数名和对应的值存入params对象
                    params[pathSegment.substring(1)] = remainingPath[i];
                } else if (pathSegment === '*') {
                    // 通配符匹配所有剩余路径
                    isMatch = true;
                    break;
                } else if (pathSegment !== remainingPath[i]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                // 如果匹配成功，返回匹配的路由和剩余路径
                return {
                    matchedRoute: route,
                    params: params,
                    remainingPath: remainingPath.slice(paths.length)
                };
            }
        }
        // 如果没有匹配的路由，返回null
        return {
            matchedRoute: null,
            params: {},
            remainingPath: remainingPath
        };
    }

    // 向直系后代传播路由
    propagateRoutes(node: Node) {
        for (let item of node.childNodes) {
            if ((item as any).tagName === 'ROUTER-VIEW') {
                (item as any).onHashChange();
                continue;
            }
            else {
                this.propagateRoutes(item);
            }
        }
    }

    // 寻找包含 'router-view' 属性的祖辈节点
    findAncestorWithRouterView(node: Element): RouterViewElement | null {
        // 从传入节点的父节点开始遍历
        let current: Element | null = node.parentNode as Element | null;
        while (current) {
            if (current.tagName === 'ROUTER-VIEW') {
                return current as RouterViewElement;
            }
            current = current.parentElement;
        }
        return null;
    }
}