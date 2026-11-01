/**
 * 轻量 TypeScript 结构扫描器。
 *
 * 设计要点：不引入 `typescript` 包（扩展保持零运行时依赖，包体不受影响），
 * 而是先把源码「掩码」成**等长**文本——注释、字符串、模板字符串整体替换为空格
 * （保留换行），再在掩码文本上做括号配平与成员扫描。因为长度和下标完全一致，
 * 所有定位都能直接映射回原文。
 *
 * 之所以不用正则逐行匹配：组件库里的方法签名经常是多行的
 * （`getNodeClasses(\n  node: TreeNode,\n): Record<string, boolean> {`），
 * 参数列表里的 `)`、默认值里的 `{`、泛型里的 `<>` 都会让行内正则失效。
 */

export interface ClassInfo {
    name: string;
    /** `extends` 的类名（已去掉命名空间前缀），无则 null */
    extendsName: string | null;
    /** `extends BaseElement<X>` 中的 `X` 原文 */
    extendsTypeArg: string | null;
    /** `extendsTypeArg` 在源码中的起始下标（指向 `<` 之后第一个字符） */
    extendsTypeArgStart: number;
    /** `class` 关键字下标 */
    keywordIndex: number;
    /** 类体 `{` 的下标 */
    bodyStart: number;
    /** 类体 `}` 的下标 */
    bodyEnd: number;
}

export type MemberKind = 'method' | 'getter' | 'setter' | 'property' | 'arrow';

export interface MemberInfo {
    name: string;
    kind: MemberKind;
    /** 原始参数文本（可能跨行） */
    params: string;
    returnType: string | null;
    /** 名字在源码中的起始下标 */
    nameIndex: number;
}

/** 可以在正则起始位置前出现的字符 */
const REGEX_PREFIX_CHARS = new Set([
    '(',
    ',',
    '=',
    ':',
    '[',
    '!',
    '&',
    '|',
    '?',
    '{',
    '}',
    ';',
    '+',
    '-',
    '*',
    '%',
    '<',
    '>',
    '~',
    '^',
]);

/**
 * 把注释 / 字符串 / 模板字符串 / 正则字面量替换为等长空格（保留换行）。
 * 返回文本与入参**逐字符对齐**，可以安全地用同一组下标互查。
 */
export function maskTypeScript(source: string): string {
    const out = source.split('');
    const n = source.length;

    const blank = (from: number, to: number): void => {
        for (let k = from; k < to && k < n; k++) {
            if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
        }
    };

    let prevSignificant = '';
    let i = 0;

    while (i < n) {
        const ch = source[i];
        const next = source[i + 1];

        if (ch === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? n : end;
            blank(i, stop);
            i = stop;
            continue;
        }

        if (ch === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            blank(i, stop);
            i = stop;
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            let k = i + 1;
            while (k < n) {
                if (source[k] === '\\') {
                    k += 2;
                    continue;
                }
                if (source[k] === quote) {
                    k++;
                    break;
                }
                k++;
            }
            blank(i, k);
            i = k;
            continue;
        }

        if (ch === '/' && (prevSignificant === '' || REGEX_PREFIX_CHARS.has(prevSignificant))) {
            let k = i + 1;
            let inClass = false;
            let closed = false;
            while (k < n) {
                const c = source[k];
                if (c === '\\') {
                    k += 2;
                    continue;
                }
                if (c === '\n') break;
                if (c === '[') inClass = true;
                else if (c === ']') inClass = false;
                else if (c === '/' && !inClass) {
                    k++;
                    closed = true;
                    break;
                }
                k++;
            }
            if (closed) {
                while (k < n && /[a-z]/i.test(source[k])) k++;
                blank(i, k);
                i = k;
                continue;
            }
        }

        if (!/\s/.test(ch)) prevSignificant = ch;
        i++;
    }

    return out.join('');
}

