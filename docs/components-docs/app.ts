/**
 * 组件文档应用入口
 */

import { CustomElement } from '../../src/runtime/component/decorators';
import BaseElement from '../../src/runtime/component/base-element';
import { router } from './router';
import template from './app.html?raw';
import styles from './app.css?inline';

@CustomElement({
    tagName: 'docs-app',
    template,
    styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'isDark', type: 'boolean', default: false },
        { name: 'sidebarOpen', type: 'boolean', default: false },
    ],
})
export class DocsApp extends BaseElement {
    mounted() {
        // 初始化路由
        router.setupListeners();

        // 检查本地存储的主题设置，应用到 document
        const savedTheme = localStorage.getItem('solely-theme');
        if (savedTheme === 'dark') {
            this.$data.isDark = true;
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    /**
     * 切换主题
     */
    toggleTheme(): void {
        this.$data.isDark = !this.$data.isDark;

        if (this.$data.isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('solely-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('solely-theme', 'light');
        }

        this.refresh();
    }

    /**
     * 切换移动端侧边栏
     */
    toggleSidebar(): void {
        this.$data.sidebarOpen = !this.$data.sidebarOpen;
        this.refresh();
    }

    /**
     * 关闭移动端侧边栏
     */
    closeSidebar(): void {
        this.$data.sidebarOpen = false;
        this.refresh();
    }
}

export default DocsApp;
