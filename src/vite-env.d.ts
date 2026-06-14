/// <reference types="vite/client" />

/** Solely 版本号，由 vite.config.ts 的 define 在编译时从 package.json 注入 */
declare const __SOLELY_VERSION__: string;

declare module '*.html?solely' {
    const content: string;
    export default content;
}
