import { Meta } from "@/types";

/**
 * 常量和配置
 */
const TAB_SIZE = 4;
const ARROW_MIN = 1;
const PAD_LINE = 3;

/**
 * 颜色主题配置
 */
const COLOR = {
    dark: {
        gutter: '#858585',
        errorLineBg: '#3c1e1e',
        errorLineFg: '#f8f8f2',
        arrow: '#ff6b6b',
        badgeBg: '#ff6b6b',
        badgeFg: '#ffffff',
        exprLabel: '#a0a0a0',
        exprCode: '#5ddcff',
    },
} as const;

const theme = COLOR.dark;

/**
 * 计算字符串显示宽度（考虑Unicode和制表符）
 * @param str 要计算宽度的字符串
 * @returns 字符串的显示宽度
 */
function displayWidth(str: string): number {
    let width = 0;

    for (let i = 0; i < str.length;) {
        const code = str.codePointAt(i)!;
        const char = str[i];

        // 处理制表符
        if (char === '\t') {
            width += TAB_SIZE;
            i++;
            continue;
        }

        // 全宽字符和Unicode图形字符宽度为2，其他为1
        if ((code >= 0x2500 && code <= 0x257F) || code > 0x00FF) {
            width += 2;
        } else {
            width += 1;
        }

        // 处理UTF-16代理对
        i += code > 0xFFFF ? 2 : 1;
    }

    return width;
}

/**
 * 生成错误位置指示器（箭头或波浪线）
 * @param width 指示器宽度
 * @param isMultiLine 是否为多行错误
 * @returns 生成的指示器字符串
 */
function makePointer(width: number, isMultiLine: boolean): string {
    const char = isMultiLine ? '~' : '^';
    return char.repeat(Math.max(ARROW_MIN, width));
}

/**
 * 显示模板错误信息，提供友好的错误提示和代码定位
 * @param error 错误对象
 * @param source 源代码字符串
 * @param meta 错误元数据，包含位置信息和表达式
 * @param componentName 组件名称
 */
