/** 是否为开发环境 */
export const IS_DEV = /* @__PURE__ */ (() => {
    // 1. 最高优先级：运行时强制后门（用户随时可以打开调试）
    if (typeof window !== 'undefined') {
        // URL 参数 ?debug 或 ?debug=true
        if (window.location?.search.includes('debug')) {
            return true;
        }
        // 全局变量（用户可以在自己的 index.html 或代码里注入）
        if ((globalThis as any).__DEBUG__ === true || (globalThis as any).__IS_DEV__ === true) {
            return true;
        }
    }

    // 2. 兼容 process.env.NODE_ENV（很多用户项目里会定义这个，尤其是在 webpack/vite/react-scripts 项目中）
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        return true;
    }

    // 3. 本地主机名兜底（开发机上默认认为是 dev）
    if (
        typeof window !== 'undefined' &&
        ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location?.hostname || '')
    ) {
        return true;
    }

    // 4. 默认认为是生产环境
    return false;
})();

/** 是否为生产环境 */
export const IS_PROD = !IS_DEV;
