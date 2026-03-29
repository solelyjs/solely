/**
 * Solely 插件系统
 * 
 * 提供构建时和运行时的扩展能力
 */

// Vite 插件
export { solelyVitePlugin, type SolelyVitePluginOptions } from './solely-vite-plugin';

// 默认导出 Vite 插件
export { solelyVitePlugin as default } from './solely-vite-plugin';
