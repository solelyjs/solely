export interface IRouter {
    path: string;
    tagName: string;
    children?: IRouter[];
    elm?: HTMLElement;
}


class Router {
    // 单例模式
    static #instance: any;
    #routes: IRouter[] = [];
    // 存储订阅者回调函数
    subscribers: ((routes: IRouter[]) => void)[] = [];

    constructor() {
        if (new.target !== Router) {
            return;
        }

        if (!Router.#instance) {
            Router.#instance = this;
        }
        return Router.#instance;
    }


    // 设置路由数据
    setRoutes(routes: IRouter[]) {
        this.#routes = routes;
        // 触发路由更新事件
        this.#notifySubscribers();
    }

    // 获取路由数据
    getRoutes() {
        return this.#routes;
    }

    // 订阅路由更新事件
    subscribe(callback: any) {
        this.subscribers.push(callback);
    }

    // 取消订阅
    unsubscribe(callback: any) {
        const index = this.subscribers.indexOf(callback);
        if (index > -1) {
            this.subscribers.splice(index, 1);
        }
    }

    // 通知所有订阅者路由数据已更新
    #notifySubscribers() {
        this.subscribers.forEach((callback: (arg0: IRouter[]) => any) => callback(this.#routes));
    }
}


export const router = new Router();