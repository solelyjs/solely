export const runInAsyncQueue = (() => {
    // 缓存异步执行器选择结果
    const asyncExecutor = (() => {
        if (typeof requestAnimationFrame === 'function') {
            // 优先使用 requestAnimationFrame
            return (callback: () => void) => requestAnimationFrame(callback);
        } else if (typeof Promise !== 'undefined') {
            // 使用 Promise.resolve().then
            return (callback: () => void) => Promise.resolve().then(callback);
        } else {
            // 降级使用 setTimeout
            return (callback: () => void) => setTimeout(callback, 0);
        }
    })();

    // 返回一个函数，该函数接受一个回调函数和参数，并异步执行它
    return (callback: Function, ...args: any[]) => {
        if (typeof callback !== 'function') {
            throw new Error('runInAsyncQueue expects a function as its first argument');
        }

        // 异步执行回调函数，并传递参数
        asyncExecutor(() => callback(...args));
    };
})();