export function showTemplateError(
    error: unknown,
    source = '',
    meta?: Meta,
    componentName = 'component',
): void {
    // 获取错误消息
    const errorMessage = (error as Error)?.message ?? String(error);

    // 构建错误徽章和样式
    const badge = `%cTemplate Error%c in <${componentName}> → ${errorMessage}`;
    const badgeCss = [
        `color:${theme.badgeFg};background:${theme.badgeBg};padding:4px 10px;border-radius:6px;font-weight:bold;`,
        `color:${theme.arrow};font-weight:bold;`,
    ];

    // 无定位信息时的降级处理
    if (!source || !meta?.loc || meta.loc.length < 2) {
        console.error(badge, ...badgeCss);

        if (meta?.expr) {
            console.log(`Expression: ${meta.expr.trim()}`);
        }

        return;
    }

    // 获取并规范化行号和列号
    const loc = meta.loc!; // 1-based
    let lineNum = loc[0] || 0;
    let colNum = loc[1] || 0;

    // 确保数值类型
    lineNum |= 0;
    colNum |= 0;

    // 边界检查
    if (lineNum < 1) {
        lineNum = 1;
    }

    if (colNum < 1) {
        colNum = 1;
    }

    // 分割源码为行
    const lines = source.split('\n');

    // 检查行号是否超出范围
    if (lineNum > lines.length) {
        console.error(`[Template Error] 行号 ${lineNum} 超出范围`);
        return;
    }

    // 计算显示范围
    const lineIdx = lineNum - 1;
    const start = Math.max(0, lineIdx - PAD_LINE);
    const end = Math.min(lines.length - 1, lineIdx + PAD_LINE);
    const maxLen = String(end + 1).length;

    // 计算表达式显示宽度（支持多行）
    const expr = meta.expr?.trim() ?? '';
    const exprLines = expr ? expr.split('\n') : [];
    const exprWidth = expr ? Math.max(...exprLines.map(displayWidth)) : 0;
    const isMultiExpr = exprLines.length > 1;

    // 样式定义
    const styleNumGutter = `color:${theme.gutter};`;
    const styleNumErr = `color:${theme.arrow};font-weight:bold;`;
    const styleCodeGutter = `color:${theme.gutter};`;
    const styleCodeErr = `color:${theme.errorLineFg};background:${theme.errorLineBg};padding:0 4px;`;
    const stylePointerPrefix = `color:${theme.gutter};`;
    const stylePointer = `color:${theme.arrow};font-weight:bold;padding:0 4px;`;

    // 开始错误详情组
    console.groupCollapsed(
        `${badge} %c(Line:${lineNum}, Col:${colNum})`,
        ...badgeCss,
        `color:${theme.gutter};font-weight:normal;`,
    );

    // 打印代码片段（包含错误行和上下文）
    for (let i = start; i <= end; i++) {
        const line = lines[i];
        const lineNumber = String(i + 1).padStart(maxLen, ' ');
        const isErrorLine = i === lineIdx;

        // 非错误行的处理
        if (!isErrorLine) {
            console.log(`%c${lineNumber} │%c ${line}`, styleNumGutter, styleCodeGutter);
            continue;
        }

        // 错误行的处理
        const beforeError = line.slice(0, Math.max(0, colNum - 1));
        // 确保即使代码行开头是空格或换行，波浪线也能正确对齐
        const errorIndent = displayWidth(beforeError);
        const basePrefixSpaces = ' '.repeat(maxLen + 3);
        const formattedLineNum = lineNumber.padEnd(maxLen, ' ');

        // 先打印源码行
        console.log(`%c${formattedLineNum} │%c ${line}`, styleNumErr, styleCodeErr);

        // 波浪线总是显示在错误行下方
        if (isMultiExpr) {
            // 多行表达式的处理
            for (let j = 0; j < exprLines.length; j++) {
                const exprLine = exprLines[j];
                const targetLineIdx = lineIdx + j;
                let currentIndent = 0;

                if (j === 0) {
                    // 首行直接使用错误位置的缩进，确保正确处理开头的空格或换行
                    currentIndent = errorIndent;
                } else if (targetLineIdx < lines.length) {
                    const srcLine = lines[targetLineIdx];
                    // 精确计算前导空白字符的显示宽度，确保正确对齐
                    const firstNonSpaceIndex = srcLine.search(/\S/);
                    const leadingWhitespace = firstNonSpaceIndex === -1
                        ? srcLine
                        : srcLine.slice(0, firstNonSpaceIndex);
                    currentIndent = displayWidth(leadingWhitespace);
                }

                // 计算指示器宽度并生成指示器
                const pointerWidth = Math.max(ARROW_MIN, displayWidth(exprLine));
                const pointer = makePointer(pointerWidth, true);
                // 构建前缀空格，确保即使有前导空白也能正确对齐
                const prefix = basePrefixSpaces + ' '.repeat(currentIndent);

                // 对于首行，直接在错误行下方显示波浪线
                if (j === 0) {
                    console.log(`%c${prefix}%c${pointer}`, stylePointerPrefix, stylePointer);
                }
                // 对于后续行，确保行号正确
                else if (targetLineIdx < lines.length) {
                    const targetLineNum = String(targetLineIdx + 1).padEnd(maxLen, ' ');
                    const targetLine = lines[targetLineIdx];
                    console.log(`%c${targetLineNum} │%c ${targetLine}`, styleNumErr, styleCodeErr);
                    console.log(`%c${prefix}%c${pointer}`, stylePointerPrefix, stylePointer);
                }
            }
        } else {
            // 单行表达式的波浪线，显示在错误行下方
            // 确保正确处理开头的空格或换行
            const prefix = basePrefixSpaces + ' '.repeat(errorIndent);
            const pointer = makePointer(exprWidth || ARROW_MIN, false);
            console.log(`%c${prefix}%c${pointer}`, stylePointerPrefix, stylePointer);
        }
    }

    // 打印错误表达式（如果有）
    if (expr) {
        console.log(
            `%cExpression:%c ${expr}`,
            `color:${theme.exprLabel};font-weight:bold;`,
            `color:${theme.exprCode};font-family:monospace;`,
        );
    }

    // 结束错误详情组
    console.groupEnd();
}