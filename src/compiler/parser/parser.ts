import { listeners } from '../../shared';
import { SourceLocation, Attribute, mapAttrKeyToLifecycleKind, ASTNode, ASTType } from '../../types';

const tagNameRE = /<\/?([A-Za-z][A-Za-z0-9\-\:]*)[>\s\/]/;
const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);
const attrRE = /\s*([^\s"'/>=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gs;

function parseAttributes(tag: string, tagLoc: SourceLocation): Attribute[] {
    const attributes: Attribute[] = [];
    let match: RegExpExecArray | null;

    // 去掉标签名，方便正则只匹配属性部分
    const tagContent = tag.replace(/^\s*[^\s"'/>]+/, '');
    const offset = tag.length - tagContent.length; // 标签名被去掉的偏移量

    while ((match = attrRE.exec(tagContent)) !== null) {
        const rawKey = match[1];
        if (!rawKey) continue;

        // 属性值（如果有）
        const value = match[2] ?? match[3] ?? match[4] ?? '';

        // key 前缀转换
        let key = rawKey;
        if (listeners.has(rawKey)) key = key.replace(/^on/, '@');
        if (key !== 's-model') key = key.replace(/^on-/, '@').replace(/^s-/, ':');
        key = mapAttrKeyToLifecycleKind(key) || key; // 生命周期

        // 更可靠地计算 value 在 match[0] 中的起始位置（相对 match[0]）
        const m0 = match[0];
        const eqPos = m0.indexOf('=');

        let valueStartInMatch: number;
        if (eqPos === -1) {
            // 布尔属性：没有 '='，将位置指向 key 之后（相对 match 的位置）
            // 注意 match.index + rawKey.length 指向 match 中 key 末尾（可能有空格），这是合理的近似。
            valueStartInMatch = m0.indexOf(rawKey) + rawKey.length;
        } else {
            // 有 '='，从 '=' 后面开始寻找 value 的真实起点（跳过空格）
            let pos = eqPos + 1;
            // skip spaces
            while (pos < m0.length && /\s/.test(m0[pos])) pos++;

            // 如果是引号，真实值在引号之后；否则值从这里开始
            if (m0[pos] === '"' || m0[pos] === "'") {
                let p = pos + 1;

                // 跳过引号后所有空白，包括空格、tab、换行
                while (p < m0.length && /\s/.test(m0[p])) {
                    p++;
                }

                valueStartInMatch = p;
            } else {
                // 非引号值（如 foo=abc）
                let p = pos;
                while (p < m0.length && /\s/.test(m0[p])) p++;
                valueStartInMatch = p;
            }
        }

        // 将相对 match 的位置转换为 tagContent 中的绝对位置，再加上被去掉的标签名偏移，得到原始 tag 中的位置
        const valueIndex = match.index + valueStartInMatch + offset;

        // 计算行列（基于原始 tag 的索引）
        const substring = tag.slice(0, valueIndex);
        const lines = substring.split('\n');
        const line = tagLoc[0] + lines.length - 1;
        const col = lines.length > 1 ? lines[lines.length - 1].length + 1 : tagLoc[1] + valueIndex;

        attributes.push({ key, value, loc: [line, col] });
    }

    return attributes;
}

/** 解析单个标签，返回最简单的 ASTNode */
function parseTag(tag: string, tagLoc: SourceLocation): ASTNode {
    const tagName = (tag.match(tagNameRE) || [])[1]?.toLowerCase() ?? '';
    const attrs = parseAttributes(tag, tagLoc);

    // 智能映射到 ASTType
    const typeMap: Record<string, ASTType> = {
        for: ASTType.For,
        if: ASTType.If,
        elseif: ASTType.ElseIf,
        else: ASTType.Else,
    };
    const type = typeMap[tagName] ?? ASTType.Element;
    return {
        type,
        tag: tagName,
        loc: tagLoc,
        children: [],
        attrs,
    };
}

/**
 * 查找从 start(指向 '<' 之后第一个字符) 开始对应的 '>' 下标
 */
function findTagEnd(html: string, start: number): number {
    const len = html.length;

    // 注释
    if (html.startsWith('!--', start)) {
        const end = html.indexOf('-->', start + 3);
        return end === -1 ? -1 : end + 2;
    }

    // CDATA
    if (html.startsWith('![CDATA[', start)) {
        const end = html.indexOf(']]>', start + 8);
        return end === -1 ? -1 : end + 2;
    }

    // DOCTYPE or !doctype or <! ... >
    if (html[start] === '!') {
        const gt = html.indexOf('>', start + 1);
        return gt;
    }

    // processing instruction <? ... ?>
    if (html[start] === '?') {
        const end = html.indexOf('?>', start + 1);
        return end === -1 ? -1 : end + 1;
    }

    // 常规标签：逐字符处理引号
    let inSingle = false;
    let inDouble = false;
    let i = start;

    while (i < len) {
        const ch = html[i];
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (ch === '>' && !inSingle && !inDouble) {
            return i;
        }
        i++;
    }
    return -1;
}

/**
 * 主解析函数：生成最简单的 AST
 * @param html HTML 字符串
 * @returns AST 节点数组
 */
export function parseHtml(html: string): ASTNode[] {
    const astNodes: ASTNode[] = [];
    if (!html) return [];

    const stack: ASTNode[] = [];
    const openingTags: string[] = [];

    const getCurrent = (): ASTNode[] => (stack.length === 0 ? astNodes : (stack[stack.length - 1].children ||= []));

    let index = 0;
    const length = html.length;

    // 构建 index -> line/col 映射
    const lineStarts: number[] = [0];
    for (let i = 0; i < length; i++) if (html[i] === '\n') lineStarts.push(i + 1);

    function getLoc(idx: number): SourceLocation {
        let line = 0;
        for (let i = 1; i < lineStarts.length; i++) {
            if (lineStarts[i] > idx) break;
            line = i;
        }
        return [line + 1, idx - lineStarts[line] + 1];
    }

    while (index < length) {
        const nextTagStart = html.indexOf('<', index);

        // -------- 文本节点 --------
        if (nextTagStart === -1 || nextTagStart > index) {
            const rawText = html.substring(index, nextTagStart === -1 ? undefined : nextTagStart);
            const trimmed = rawText.trim();
            if (trimmed) {
                const relativeStart = rawText.indexOf(trimmed);
                const startPos = index + relativeStart;
                const loc = getLoc(startPos);

                getCurrent().push({
                    type: ASTType.Text,
                    tag: 'text',
                    content: trimmed,
                    loc,
                    children: [],
                });
            }
            if (nextTagStart === -1) break;
            index = nextTagStart;
        }

        // -------- 标签 --------
        const tagEnd = findTagEnd(html, index + 1);
        if (tagEnd === -1) {
            const remaining = html.substring(index);
            if (remaining.trim()) {
                getCurrent().push({
                    type: ASTType.Text,
                    tag: 'text',
                    content: remaining.trim(),
                    children: [],
                    loc: getLoc(index),
                });
            }
            break;
        }

        const tag = html.substring(index, tagEnd + 1);
        const current = getCurrent();
        const loc = getLoc(index);

        // -------- 特殊标签 --------
        if (tag.startsWith('<!--')) {
            current.push({
                type: ASTType.Comment,
                tag: 'comment',
                content: tag.slice(4, -3),
                loc,
                children: [],
            });
            index = tagEnd + 1;
            continue;
        }

        if (tag.startsWith('<![CDATA[')) {
            current.push({
                type: ASTType.Text,
                tag: 'text',
                content: tag.slice(9, -3),
                loc,
                children: [],
            });
            index = tagEnd + 1;
            continue;
        }

        if (tag.startsWith('<!') && !tag.startsWith('<!--')) {
            current.push({
                type: ASTType.Comment,
                tag: 'comment',
                content: tag.slice(2, -1),
                loc,
                children: [],
            });
            index = tagEnd + 1;
            continue;
        }

        if (tag.startsWith('<?')) {
            current.push({
                type: ASTType.Comment,
                tag: 'comment',
                content: tag.slice(2, -2),
                loc,
                children: [],
            });
            index = tagEnd + 1;
            continue;
        }

        // -------- 闭合标签 --------
        if (tag.startsWith('</')) {
            const lastOpeningTag = openingTags.pop();
            while (stack.length > 0) {
                const top = stack[stack.length - 1];
                // 找 tag 名匹配
                const topTag = top.tag || '';
                if (topTag.toLowerCase() === lastOpeningTag?.toLowerCase()) {
                    stack.pop();
                    break;
                }
                stack.pop();
            }
            index = tagEnd + 1;
            continue;
        }

        // -------- 开标签 --------
        const ast = parseTag(tag, loc); // ✅ 新版 parseTag
        current.push(ast);

        // script/style 内部文本
        const tagName = ast.tag || '';
        const isScript = tagName.toLowerCase().startsWith('script');
        const isStyle = tagName.toLowerCase().startsWith('style');
        const isVoidElement = tag.endsWith('/>') || voidElements.has(tagName.toLowerCase());

        if ((isScript || isStyle) && !isVoidElement) {
            const closeTag = `</${tagName}>`;
            const idxLower = html.toLowerCase().indexOf(closeTag, tagEnd + 1);
            if (idxLower !== -1) {
                const rawInner = html.substring(tagEnd + 1, idxLower);
                if (rawInner.length) {
                    ast.children!.push({
                        type: ASTType.Text,
                        tag: 'text',
                        content: rawInner,
                        loc: getLoc(tagEnd + 1),
                        children: [],
                    });
                }
                index = idxLower + closeTag.length;
                continue;
            } else {
                const rawInner = html.substring(tagEnd + 1);
                if (rawInner.length) {
                    ast.children!.push({
                        type: ASTType.Text,
                        tag: 'text',
                        content: rawInner,
                        loc: getLoc(tagEnd + 1),
                        children: [],
                    });
                }
                index = length;
                continue;
            }
        }

        // -------- 入栈 --------
        if (!isVoidElement && ast.type !== ASTType.Text && ast.type !== ASTType.Comment) {
            stack.push(ast);
            openingTags.push(tagName);
        }

        index = tagEnd + 1;
    }

    return astNodes;
}
