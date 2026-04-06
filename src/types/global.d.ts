// 全局类型声明

import type { solelyVitePlugin } from '../plugins/solely-vite-plugin';

export {};

declare global {
    interface Window {
        /** Solely 插件加载标记 */
        __SOLELY_PLUGIN_LOADED__?: boolean;
        /** Solely Vite 插件 */
        __SOLELY_VITE_PLUGIN__?: typeof solelyVitePlugin;
    }
}
