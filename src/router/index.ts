import { Router, createRouter as coreCreateRouter, getRouter, routerReady } from './core';
import RouterView from './router-view';
import RouterLink from './router-link';
import type { RouteConfig, RouteMatch, NavigationGuard, RouterOptions, NavigationResult } from './types';

/**
 * 创建路由器实例（自动注册 RouterView 和 RouterLink 组件）
 * @param options 路由器配置选项
 * @returns 路由器实例
 */
export function createRouter(options: RouterOptions): Router {
    // 显式引用以确保组件被加载和注册（防止 tree-shaking）
    if (typeof RouterView === 'undefined' || typeof RouterLink === 'undefined') {
        throw new Error('RouterView or RouterLink is not defined');
    }
    return coreCreateRouter(options);
}

export { Router, RouterView, RouterLink, getRouter, routerReady };

export type { RouteConfig, RouteMatch, NavigationGuard, RouterOptions, NavigationResult };
