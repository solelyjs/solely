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

interface Rgb {
    r: number;
    g: number;
    b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * 解析颜色为 RGB。
 * 支持 #rgb / #rrggbb 与 rgb() / rgba()；其他形式（颜色名、var() 等）返回 null。
 */
function parseColor(value: string): Rgb | null {
    const input = value.trim();

    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input);
    if (hexMatch) {
        const hex = hexMatch[1];
        const full = hex.length === 3 ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : hex;
        return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16),
        };
    }

    const rgbMatch = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(input);
    if (rgbMatch) {
        const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
        return {
            r: clamp(Number(rgbMatch[1])),
            g: clamp(Number(rgbMatch[2])),
            b: clamp(Number(rgbMatch[3])),
        };
    }

    return null;
}

/**
 * 按给定比例向目标色混合，返回 #rrggbb
 */
function mixColor(color: Rgb, target: Rgb, ratio: number): string {
    const channel = (from: number, to: number) =>
        Math.round(from + (to - from) * ratio)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(color.r, target.r)}${channel(color.g, target.g)}${channel(color.b, target.b)}`;
}

/**
 * 由基础色派生 hover / active / light 三档色。
 * 无法解析的颜色（颜色名、var()、渐变等）直接跳过，不覆盖用户已设置的值。
 */
export function deriveColorTokens(colors: Partial<Theme>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(colors)) {
        if (!value) continue;
        const rgb = parseColor(value);
        if (!rgb) continue;

        result[`${key}-light`] = mixColor(rgb, WHITE, 0.9);
        result[`${key}-hover`] = mixColor(rgb, WHITE, 0.2);
        result[`${key}-active`] = mixColor(rgb, BLACK, 0.15);
    }

    return result;
}

/**
 * 设置主题
 * @param config 主题配置
 */
export function setTheme(config: ThemeConfig): void {
    currentTheme = { ...currentTheme, ...config };

    // 非浏览器环境（无 document 或根元素）时只更新内部状态，不写 DOM
    if (typeof document === 'undefined' || !document.documentElement) {
        return;
    }

    // 设置 data-theme 属性
    document.documentElement.setAttribute('data-theme', config.theme);

    // 应用自定义颜色：先写派生色，再写用户显式传入的值（显式值优先）
    if (config.colors) {
        const root = document.documentElement;
        Object.entries(deriveColorTokens(config.colors)).forEach(([key, value]) => {
            root.style.setProperty(`--solely-${key}`, value);
        });
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
 * 读取已保存的主题配置
 * 存储不可用、内容不是合法 JSON 或形状不合法时，均视为"无保存值"
 */
function readSavedTheme(): ThemeConfig | null {
    try {
        // 存储被禁用时，访问 localStorage 本身就会抛 SecurityError，因此访问动作也要放在 try 内
        const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
        const saved = storage?.getItem('solely-theme');
        if (!saved) {
            return null;
        }

        const parsed = JSON.parse(saved) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const { theme, colors } = parsed as ThemeConfig;
        // theme 只认 light / dark
        if (theme !== 'light' && theme !== 'dark') {
            return null;
        }
        // colors 若存在必须是对象
        if (colors !== undefined && (colors === null || typeof colors !== 'object')) {
            return null;
        }

        return colors === undefined ? { theme } : { theme, colors };
    } catch {
        return null;
    }
}

/**
 * 初始化主题
 * 优先级：用户保存的设置 > 系统偏好（仅作为首次初始化的默认值） > 默认浅色
 * 注意：这里只在初始化时读取一次系统偏好，不会持续监听系统主题变化
 */
export function initTheme(): void {
    // 优先使用用户保存的设置（非法内容视为未保存）
    const saved = readSavedTheme();
    if (saved) {
        setTheme(saved);
        return;
    }

    // 其次把系统偏好作为首次默认值；matchMedia 缺失或抛错时降级为默认浅色
    let prefersDark = false;
    try {
        prefersDark =
            typeof window !== 'undefined' && typeof window.matchMedia === 'function'
                ? window.matchMedia('(prefers-color-scheme: dark)').matches
                : false;
    } catch {
        prefersDark = false;
    }

    setTheme({ theme: prefersDark ? 'dark' : 'light' });
}

/**
 * 监听主题变化并保存到 localStorage
 */
export function persistTheme(): void {
    // 无法监听卸载事件的环境直接跳过
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return;
    }

    window.addEventListener('beforeunload', () => {
        try {
            window.localStorage.setItem('solely-theme', JSON.stringify(currentTheme));
        } catch {
            // 存储不可用（隐私模式、配额不足等）时静默忽略
        }
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
