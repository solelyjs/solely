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
