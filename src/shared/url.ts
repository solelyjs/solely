/**
 * 获取url参数，包含hash参数和查询参数
 * @param location 浏览器的location对象或者URL字符串
 * @returns 解析后的路径和查询参数对象
 */
export function parseHashUrl(location?: Location | string) {
    let hash: string;
    if (typeof location === 'string') {
        const url = new URL(location, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
        hash = url.hash;
    } else if (location) {
        hash = location.hash;
    } else {
        hash = window.location.hash;
    }

    const queryIndex = hash.indexOf('?');
    let path = queryIndex === -1 ? hash : hash.slice(0, queryIndex);
    const queryParams = queryIndex === -1 ? '' : hash.slice(queryIndex + 1);
    const query: { [key: string]: string } = {};

    // 移除开头的'#'和可能存在的'/'
    path = path.replace(/^#\/?/, '');

    if (queryParams) {
        new URLSearchParams(queryParams).forEach((value, key) => {
            Object.defineProperty(query, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        });
    }

    return {
        path: path.split('/').filter(Boolean), // 将路径分割成数组并过滤空字符串
        query: query, // 查询参数对象
    };
}
