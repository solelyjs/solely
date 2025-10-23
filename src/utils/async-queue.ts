// 只计算一次异步执行器
const asyncExecutor = (() => {
    if (typeof requestAnimationFrame === 'function') {
        return (callback: () => void) => requestAnimationFrame(callback);
    } else if (typeof Promise !== 'undefined') {
        return (callback: () => void) => Promise.resolve().then(callback);
    } else {
        return (callback: () => void) => setTimeout(callback, 0);
    }
})();

// 导出函数，使用缓存的执行器
export const runInAsyncQueue = (callback: Function, ...args: any[]) => {
    if (typeof callback !== 'function') {
        throw new Error('runInAsyncQueue expects a function as its first argument');
    }
    asyncExecutor(() => callback(...args));
};
