/** 函数创建器类型 */
export type FunctionCreator<TArgs extends any[], TReturn> = (...args: TArgs) => TReturn;

/**
 * 创建函数
 * 注意：安全检查由调用方根据场景决定，此函数仅做基础验证
 * @param args 参数列表，最后一个元素是函数体
 * @returns 创建的函数
 */
export function createFunction<TArgs extends any[]>(args: string[]): FunctionCreator<TArgs, any> {
    const functionBody = args[args.length - 1];
    if (functionBody.trim() === '') {
        throw new Error('Function body cannot be empty');
    }

    return new Function(...args) as FunctionCreator<TArgs, any>;
}
