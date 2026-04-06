/**
 * Solely Vite Plugin
 *
 * 提供构建时模板预编译功能，将 HTML 模板转换为优化的 IR（中间表示）
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { solelyVitePlugin } from 'solely/plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     solelyVitePlugin({
 *       precompile: true,   // 启用预编译
 *       sourceMap: true,    // 生成源码映射
 *       minify: false,      // 不压缩（开发模式）
 *     })
 *   ]
 * });
 * ```
 *
 * @example
 * ```ts
 * // 组件中使用
 * import { BaseElement, CustomElement } from 'solely';
 * import template from './template.html';  // 导入预编译的模板
 *
 * @CustomElement({
 *   tagName: 'my-component',
 *   template,  // 直接使用预编译的 IR
 * })
 * class MyComponent extends BaseElement {
 *   // ...
 * }
 * ```
 */

export { solelyVitePlugin, type SolelyVitePluginOptions } from './plugins/solely-vite-plugin';

// 默认导出
export { solelyVitePlugin as default } from './plugins/solely-vite-plugin';

// 防 tree-shake
if (typeof window !== 'undefined') {
    window.__SOLELY_PLUGIN_LOADED__ = true;
}
