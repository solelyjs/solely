/**
 * 组件文档应用入口
 */

import { CustomElement } from '../../src/runtime/component/decorators';
import BaseElement from '../../src/runtime/component/base-element';
import { router } from './router';
import template from './app.html?raw';
import styles from './app.css?inline';

const THEME_STORAGE_KEY = 'solely-theme';

type ThemeMode = 'light' | 'dark';

/**
 * 读取主题偏好。
 *
 * 存储契约与库（src/components/theme）保持一致：值必须是 JSON `{ theme: 'light' | 'dark', colors?: {...} }`。
 * 兼容旧版文档站写入的裸字符串 'dark' / 'light'：识别为合法主题，并立即迁移成 JSON，避免老访客偏好丢失。
 * 存储不可用或内容非法时返回 null。
 */
function readStoredTheme(): ThemeMode | null {
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        // 旧格式兼容：裸字符串 'dark' / 'light'
        if (raw === 'dark' || raw === 'light') {
            writeStoredTheme(raw);
            return raw;
        }

        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        const theme = (parsed as { theme?: unknown }).theme;
        return theme === 'dark' || theme === 'light' ? theme : null;
    } catch {
        return null;
    }
}

/**
 * 写入主题偏好，使用库的 JSON 契约。
 * 若原值已带有合法的 colors（库侧 setTheme 写入），写回时保留，避免文档站切换时覆盖库侧自定义色。
 */
function writeStoredTheme(theme: ThemeMode): void {
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        let colors: unknown;
        if (raw) {
            try {
                const parsed: unknown = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    const savedColors = (parsed as { colors?: unknown }).colors;
                    if (savedColors && typeof savedColors === 'object') {
                        colors = savedColors;
                    }
                }
            } catch {
                // 旧版裸字符串或非法 JSON：无需保留 colors
            }
        }

        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(colors ? { theme, colors } : { theme }));
    } catch {
        // 存储不可用（隐私模式等）时静默忽略，不影响页面内切换
    }
}

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

        // 读取本地保存的主题偏好（JSON 契约，兼容旧版裸字符串并自动迁移），应用到 document
        const savedTheme = readStoredTheme();
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
            writeStoredTheme('dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            writeStoredTheme('light');
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
     * 关闭移动端侧边栏（仅移动端触发，避免桌面端无意义渲染）
     */
    closeSidebar(): void {
        if (window.innerWidth <= 768) {
            this.$data.sidebarOpen = false;
            this.refresh();
        }
    }
}

export default DocsApp;
