export interface RouteConfig {
    /** 路由路径，例如 '/user/:id' */
    path: string;

    /** * 组件标签名。
     * 如果是同步路由，直接提供 tagName；如果是异步，可在加载后确定。
     */
    tagName?: string;

    /** * 异步组件加载函数。
     * 支持返回标签名字符串，或者一个包含 tagName 的对象（例如 import 的模块）。
     */
    component?: () => Promise<string | { tagName: string } | any>;

    /** 路由名称，用于命名路由跳转 */
    name?: string;

    /** * 是否缓存组件实例。
     * 开启后，切换路由时组件不会被销毁，而是保存在 RouterView 的缓存池中。
     */
    keepAlive?: boolean;

    /** * 是否强制重新加载。
     * 即使 tagName 相同，如果为 true，也会销毁重建组件而不是复用。
     */
    forceReload?: boolean;

    /** 重定向路径 */
    redirect?: string;

    /** * 传递给组件的属性。
     * 可以是静态对象，也可以是更复杂的配置。
     */
    props?: Record<string, any>;

    /** 路由元信息，用于存放权限、标题等自定义数据 */
    meta?: Record<string, any>;

    /** 嵌套子路由 */
    children?: RouteConfig[];

    /** * 标识是否为异步路由（可选）。
     * 实际上通常可以通过判断 component 属性是否存在来推断。
     */
    async?: boolean;
}

export interface MatchedRoute {
    config: RouteConfig;
    params: Record<string, string>; // 仅存储当前层级匹配到的参数
}

export interface RouteMatch {
    fullPath: string; // 完整的请求路径
    params: Record<string, string>; // 路径参数（由所有层级共享合并）
    query: Record<string, string>; // URL Query 参数
    matched: MatchedRoute[]; // 带有层级参数的数组
    meta: Record<string, any>; // 快捷方式（可选）：方便直接获取最深层的路由
}

export interface NavigationGuard {
    (to: RouteMatch, from: RouteMatch): boolean | Promise<boolean> | string;
}

export interface RouterOptions {
    routes: RouteConfig[];
    base?: string;
    mode?: 'hash' | 'history';
    beforeEach?: NavigationGuard;
    afterEach?: (to: RouteMatch, from: RouteMatch) => void;
}

export interface NavigationResult {
    success: boolean;
    cancelled?: boolean;
    redirect?: string;
    error?: string;
}
