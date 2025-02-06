export type FunctionCreator<TArgs extends any[], TReturn> = (...args: TArgs) => TReturn;

interface ICachedFunction {
    [key: string]: FunctionCreator<any[], any>;
}

const cachedFunctions: ICachedFunction = {};

export function createFunction<TArgs extends any[]>(args: string[]): FunctionCreator<TArgs, any> {
    const key = args.map(a => a.replace(/[',"]/g, '')).join(',');

    if (!cachedFunctions[key]) {
        const functionBody = args[args.length - 1];
        if (functionBody.trim() === '') {
            throw new Error('Function body cannot be empty');
        }

        // 检查函数体是否包含危险代码
        if (containsDangerousCode(functionBody)) {
            throw new Error('Input contains potentially dangerous code: ' + functionBody);
        }

        cachedFunctions[key] = new Function(...args) as FunctionCreator<TArgs, any>;
    }

    return cachedFunctions[key]! as FunctionCreator<TArgs, any>;
}

const ESSENTIAL_DANGERS = ['eval', 'Function', 'process', 'require'];

function containsDangerousCode(str: string): boolean {
    return ESSENTIAL_DANGERS.some(code => {
        const regex = new RegExp(`\\b${code}\\b`, 'g');
        return regex.test(str);
    });
}