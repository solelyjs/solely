/** 函数创建器类型 */
// 注意：TReturn 在使用处以 any 显式实例化是刻意设计——动态编译的函数返回类型
// 在编译期不可知，由调用方（编译器/渲染器）自行断言，收敛为 unknown 会波及整条调用链
export type FunctionCreator<TArgs extends unknown[], TReturn> = (...args: TArgs) => TReturn;

/**
 * 检测当前环境是否受 CSP 限制（不允许 unsafe-eval）
 * 通过尝试创建一个无害的函数来检测
 */
let _cspBlocked: boolean | null = null;

export function isCSPBlocked(): boolean {
    if (_cspBlocked !== null) return _cspBlocked;
    try {
        void new Function('return 1');
        _cspBlocked = false;
    } catch {
        _cspBlocked = true;
    }
    return _cspBlocked;
}

/**
 * 创建函数
 * 注意：安全检查由调用方根据场景决定，此函数仅做基础验证
 * @param args 参数列表，最后一个元素是函数体
 * @returns 创建的函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFunction<TArgs extends unknown[]>(args: string[]): FunctionCreator<TArgs, any> {
    const functionBody = args[args.length - 1];
    if (functionBody.trim() === '') {
        throw new Error('Function body cannot be empty');
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Function(...args) as FunctionCreator<TArgs, any>;
    } catch (e) {
        if (isCSPBlocked()) {
            console.error(
                `[Solely] CSP 阻止了 new Function() 执行。` +
                    `请使用 ?solely 预编译模式（构建时编译，运行时无需 eval），` +
                    `或在 CSP 中添加 'unsafe-eval'。` +
                    `表达式: ${functionBody.substring(0, 80)}`,
            );
        }
        throw e;
    }
}
