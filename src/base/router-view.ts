import { CustomElement } from "./decorators";
import { parseHashUrl } from "../utils";
import { IRouter, router } from "./router";

// 定义查询参数和路由参数的接口
interface IQueryParams {
    [key: string]: string;
}

interface IRouteParams {
    [key: string]: string;
}

@CustomElement({
    tagName: 'router-view'
})
export class RouterViewElement extends HTMLElement {
    $elm: HTMLElement;
    $routes: IRouter[] = [];
    $matchedRoute: IRouter | null = null;
    $remainingPath: string[] = [];
    $query: IQueryParams = {}; //  URL 查询参数
    $params: IRouteParams = {}; // 路由参数

    constructor() {
        super();
        this.$elm = this;
        window.addEventListener('hashchange', this.#refresh.bind(this));
    }


    connectedCallback() {
        this.#refresh(); // 初始刷新以匹配路由
        router.subscribe(() => {
            this.#refresh();
        });
    }

    disconnectedCallback() {

    }

    #refresh() {
        const ancestor: any = this.findAncestorWithRouterView(this.$elm);
        if (ancestor) {
            this.$remainingPath = ancestor.$remainingPath;
            this.$query = ancestor.$query;
            this.$routes = ancestor.$matchRoute.children || [];
        }
        else {
            const { path, query } = parseHashUrl(window.location);
            this.$remainingPath = path;
            this.$query = query;
            this.$routes = router.getRoutes();
        }
        this.matchRoute(); // 匹配路由

        let elm;
        if (this.$matchedRoute) {
            elm = this.$matchedRoute.elm || document.createElement(this.$matchedRoute.tagName);
            //标记当前element是路由组件
            // elm.setAttribute('router-view', '');
            // 传递路由参数
            for (const [key, value] of Object.entries(this.$params)) {
                elm.setAttribute(key, value);
            }
            // 传递查询参数
            for (const [key, value] of Object.entries(this.$query)) {
                elm.setAttribute(key, value);
            }

            this.$matchedRoute.elm = elm;
        } else {
            // 没有匹配的路由
            // console.log('No route matched');
            elm = document.createElement('error-not-found');
            elm.innerHTML = `<h1>404 Not Found</h1>`;
        }

        if (this.$elm !== elm) {
            this.$elm.replaceWith(elm); // 替换当前元素为匹配的组件
            this.$elm = elm;
        }
    }

    matchRoute() {
        for (const route of this.$routes) {
            const paths = route.path.split('/');
            let isMatch = true;
            for (let i = 0; i < paths.length; i++) {
                if (paths[i].startsWith(':')) {
                    this.$params[paths[i].substring(1)] = this.$remainingPath[i];
                }
                else if (paths[i] === '*') {
                    // 通配符匹配所有剩余路径
                    break;
                }
                else if (paths[i] !== this.$remainingPath[i]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                this.$matchedRoute = route;
                this.$remainingPath = this.$remainingPath.slice(paths.length);
                return;
            }
        }
        this.$matchedRoute = null;
    }

    // 寻找包含 'router-view' 属性的祖辈节点
    findAncestorWithRouterView(node: Element): Element | null {
        // 从传入节点的父节点开始遍历
        let current: Element | null = node.parentNode as Element | null;
        while (current) {
            if (current.hasAttribute('router-view')) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
}