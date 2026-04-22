/**
 * Solely 组件库 - 主题系统
 */

export interface Theme {
    primary: string;
    success: string;
    warning: string;
    error: string;
    [key: string]: string;
}

export interface ThemeConfig {
    theme: 'light' | 'dark';
    colors?: Partial<Theme>;
}

let currentTheme: ThemeConfig = {
    theme: 'light',
};

/**
 * 设置主题
 * @param config 主题配置
 */
export function setTheme(config: ThemeConfig): void {
    currentTheme = { ...currentTheme, ...config };

    // 设置 data-theme 属性
    document.documentElement.setAttribute('data-theme', config.theme);

    // 应用自定义颜色
    if (config.colors) {
        const root = document.documentElement;
        Object.entries(config.colors).forEach(([key, value]) => {
            root.style.setProperty(`--solely-${key}`, value ?? '');
        });
    }
}

/**
 * 获取当前主题
 * @returns 当前主题配置
 */
export function getTheme(): ThemeConfig {
    return { ...currentTheme };
}

/**
 * 切换明暗主题
 */
export function toggleTheme(): void {
    const newTheme = currentTheme.theme === 'light' ? 'dark' : 'light';
    setTheme({ ...currentTheme, theme: newTheme });
}

/**
 * 初始化主题
 * 从 localStorage 读取或根据系统偏好设置
 */
export function initTheme(): void {
    // 尝试从 localStorage 读取
    const saved = localStorage.getItem('solely-theme');
    if (saved) {
        try {
            const config = JSON.parse(saved) as ThemeConfig;
            setTheme(config);
            return;
        } catch {
            // 解析失败，使用默认
        }
    }

    // 根据系统偏好
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme({ theme: prefersDark ? 'dark' : 'light' });
}

/**
 * 监听主题变化并保存到 localStorage
 */
export function persistTheme(): void {
    window.addEventListener('beforeunload', () => {
        localStorage.setItem('solely-theme', JSON.stringify(currentTheme));
    });
}

// 自动初始化（如果不在服务端）
if (typeof window !== 'undefined') {
    initTheme();
    persistTheme();
}

export default {
    setTheme,
    getTheme,
    toggleTheme,
    initTheme,
    persistTheme,
};