/** 从 `openIndex` 处的 `{` / `(` / `[` 找到配对的闭合下标，找不到返回 -1 */
export function findMatchingBracket(masked: string, openIndex: number): number {
    const open = masked[openIndex];
    const close = open === '{' ? '}' : open === '(' ? ')' : open === '[' ? ']' : null;
    if (!close) return -1;

    let depth = 0;
    for (let i = openIndex; i < masked.length; i++) {
        if (masked[i] === open) depth++;
        else if (masked[i] === close) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * 跳过一段 `<...>`（含嵌套），返回 `>` 之后的下标；不在 `<` 上则原样返回。
 *
 * 两个坑：
 * 1. `=>` 里的 `>` 不是泛型闭合（`{ onClick: () => void }` 会被误判）；
 * 2. 花括号内是类型字面量，里面的 `<>` 不参与外层泛型计数。
 */
function skipAngle(masked: string, from: number): number {
    let i = from;
    while (i < masked.length && /\s/.test(masked[i])) i++;
    if (masked[i] !== '<') return from;

    let depth = 0;
    let curly = 0;
    const limit = Math.min(masked.length, i + 4000);

    for (let k = i; k < limit; k++) {
        const c = masked[k];
        if (c === '<') {
            if (curly === 0) depth++;
        } else if (c === '>') {
            if (curly > 0) continue;
            if (masked[k - 1] === '=') continue;
            depth--;
            if (depth === 0) return k + 1;
        } else if (c === '{') {
            curly++;
        } else if (c === '}') {
            if (curly === 0) return from;
            curly--;
        } else if (c === ';' && curly === 0) {
            // 明显不是类型参数，放弃
            return from;
        }
    }
    return from;
}

/**
 * 从 `from` 开始寻找类体起始的 `{`，过程中跳过 `<...>` 泛型。
 * `class X extends BaseElement<{ a: number }> {` 里的 `{` 属于泛型，不能当成类体。
 * 与 `skipAngle` 一样，`=>` 的 `>` 和花括号内的 `<>` 都不参与计数。
 */
function findHeaderBrace(masked: string, from: number): number {
    let angle = 0;
    let curly = 0;

    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '<') {
            if (curly === 0) angle++;
        } else if (c === '>') {
            if (curly > 0) continue;
            if (masked[i - 1] === '=') continue;
            if (angle > 0) angle--;
        } else if (c === '{') {
            if (angle === 0 && curly === 0) return i;
            curly++;
        } else if (c === '}') {
            if (curly === 0) return -1;
            curly--;
        } else if (c === ';' && angle === 0 && curly === 0) {
            return -1;
        }
    }
    return -1;
}

/** 列出文件里所有类声明 */
export function listClasses(masked: string): ClassInfo[] {
    const result: ClassInfo[] = [];
    const re = /\bclass\s+([A-Za-z_$][\w$]*)/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(masked)) !== null) {
        const name = match[1];
        let cursor = skipAngle(masked, match.index + match[0].length);
        const bodyStart = findHeaderBrace(masked, cursor);
        if (bodyStart === -1) continue;

        const bodyEnd = findMatchingBracket(masked, bodyStart);
        if (bodyEnd === -1) continue;

        const header = masked.slice(cursor, bodyStart);
        let extendsName: string | null = null;
        let extendsTypeArg: string | null = null;
        let extendsTypeArgStart = -1;

        const ext = /\bextends\s+([A-Za-z_$][\w$.]*)/.exec(header);
        if (ext) {
            extendsName = ext[1].split('.').pop() ?? ext[1];
            const afterExt = cursor + ext.index + ext[0].length;
            const open = masked.indexOf('<', afterExt);
            if (open !== -1 && open < bodyStart) {
                const close = skipAngle(masked, open);
                if (close !== -1 && close <= bodyStart) {
                    extendsTypeArg = masked.slice(open + 1, close - 1).trim();
                    extendsTypeArgStart = open + 1;
                }
            }
        }

        result.push({
            name,
            extendsName,
            extendsTypeArg,
            extendsTypeArgStart,
            keywordIndex: match.index,
            bodyStart,
            bodyEnd,
        });
        // 跳过整个类体，避免把类里嵌套的 class 也列出来
        re.lastIndex = Math.max(re.lastIndex, bodyEnd);
    }

    return result;
}

const MODIFIERS = new Set([
    'public',
    'private',
    'protected',
    'static',
    'readonly',
    'abstract',
    'override',
    'declare',
    'accessor',
    'async',
]);

