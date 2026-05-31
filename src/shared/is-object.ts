/**
 * 检查值是否为普通对象（排除 null、函数、Date、RegExp、Map、Set 等）
 * @param value 要检查的值
 * @returns 如果是普通对象或数组返回 true
 */
const EXCLUDED_TAGS = new Set([
    '[object Function]',
    '[object Date]',
    '[object RegExp]',
    '[object Map]',
    '[object Set]',
    '[object WeakMap]',
    '[object WeakSet]',
]);

export const isObject = (value: unknown): boolean => {
    if (value === null) return false;
    if (typeof value !== 'object') return false;

    return !EXCLUDED_TAGS.has(Object.prototype.toString.call(value));
};
