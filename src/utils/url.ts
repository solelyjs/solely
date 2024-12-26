/**
 * 获取url参数，包含hash参数和查询参数
 * @param location - 浏览器的location对象或者URL字符串
 * @returns 
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
    const path = hashParts[0].substring(2); // 获取哈希路径，移除开头的'#/'
    const queryParams = hashParts[1]; // 获取查询参数字符串
    const query: { [key: string]: string } = {};

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
        path: path.split('/'), // 将路径分割成数组
        query: query // 查询参数对象
    };
}