const IDENT_START = /[A-Za-z_$#]/;
const IDENT_PART = /[\w$]/;

function skipTrivia(masked: string, from: number, limit: number): number {
    let i = from;
    while (i < limit) {
        const c = masked[i];
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';' || c === ',') {
            i++;
            continue;
        }
        break;
    }
    return i;
}

/**
 * 扫描类体内的成员声明（方法 / getter / setter / 属性 / 箭头函数字段）。
 * 参数列表跨行、带泛型、返回类型里含 `{}` 的情况都能正确处理。
 */
export function scanClassMembers(source: string, masked: string, bodyStart: number, bodyEnd: number): MemberInfo[] {
    const members: MemberInfo[] = [];
    let i = bodyStart + 1;

    while (i < bodyEnd) {
        i = skipTrivia(masked, i, bodyEnd);
        if (i >= bodyEnd) break;

        // 装饰器：@Foo(...)
        while (masked[i] === '@') {
            i++;
            while (i < bodyEnd && (IDENT_PART.test(masked[i]) || masked[i] === '.')) i++;
            i = skipTrivia(masked, i, bodyEnd);
            if (masked[i] === '(') {
                const close = findMatchingBracket(masked, i);
                if (close === -1) break;
                i = skipTrivia(masked, close + 1, bodyEnd);
            }
        }

        const declStart = i;

        // 修饰符
        let sawModifier = true;
        while (sawModifier) {
            sawModifier = false;
            const word = readIdentifier(masked, i);
            if (word && MODIFIERS.has(word.value)) {
                const after = skipSpaces(masked, i + word.value.length);
                // `static` 之类的后面必须还有内容，避免把名为 async 的成员吃掉
                if (after < bodyEnd && IDENT_START.test(masked[after])) {
                    i = after;
                    sawModifier = true;
                }
            }
        }

        // get / set
        let kind: MemberKind = 'method';
        const maybeAccessor = readIdentifier(masked, i);
        if (maybeAccessor && (maybeAccessor.value === 'get' || maybeAccessor.value === 'set')) {
            const after = skipSpaces(masked, i + maybeAccessor.value.length);
            if (after < bodyEnd && IDENT_START.test(masked[after])) {
                kind = maybeAccessor.value === 'get' ? 'getter' : 'setter';
                i = after;
            }
        }

        // 成员名
        const nameToken = readIdentifier(masked, i);
        if (!nameToken) {
            i = skipMember(masked, declStart, bodyEnd);
            if (i <= declStart) i = declStart + 1;
            continue;
        }

        const name = nameToken.value.replace(/^#/, '');
        const nameIndex = i;
        i = skipSpaces(masked, i + nameToken.value.length);

        // 可选标记 ? / !
        if (masked[i] === '?' || masked[i] === '!') i = skipSpaces(masked, i + 1);

        // 泛型
        if (masked[i] === '<') {
            const afterAngle = skipAngle(masked, i);
            if (afterAngle > i) i = skipSpaces(masked, afterAngle);
        }

        // 方法：name(...)
        if (masked[i] === '(') {
            const close = findMatchingBracket(masked, i);
            if (close === -1) break;
            const params = source.slice(i + 1, close);
            const afterParams = skipSpaces(masked, close + 1);

            let returnType: string | null = null;
            let cursor = afterParams;
            if (masked[cursor] === ':') {
                const typeEnd = scanTypeEnd(masked, cursor + 1, bodyEnd);
                returnType = source.slice(cursor + 1, typeEnd).trim();
                cursor = skipSpaces(masked, typeEnd);
            }

            if (masked[cursor] === '{') {
                const bodyEndIdx = findMatchingBracket(masked, cursor);
                if (bodyEndIdx === -1) break;
                i = bodyEndIdx + 1;
            } else {
                i = Math.max(cursor, close + 1);
            }

            members.push({ name, kind, params: params.trim(), returnType, nameIndex });
            continue;
        }

        // 箭头函数字段：name = (...) => {}
        if (masked[i] === '=') {
            const arrow = tryParseArrow(masked, i + 1, bodyEnd);
            if (arrow) {
                members.push({
                    name,
                    kind: 'arrow',
                    params: source.slice(arrow.paramsStart + 1, arrow.paramsEnd).trim(),
                    returnType: arrow.returnType,
                    nameIndex,
                });
                i = arrow.bodyEnd + 1;
                continue;
            }
            i = skipToMemberBoundary(masked, i, bodyEnd);
            members.push({ name, kind: 'property', params: '', returnType: null, nameIndex });
            continue;
        }

        // 属性：name: Type = ...
        if (masked[i] === ':') {
            const typeEnd = scanTypeEnd(masked, i + 1, bodyEnd);
            i = skipToMemberBoundary(masked, typeEnd, bodyEnd);
            members.push({ name, kind: 'property', params: '', returnType: null, nameIndex });
            continue;
        }

        i = skipMember(masked, declStart, bodyEnd);
        if (i <= declStart) i = declStart + 1;
    }

    return members;
}

interface ArrowInfo {
    paramsStart: number;
    paramsEnd: number;
    returnType: string | null;
    bodyEnd: number;
}

function tryParseArrow(masked: string, from: number, limit: number): ArrowInfo | null {
    let i = skipSpaces(masked, from);

    if (masked.startsWith('async', i)) {
        const after = skipSpaces(masked, i + 5);
        if (after > i + 5) i = after;
    }

    if (masked[i] === '<') {
        const afterAngle = skipAngle(masked, i);
        if (afterAngle > i) i = skipSpaces(masked, afterAngle);
    }

    if (masked[i] !== '(') return null;
    const paramsEnd = findMatchingBracket(masked, i);
    if (paramsEnd === -1) return null;

    let cursor = skipSpaces(masked, paramsEnd + 1);
    let returnType: string | null = null;
    if (masked[cursor] === ':') {
        const typeEnd = scanTypeEnd(masked, cursor + 1, limit);
        returnType = masked.slice(cursor + 1, typeEnd).trim();
        cursor = skipSpaces(masked, typeEnd);
    }

    if (!masked.startsWith('=>', cursor)) return null;
    cursor = skipSpaces(masked, cursor + 2);

    if (masked[cursor] === '{') {
        const close = findMatchingBracket(masked, cursor);
        if (close === -1) return null;
        return { paramsStart: i, paramsEnd, returnType, bodyEnd: close };
    }

    const end = skipToMemberBoundary(masked, cursor, limit);
    return { paramsStart: i, paramsEnd, returnType, bodyEnd: end };
}

/**
 * 这些字符之后出现的 `{` 属于「类型里的对象字面量」，而不是方法体
 */
const TYPE_CONTINUES = new Set([':', '|', '&', ',', '(', '[', '<', '?', '=']);

/**
 * 从类型注解起点扫描到类型结束，返回下一个成员边界（方法体 `{` / `;` / 换行后的新成员）。
 * 期间正确跳过 `<...>`、`(...)`、`[...]`、`{...}`，以及 `=>`。
 *
 * 难点是区分「类型里的 `{`」和「方法体的 `{`」：
 * `getState(): { ok: boolean } { ... }` 里有两个 `{`，前一个是返回类型。
 * 判据是前一个有效字符——类型里的对象字面量总跟在 `:` / `|` / `&` / `,` 等之后，
 * 而方法体的 `{` 前面是标识符、`>`、`]` 或 `}`。
 */
function scanTypeEnd(masked: string, from: number, limit: number): number {
    let angle = 0;
    let round = 0;
    let square = 0;
    let curly = 0;
    let prevSignificant = '';

    for (let i = from; i < limit; i++) {
        const c = masked[i];

        if (c === ' ' || c === '\t' || c === '\r') continue;

        if (c === '\n') {
            // 类型跨行很常见，但下一行若是新的成员声明就该停
            if (angle === 0 && round === 0 && square === 0 && curly === 0) {
                const rest = masked.slice(i + 1, Math.min(limit, i + 200));
                if (
                    /^\s*(?:(?:public|private|protected|static|readonly|abstract|override|async)\s+)*(?:get\s+|set\s+)?[A-Za-z_$#][\w$]*\s*[(:<]/.test(
                        rest,
                    )
                ) {
                    return i;
                }
            }
            continue;
        }

        if (c === '<') angle++;
        else if (c === '>') {
            if (angle > 0) angle--;
        } else if (c === '(') round++;
        else if (c === ')') {
            if (round > 0) round--;
            else return i;
        } else if (c === '[') square++;
        else if (c === ']') square--;
        else if (c === '{') {
            if (angle === 0 && round === 0 && square === 0 && curly === 0) {
                if (prevSignificant === '' || TYPE_CONTINUES.has(prevSignificant)) {
                    // 返回类型本身就是对象字面量，整体吞掉后继续扫
                    curly++;
                    prevSignificant = c;
                    continue;
                }
                return i;
            }
            curly++;
        } else if (c === '}') {
            if (curly === 0) return i;
            curly--;
        } else if (c === ';' && angle === 0 && round === 0 && square === 0 && curly === 0) {
            return i;
        }

        prevSignificant = c;
    }
    return limit;
}

/** 下一行是否看起来像新的成员/键声明（用于无分号写法） */
const NEXT_MEMBER_RE =
    /^\s*(?:(?:public|private|protected|static|readonly|abstract|override|async)\s+)*(?:get\s+|set\s+)?[A-Za-z_$#][\w$]*\s*[(:<]/;

function skipToMemberBoundary(masked: string, from: number, limit: number): number {
    let curly = 0;
    let round = 0;
    let square = 0;
    let angle = 0;

    for (let i = from; i < limit; i++) {
        const c = masked[i];
        if (c === '{') curly++;
        else if (c === '}') {
            if (curly === 0) return i;
            curly--;
        } else if (c === '(') round++;
        else if (c === ')') round--;
        else if (c === '[') square++;
        else if (c === ']') square--;
        else if (c === '<') angle++;
        else if (c === '>') {
            if (angle > 0) angle--;
        } else if (c === ';' && curly === 0 && round === 0 && square === 0) {
            return i;
        } else if (c === ',' && curly === 0 && round === 0 && square === 0 && angle === 0) {
            // 顶层的逗号也是成员边界：`super({ a: 1, b: 2 })` 单行写法全靠它
            return i;
        } else if (c === '\n' && curly === 0 && round === 0 && square === 0 && angle === 0) {
            // interface / 对象字面量允许不写分号，换行即下一个成员
            if (NEXT_MEMBER_RE.test(masked.slice(i + 1, Math.min(limit, i + 200)))) return i;
        }
    }
    return limit;
}

function skipMember(masked: string, from: number, limit: number): number {
    return skipToMemberBoundary(masked, from, limit);
}

function skipSpaces(masked: string, from: number): number {
    let i = from;
    while (i < masked.length && /\s/.test(masked[i])) i++;
    return i;
}

function readIdentifier(masked: string, from: number): { value: string; index: number } | null {
    if (from >= masked.length) return null;
    if (!IDENT_START.test(masked[from])) return null;

    let i = from + 1;
    while (i < masked.length && IDENT_PART.test(masked[i])) i++;
    return { value: masked.slice(from, i), index: from };
}

/**
 * 在 `[from, to)` 范围内解析对象字面量的**顶层**键名。
 * `open` 指向 `{`，返回顶层 key 名列表（保持出现顺序）。
 */
export function readObjectLiteralKeys(masked: string, open: number): string[] {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return [];

    const keys: string[] = [];
    let i = open + 1;

    while (i < close) {
        i = skipTrivia(masked, i, close);
        if (i >= close) break;

        // 展开运算符 ...rest 跳过
        if (masked.startsWith('...', i)) {
            i = skipToMemberBoundary(masked, i + 3, close);
            continue;
        }

        // 计算属性名 [expr]
        if (masked[i] === '[') {
            const end = findMatchingBracket(masked, i);
            if (end === -1) break;
            i = skipToMemberBoundary(masked, end + 1, close);
            continue;
        }

        const token = readIdentifier(masked, i);
        if (!token) {
            i = skipToMemberBoundary(masked, i, close);
            if (i < close && masked[i] === ',') i++;
            continue;
        }

        // 字符串键（已掩码成空格）无法解析，跳过
        keys.push(token.value);
        i = skipToMemberBoundary(masked, token.index + token.value.length, close);
        if (i < close && masked[i] === ',') i++;
    }

    return keys;
}

/** 找到 `interface Name {` 的 `{` 下标 */
export function findInterfaceBody(masked: string, name: string): number | null {
    const re = new RegExp(`\\binterface\\s+${escapeRegex(name)}\\b[^{]*\\{`, 'g');
    const match = re.exec(masked);
    if (!match) return null;
    return match.index + match[0].length - 1;
}

/** 读取 interface 顶层成员名 */
export function readInterfaceKeys(masked: string, open: number): string[] {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return [];

    const keys: string[] = [];
    let i = open + 1;

    while (i < close) {
        i = skipTrivia(masked, i, close);
        if (i >= close) break;

        if (masked[i] === '[') {
            const end = findMatchingBracket(masked, i);
            if (end === -1) break;
            i = skipToMemberBoundary(masked, end + 1, close);
            continue;
        }

        const token = readIdentifier(masked, i);
        if (!token) {
            i = skipToMemberBoundary(masked, i, close);
            if (i < close && masked[i] === ',') i++;
            continue;
        }

        const afterName = skipSpaces(masked, token.index + token.value.length);
        const next = masked[afterName];
        if (next === ':' || next === '?' || next === '(' || next === '<') {
            if (next === '(' || next === '<') {
                // 方法签名，不算数据属性
                i = skipToMemberBoundary(masked, token.index + token.value.length, close);
                if (i < close && masked[i] === ',') i++;
                continue;
            }
            keys.push(token.value);
        }

        i = skipToMemberBoundary(masked, token.index + token.value.length, close);
        if (i < close && masked[i] === ',') i++;
    }

    return keys;
}

/** 在 `{ ... }` 块里定位某个顶层 key 的下标 */
export function findKeyIndex(masked: string, open: number, name: string): number | null {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return null;

    let i = open + 1;
    while (i < close) {
        i = skipTrivia(masked, i, close);
        if (i >= close) break;

        if (masked.startsWith('...', i) || masked[i] === '[') {
            const end = masked[i] === '[' ? findMatchingBracket(masked, i) : -1;
            i = skipToMemberBoundary(masked, end === -1 ? i + 3 : end + 1, close);
            if (i < close && masked[i] === ',') i++;
            continue;
        }

        const token = readIdentifier(masked, i);
        if (!token) {
            i = skipToMemberBoundary(masked, i, close);
            if (i < close && masked[i] === ',') i++;
            continue;
        }

        if (token.value === name) {
            const after = skipSpaces(masked, token.index + token.value.length);
            const next = masked[after];
            if (next === ':' || next === '?' || next === ',' || next === '=' || next === '}') {
                return token.index;
            }
        }

        i = skipToMemberBoundary(masked, token.index + token.value.length, close);
        if (i < close && masked[i] === ',') i++;
    }

    return null;
}

/** 读取 `{ name: Type }` 中 Type 的原文（找不到返回 null） */
export function findKeyType(source: string, masked: string, open: number, name: string): string | null {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return null;

    let i = open + 1;
    while (i < close) {
        i = skipTrivia(masked, i, close);
        if (i >= close) break;

        const token = readIdentifier(masked, i);
        if (!token) {
            i = skipToMemberBoundary(masked, i, close);
            if (i < close && masked[i] === ',') i++;
            continue;
        }

        const afterName = skipSpaces(masked, token.index + token.value.length);
        const optional = masked[afterName] === '?' ? skipSpaces(masked, afterName + 1) : afterName;

        if (token.value === name && masked[optional] === ':') {
            const valueStart = skipSpaces(masked, optional + 1);
            // 对象类型 `{ a: string }` 单独处理，否则 scanTypeEnd 会在 `{` 处直接停住
            let typeEnd: number;
            if (masked[valueStart] === '{') {
                const objEnd = findMatchingBracket(masked, valueStart);
                typeEnd = objEnd === -1 ? close : objEnd + 1;
            } else {
                typeEnd = scanTypeEnd(masked, optional + 1, close);
            }
            const type = source.slice(optional + 1, typeEnd).trim();
            return type || null;
        }

        i = skipToMemberBoundary(masked, token.index + token.value.length, close);
        if (i < close && masked[i] === ',') i++;
    }

    return null;
}

export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
