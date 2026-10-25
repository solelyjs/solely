/** 是否为开发环境 */
export const IS_DEV = /* @__PURE__ */ (() => {
    const global = globalThis as Record<string, unknown>;

    // 0. 显式强制生产：用于「生产构建部署在 localhost / 内网 / Electron」等无法靠主机名判断的场景
    //    在入口脚本最前面设置 globalThis.__IS_PROD__ = true 即可
    if (global.__IS_PROD__ === true) {
        return false;
    }

    // 1. 运行时强制后门（用户随时可以打开调试）
    if (typeof window !== 'undefined') {
        // URL 参数 ?debug 或 ?debug=true
        if (window.location?.search.includes('debug')) {
            return true;
        }
        // 全局变量（用户可以在自己的 index.html 或代码里注入）
        if (global.__DEBUG__ === true || global.__IS_DEV__ === true) {
            return true;
        }
    }

    // 2. 兼容 process.env.NODE_ENV（很多用户项目里会定义这个，尤其是在 webpack/vite/react-scripts 项目中）
    //    注意：这里必须通过 globalThis.process 访问，不能直接写 process.env.NODE_ENV——
    //    库构建时 Vite 会把 `process.env.NODE_ENV` 静态替换为 "production"，
    //    导致发布出去的库在用户开发环境里也永远判定为生产环境。
    const nodeEnv = (global.process as { env?: Record<string, string | undefined> } | undefined)?.env?.NODE_ENV;
    if (nodeEnv === 'production') return false;
    if (nodeEnv === 'development') return true;

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

/** Solely 框架版本号（编译时从 package.json 注入） */
export const SOLELY_VERSION: string = typeof __SOLELY_VERSION__ !== 'undefined' ? __SOLELY_VERSION__ : '0.0.0';
