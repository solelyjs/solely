/**
 * 通用工具函数
 */

/**
 * 安全地解析 JSON 字符串
 * @param json - 要解析的 JSON 字符串
 * @param defaultValue - 解析失败时的默认值
 * @returns 解析后的值或默认值
 */
export function safeJsonParse<T>(json: string | undefined, defaultValue: T): T {
    try {
        return JSON.parse(json || JSON.stringify(defaultValue));
    } catch {
        return defaultValue;
    }
}

/**
 * 创建防抖函数
 * @param fn - 要防抖的函数
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
    let timer: number | undefined;

    return function (this: unknown, ...args: unknown[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn.apply(this as unknown, args);
            timer = undefined;
        }, delay) as unknown as number;
    } as T;
}

/**
 * 创建节流函数
 * @param fn - 要节流的函数
 * @param interval - 间隔时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, interval: number): T {
    let lastTime = 0;

    return function (this: unknown, ...args: unknown[]) {
        const now = Date.now();
        if (now - lastTime >= interval) {
            lastTime = now;
            fn.apply(this as unknown, args);
        }
    } as T;
}

/**
 * 图片加载失败时的内置占位图（data URI，离线可用，不会再触发 error）。
 * 文档站 card / empty 示例也直接用它，不再依赖外部图床。
 */
export const IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E" +
    "%3Crect width='400' height='200' fill='%23f0f2f5'/%3E%3Ccircle cx='312' cy='56' r='22' fill='%23d9dde3'/%3E" +
    "%3Cpath d='M0 168 L112 88 L192 148 L272 104 L400 186 L400 200 L0 200 Z' fill='%23d9dde3'/%3E" +
    "%3Cpath d='M0 190 L92 136 L172 180 L252 142 L400 200 L0 200 Z' fill='%23c8cdd4'/%3E%3C/svg%3E";

/**
 * 图片 error 回退：把坏 URL 换成内置占位图。
 * dataset 标记防止占位图异常时反复触发 error 形成循环。
 */
export function fallbackBrokenImage(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img || img.dataset.solelyFallback === '1') return;
    img.dataset.solelyFallback = '1';
    img.src = IMAGE_PLACEHOLDER;
}
