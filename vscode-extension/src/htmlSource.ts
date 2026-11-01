/**
 * HTML 模板的文本分析辅助。
 *
 * 两个能力：
 * 1. `maskHtmlNonContent` —— 把注释 / `<style>` / `<script>` 替换成等长空格，
 *    让控制流标签、插值、属性语法的校验不再被「注释掉的旧代码」和「脚本里的 `<`」干扰。
 * 2. `collectExpressionRegions` —— 只挑出真正会被 Solely 编译成表达式的片段
 *    （`{{ ... }}` 的插值内容、动态属性的属性值），引用校验只在这些区域里做，
 *    正文里出现的 `this.xxx()` 文案就不会再被误判。
 *
 * 两个函数的返回值都与入参**逐字符对齐**，下标可直接复用。
 */

export interface TextRange {
    start: number;
    end: number;
}

/** 动态属性：`@click` / `onclick` / `:class` / `s-model` / `s-visible` / 控制流与生命周期属性 */
const DYNAMIC_ATTR_RE = new RegExp(
    String.raw`\s(?:@[\w-]+|on[\w-]+|:[\w-]+|s-[\w-]+|test|each|item|index|condition|` +
        String.raw`mounted|updated|unmounted|activated|deactivated|` +
        String.raw`onMounted|onUpdated|onUnmounted|onActivated|onDeactivated)` +
        // 带引号的值，或框架同样支持的不带引号写法（`@click=this.foo()`）
        String.raw`\s*=\s*(?:(["'])([\s\S]*?)\1|([^\s>]+))`,
    'g',
);

function blankRange(chars: string[], from: number, to: number): void {
    for (let i = from; i < to && i < chars.length; i++) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
}

/**
 * 把注释、`<style>`、`<script>` 整体替换为空格（保留换行）。
 * 注意：标签本身也一起被抹掉——它们不参与 Solely 校验，抹掉可以避免
 * `<script>` 里的 `a < b` 被当成标签起始。
 */
export function maskHtmlNonContent(text: string): string {
    const chars = text.split('');

    // 注释
    let i = 0;
    while ((i = text.indexOf('<!--', i)) !== -1) {
        const end = text.indexOf('-->', i + 4);
        const stop = end === -1 ? text.length : end + 3;
        blankRange(chars, i, stop);
        i = stop;
    }

    // 注释抹掉之后重新取一份文本：注释里的 `<script>` 不能参与后面的匹配，
    // 否则会被当成「未闭合 script」把文件剩余部分整段抹掉（静默漏报）。
    const afterComments = chars.join('');

    // <style> / <script>
    const blockRe = /<(style|script)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(afterComments)) !== null) {
        blankRange(chars, match.index, match.index + match[0].length);
    }

    // 未闭合的 <script>/<style>：抹到文件末尾（与框架 parser 的行为一致）。
    // 注意必须用「块已抹掉」之后的快照——否则 <style> 里的 "<script>" 字样
    // 会被当成未闭合标签，把文件剩余部分整段抹掉（静默漏报）。
    const afterBlocks = chars.join('');
    const openRe = /<(style|script)\b[^>]*>/gi;
    while ((match = openRe.exec(afterBlocks)) !== null) {
        // 只有真正处于标签起始位置才算：前一个非空白字符必须是 `>` 或文件开头。
        // `title="<script>"` 这种引号内的文本不算。
        const prev = afterBlocks.slice(0, match.index).replace(/\s+$/, '').slice(-1);
        if (prev !== '' && prev !== '>') continue;
        blankRange(chars, match.index, text.length);
        break;
    }

    return chars.join('');
}

/**
 * 收集所有会被编译成表达式的区域：`{{ ... }}` 的内容、动态属性值。
 * 传入的应当是**掩码后**的文本（注释里的 `{{ }}` 已被抹掉）。
 */
export function collectExpressionRegions(masked: string): TextRange[] {
    const regions: TextRange[] = [];

    const interpolation = /\{\{([\s\S]*?)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = interpolation.exec(masked)) !== null) {
        const start = match.index + 2;
        regions.push({ start, end: start + match[1].length });
    }

    DYNAMIC_ATTR_RE.lastIndex = 0;
    while ((match = DYNAMIC_ATTR_RE.exec(masked)) !== null) {
        const value = match[2] ?? match[3] ?? '';
        // 带引号时尾部还有一个引号要减掉
        const valueStart = match.index + match[0].length - value.length - (match[2] === undefined ? 0 : 1);
        regions.push({ start: valueStart, end: valueStart + value.length });
    }

    return regions;
}

/** 把字符下标换算成 0 基的 { line, col } */
export function offsetToLineCol(lineStarts: number[], offset: number): { line: number; col: number } {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lineStarts[mid] <= offset) lo = mid + 1;
        else hi = mid - 1;
    }
    const line = Math.max(0, hi);
    return { line, col: offset - lineStarts[line] };
}

/** 预计算每行起始下标，配合 offsetToLineCol 使用（比每行重新切分快得多） */
export function computeLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') starts.push(i + 1);
    }
    return starts;
}
