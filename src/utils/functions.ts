export type FunctionCreator = (...args: any[]) => any;

interface ICachedFunction {
    [key: string]: FunctionCreator;
}

const cachedFunctions: ICachedFunction = {};

export function createFunction(args: string[]): FunctionCreator {
    // 将参数数组转换为一个字符串，用作缓存的键
    const key = args.join(',');
    // 检查缓存中是否已经存在该函数
    if (!cachedFunctions[key]) {
        // 获取参数数组中的最后一个元素，即函数体
        const str = args[args.length - 1];

        // 检查函数体是否为空
        if (str.trim() === '') {
            // 如果函数体为空，抛出错误
            throw new Error('Function body is empty');
        }

        // 检查函数体是否包含危险代码
        if (containsDangerousCode(str)) {
            // 如果包含危险代码，抛出错误
            throw new Error('Input contains potentially dangerous code: ' + str);
        }

        // 使用 Function 构造函数创建一个新的函数
        const f = new Function(...args) as FunctionCreator;
        // 将新创建的函数存储到缓存中
        cachedFunctions[key] = f;
    }
    // 返回缓存中的函数，使用非空断言操作符，因为我们知道函数一定存在
    return cachedFunctions[key]!;
}

function containsDangerousCode(str: string): boolean {
    // 定义一个包含危险代码关键字的数组
    const dangerousCodes = [
        'eval', 'Function', 'setTimeout', 'setInterval',
        'window', 'global', 'require', 'XMLHttpRequest',
        'fetch', 'console', 'debugger', 'process',
        'document', 'importScripts', 'String.raw',
        'Object.prototype', 'JSON.parse'
    ];
    // 检查字符串是否包含数组中的任何一个关键字
    return dangerousCodes.some(code => str.includes(code));
}