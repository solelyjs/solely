import { IRLocal } from '@/types';
import { createFunction } from './functions';

export type GenType = 'template' | 'handler' | 'expression' | 'lifecycle';

// 正则表达式常量
const ILLEGAL_INTERPOLATION_RE = /\{\{\{\s*[\s\S]*?\s*\}\}\}/;
const INTERPOLATION_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;

/**
 * 预处理模板代码
 */
function preprocessTemplate(code: string, type: GenType): { processed: string; error?: string } {
    if (!code?.trim()) return { processed: '' };

    if (ILLEGAL_INTERPOLATION_RE.test(code)) {
        return {
            processed: code,
            error: 'Illegal interpolation syntax: use {{ }} instead of {{{ }}}',
        };
    }

    if (type === 'template') {
        try {
            const processed = code.replace(INTERPOLATION_RE, (_, expr) => {
                return `\${${expr.trim()}}`;
            });
            return { processed };
        } catch (e) {
            return {
                processed: code,
                error: `Template parse error: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
    }

    return { processed: code };
}

/**
 * 根据类型生成函数体内容
 */
function buildBody(processedCode: string, type: GenType): string {
    const ensureSemi = (s: string) => (s.endsWith(';') ? s : s + ';');

    switch (type) {
        case 'template':
            return `return \`${processedCode}\`;`;
        case 'expression':
            return `return (${processedCode});`;
        case 'handler':
        case 'lifecycle':
            return ensureSemi(processedCode);
        default:
            return `return undefined;`;
    }
}

/**
 * 生成循环变量的解构代码
 */
function buildLoopContext(locals: IRLocal[]) {
    if (!locals.length) return { loopValues: '', loopIndices: '' };

    const items = locals.map(l => l.i).join(', ');
    const indices = locals.map(l => l.x).join(', ');

    return {
        loopValues: `var [${items}] = loops.map(l => l.itmVal);`,
        loopIndices: `var [${indices}] = loops.map(l => l.idxVal);`,
    };
}

/**
 * 构造参数列表
 */
function buildArgs(type: GenType, body: string, loopValues: string, loopIndices: string): string[] {
    const args = type === 'lifecycle' ? ['el', 'loops'] : type === 'handler' ? ['event', 'loops'] : ['loops'];

    const eventVars = type === 'handler' ? `const { value, checked } = event?.target || {};` : '';

    const content = `
        const { $data } = this;
        ${eventVars}
        ${loopValues}
        ${loopIndices}
        ${body}
    `.replace(/^\s+|\s+$/gm, '');

    args.push(content);
    return args;
}

/**
 * 主入口：生成可执行的函数（支持上层捕获异常）
 * 注意：缓存逻辑由上层 FunctionCompiler 统一管理，此处不做重复缓存
 */
export function genFunction(code: string, type: GenType, locals: IRLocal[]): Function {
    if (!code?.trim()) return () => '';

    const { processed, error: preError } = preprocessTemplate(code, type);

    // 模式：返回一个专门用于触发错误堆栈的闭包
    if (preError) {
        return function safeCompileErrorWrapper() {
            // 这里抛出简单信息，由上层 runtime 捕获后进行富文本格式化
            throw new Error(`[Compile Error] ${preError} Original: ${code}`);
        };
    }

    try {
        const body = buildBody(processed, type);
        const { loopValues, loopIndices } = buildLoopContext(locals);
        const args = buildArgs(type, body, loopValues, loopIndices);

        return createFunction(args);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return function safeParseErrorWrapper() {
            throw new Error(`[Parse Error] ${errorMsg} Original: ${code}`);
        };
    }
}
