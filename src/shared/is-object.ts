// is-object.ts
export const isObject = (value: unknown): boolean => {
    if (value === null) return false;
    if (typeof value !== "object") return false;

    // 排除特殊内置对象
    const typeString = Object.prototype.toString.call(value);
    const excludedTypes = [
        "[object Function]",
        "[object Date]",
        "[object RegExp]",
        "[object Map]",
        "[object Set]",
        "[object WeakMap]",
        "[object WeakSet]"
    ];

    if (excludedTypes.includes(typeString)) return false;

    return true; // 普通对象或数组
};
