/**
 * 获取url参数，包含hash参数和查询参数
 * @param location 浏览器的location对象或者URL字符串
 * @returns 解析后的路径和查询参数对象
 */
export function parseHashUrl(location: Location | string = window.location) {
    let hash: string;
    if (typeof location === 'string') {
        const url = new URL(location);
        hash = url.hash;
    } else {
        hash = location.hash;
    }

    const hashParts = hash.split('?');
    let path = hashParts[0]; // 获取哈希路径，包含开头的'#'
    const queryParams = hashParts[1]; // 获取查询参数字符串
    const query: { [key: string]: string } = {};

    // 移除开头的'#'和可能存在的'/'
    path = path.replace(/^#\/?/, '');

    if (queryParams) {
        // 解析查询参数
        queryParams.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                query[decodeURIComponent(key)] = decodeURIComponent(value);
            }
        });
    }

    return {
        path: path.split('/').filter(Boolean), // 将路径分割成数组并过滤空字符串
        query: query, // 查询参数对象
    };
}
