/**
 * 组件文档路由配置
 * 使用异步加载方式，按需加载各个页面组件
 */

import { createRouter } from '../../src/router/index';
import type { RouteConfig } from '../../src/router/types';

// 定义路由配置 - 使用异步加载
const routes: RouteConfig[] = [
    {
        path: '/',
        component: async () => {
            await import('./views/home');
            return { tagName: 'docs-home' };
        },
    },
    {
        path: '/intro',
        component: async () => {
            await import('./views/intro');
            return { tagName: 'docs-intro' };
        },
    },
    {
        path: '/quickstart',
        component: async () => {
            await import('./views/quickstart');
            return { tagName: 'docs-quickstart' };
        },
    },
    {
        path: '/button',
        component: async () => {
            await import('./views/button');
            return { tagName: 'docs-button' };
        },
    },
    {
        path: '/input',
        component: async () => {
            await import('./views/input');
            return { tagName: 'docs-input' };
        },
    },
    {
        path: '/fab',
        component: async () => {
            await import('./views/fab');
            return { tagName: 'docs-fab' };
        },
    },
    {
        path: '/coordinate-input',
        component: async () => {
            await import('./views/coordinate-input');
            return { tagName: 'docs-coordinate-input' };
        },
    },
    {
        path: '/switch',
        component: async () => {
            await import('./views/switch');
            return { tagName: 'docs-switch' };
        },
    },

    {
        path: '/alert',
        component: async () => {
            await import('./views/alert');
            return { tagName: 'docs-alert' };
        },
    },
    {
        path: '/badge',
        component: async () => {
            await import('./views/badge');
            return { tagName: 'docs-badge' };
        },
    },
    {
        path: '/checkbox',
        component: async () => {
            await import('./views/checkbox');
            return { tagName: 'docs-checkbox' };
        },
    },
    {
        path: '/radio',
        component: async () => {
            await import('./views/radio');
            return { tagName: 'docs-radio' };
        },
    },
    {
        path: '/select',
        component: async () => {
            await import('./views/select');
            return { tagName: 'docs-select' };
        },
    },
    {
        path: '/card',
        component: async () => {
            await import('./views/card');
            return { tagName: 'docs-card' };
        },
    },
    {
        path: '/divider',
        component: async () => {
            await import('./views/divider');
            return { tagName: 'docs-divider' };
        },
    },
    {
        path: '/empty',
        component: async () => {
            await import('./views/empty');
            return { tagName: 'docs-empty' };
        },
    },
    {
        path: '/tag',
        component: async () => {
            await import('./views/tag');
            return { tagName: 'docs-tag' };
        },
    },
    {
        path: '/progress',
        component: async () => {
            await import('./views/progress');
            return { tagName: 'docs-progress' };
        },
    },
    {
        path: '/skeleton',
        component: async () => {
            await import('./views/skeleton');
            return { tagName: 'docs-skeleton' };
        },
    },
    {
        path: '/breadcrumb',
        component: async () => {
            await import('./views/breadcrumb');
            return { tagName: 'docs-breadcrumb' };
        },
    },
    {
        path: '/tabs',
        component: async () => {
            await import('./views/tabs');
            return { tagName: 'docs-tabs' };
        },
    },
    {
        path: '/steps',
        component: async () => {
            await import('./views/steps');
            return { tagName: 'docs-steps' };
        },
    },
    {
        path: '/backtop',
        component: async () => {
            await import('./views/backtop');
            return { tagName: 'docs-backtop' };
        },
    },
    {
        path: '/pagination',
        component: async () => {
            await import('./views/pagination');
            return { tagName: 'docs-pagination' };
        },
    },
    {
        path: '/slider',
        component: async () => {
            await import('./views/slider');
            return { tagName: 'docs-slider' };
        },
    },
    {
        path: '/rate',
        component: async () => {
            await import('./views/rate');
            return { tagName: 'docs-rate' };
        },
    },
    {
        path: '/upload',
        component: async () => {
            await import('./views/upload');
            return { tagName: 'docs-upload' };
        },
    },
    {
        path: '/timeline',
        component: async () => {
            await import('./views/timeline');
            return { tagName: 'docs-timeline' };
        },
    },
    {
        path: '/table',
        component: async () => {
            await import('./views/table');
            return { tagName: 'docs-table' };
        },
    },
    {
        path: '/tree',
        component: async () => {
            await import('./views/tree');
            return { tagName: 'docs-tree' };
        },
    },
    {
        path: '/drawer',
        component: async () => {
            await import('./views/drawer');
            return { tagName: 'docs-drawer' };
        },
    },
    {
        path: '/message',
        component: async () => {
            await import('./views/message');
            return { tagName: 'docs-message' };
        },
    },
    {
        path: '/modal',
        component: async () => {
            await import('./views/modal');
            return { tagName: 'docs-modal' };
        },
    },
    {
        path: '/popconfirm',
        component: async () => {
            await import('./views/popconfirm');
            return { tagName: 'docs-popconfirm' };
        },
    },
    {
        path: '/tooltip',
        component: async () => {
            await import('./views/tooltip');
            return { tagName: 'docs-tooltip' };
        },
    },
];

// 创建路由实例
export const router = createRouter({
    routes,
    mode: 'hash',
    afterEach: () => {
        // 路由切换后滚动到顶部
        window.scrollTo(0, 0);
    },
});

export default router;
