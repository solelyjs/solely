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
    /** `extends` 的完整表达式（保留命名空间前缀，如 `ns.Base`），无则 null */
    extendsExpr: string | null;
    /** `extends BaseElement<X>` 中的 `X` 原文 */
    extendsTypeArg: string | null;
    /** `extendsTypeArg` 在源码中的起始下标（指向 `<` 之后第一个字符） */
    extendsTypeArgStart: number;
    /** 泛型参数 `>` 的下标（无泛型时为 -1） */
    extendsTypeArgEnd: number;
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
export function skipAngle(masked: string, from: number): number {
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
export function findHeaderBrace(masked: string, from: number): number {
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
        let extendsExpr: string | null = null;
        let extendsTypeArg: string | null = null;
        let extendsTypeArgStart = -1;
        let extendsTypeArgEnd = -1;

        const ext = /\bextends\s+([A-Za-z_$][\w$.]*)/.exec(header);
        if (ext) {
            extendsExpr = ext[1];
            extendsName = ext[1].split('.').pop() ?? ext[1];
            const afterExt = cursor + ext.index + ext[0].length;
            const open = masked.indexOf('<', afterExt);
            if (open !== -1 && open < bodyStart) {
                const close = skipAngle(masked, open);
                // skipAngle 解析失败时原样返回 open，此时三个字段都保持 -1
                if (close > open && close <= bodyStart) {
                    extendsTypeArg = masked.slice(open + 1, close - 1).trim();
                    extendsTypeArgStart = open + 1;
                    extendsTypeArgEnd = close - 1;
                }
            }
        }

        result.push({
            name,
            extendsName,
            extendsExpr,
            extendsTypeArg,
            extendsTypeArgStart,
            extendsTypeArgEnd,
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
                    params: source.slice(arrow.paramsStart, arrow.paramsEnd).trim(),
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
        // 也可能是带类型注解的箭头函数：name: (e: Event) => void = (e) => {}
        if (masked[i] === ':') {
            const typeEnd = scanType(masked, i + 1, bodyEnd);
            if (typeEnd > i + 1) {
                const afterType = skipSpaces(masked, typeEnd);
                if (masked[afterType] === '=') {
                    const arrow = tryParseArrow(masked, afterType + 1, bodyEnd);
                    if (arrow) {
                        // 标注是函数类型时以标注为准：`handleClick: (e: Event) => void = (e) => {}`
                        const annotated = splitFunctionType(source, masked, i + 1, typeEnd);
                        members.push({
                            name,
                            kind: 'arrow',
                            params: annotated
                                ? annotated.params
                                : source.slice(arrow.paramsStart, arrow.paramsEnd).trim(),
                            // 注解不是函数类型（如 `onClick: Handler`）时，它是整个字段的类型，
                            // 不是返回类型；只有内联函数类型标注或箭头自身的注解才算返回类型
                            returnType: annotated?.returnType ?? arrow.returnType,
                            nameIndex,
                        });
                        i = arrow.bodyEnd + 1;
                        continue;
                    }
                }
                i = skipToMemberBoundary(masked, typeEnd, bodyEnd);
                members.push({ name, kind: 'property', params: '', returnType: null, nameIndex });
                continue;
            }

            // 类型解析失败时退回旧的启发式扫描，至少保证成员边界不错位
            const legacyEnd = scanTypeEnd(masked, i + 1, bodyEnd);
            i = skipToMemberBoundary(masked, legacyEnd, bodyEnd);
            members.push({ name, kind: 'property', params: '', returnType: null, nameIndex });
            continue;
        }

        i = skipMember(masked, declStart, bodyEnd);
        if (i <= declStart) i = declStart + 1;
    }

    return members;
}

interface ArrowInfo {
    /** 参数文本起点（`(` 之后，或单参数箭头里参数的起点） */
    paramsStart: number;
    /** 参数文本终点（`)` 的下标，或单参数箭头里参数的终点） */
    paramsEnd: number;
    returnType: string | null;
    bodyEnd: number;
}

/** 类型里的前缀关键字：`keyof X` / `typeof X` / `readonly T[]` / `infer T` */
const TYPE_KEYWORDS = new Set(['keyof', 'typeof', 'readonly', 'infer', 'new', 'unique']);

/**
 * 按类型语法扫描类型表达式，返回「类型结束」后的下标；解析失败返回 `from`。
 *
 * 与 `scanTypeEnd` 的启发式不同，这里能区分：
 * - 函数类型里的 `=>`（`(e: Event) => void` 属于类型）
 * - 箭头函数体的 `=>`（`(): Promise<void> => {}` 属于函数体）
 * 之前用 `scanTypeEnd` 会把 `=> body` 一起吃进类型，导致带返回类型注解的
 * 箭头函数字段被误判成普通属性。
 */
function scanType(masked: string, from: number, limit: number): number {
    let i = scanTypePrimary(masked, from, limit);
    if (i <= from) return from;

    while (true) {
        i = skipSpaces(masked, i);
        if (i >= limit) return i;

        const c = masked[i];
        if (c === '|' || c === '&') {
            const next = scanTypePrimary(masked, i + 1, limit);
            if (next <= i + 1) return i;
            i = next;
            continue;
        }
        if (c === '[') {
            // 数组类型 T[]
            const close = findMatchingBracket(masked, i);
            if (close === -1 || close >= limit) return i;
            i = close + 1;
            continue;
        }
        return i;
    }
}

/**
 * 判断括号里的内容是不是函数类型的参数列表。
 * `(A | B)`、`((e) => void)` 这类是「被括号包起来的类型」，不能当成参数。
 */
function looksLikeFunctionTypeParams(content: string): boolean {
    const text = content.trim();
    if (text === '') return true;
    if (/=>/.test(text)) return false;
    // `(A | B)` 是类型分组；`(e: string | number)` 里的 |/& 属于参数类型。
    // 有冒号即 `name: Type` 形式的参数列表，不能因参数类型里的 |/& 误判成分组。
    if (!text.includes(':') && /[|&]/.test(text)) return false;
    if (/^[{([]/.test(text)) return false;
    if (/\bextends\b/.test(text)) return false;
    return true;
}

function scanTypePrimary(masked: string, from: number, limit: number): number {
    let i = skipSpaces(masked, from);
    if (i >= limit) return from;

    const prefix = readIdentifier(masked, i);
    if (prefix && TYPE_KEYWORDS.has(prefix.value)) {
        const after = skipSpaces(masked, i + prefix.value.length);
        if (after > i + prefix.value.length && after < limit) {
            const inner = scanTypePrimary(masked, after, limit);
            if (inner > after) return inner;
        }
        return i + prefix.value.length;
    }

    const c = masked[i];

    if (c === '(') {
        const close = findMatchingBracket(masked, i);
        if (close === -1 || close >= limit) return from;
        const after = skipSpaces(masked, close + 1);
        // `(e: Event) => void` 是函数类型；`(A | B) => ...` 里括号只是类型分组
        if (masked.startsWith('=>', after) && looksLikeFunctionTypeParams(masked.slice(i + 1, close))) {
            const body = scanType(masked, after + 2, limit);
            return body > after + 2 ? body : after + 2;
        }
        return close + 1;
    }

    if (c === '{' || c === '[') {
        // 对象类型 / 元组类型
        const close = findMatchingBracket(masked, i);
        if (close === -1 || close >= limit) return from;
        return close + 1;
    }

    if (c === '<') {
        // 泛型函数类型：`<T>(v: T) => T`
        const afterAngle = skipAngle(masked, i);
        if (afterAngle <= i) return from;
        return scanTypePrimary(masked, afterAngle, limit);
    }

    if (/[0-9+\-]/.test(c)) {
        let k = i + 1;
        while (k < limit && /[\w$.]/.test(masked[k])) k++;
        return k;
    }

    const token = readIdentifier(masked, i);
    if (!token) return from;

    let end = token.index + token.value.length;
    // 限定名 A.B
    while (masked[end] === '.') {
        const next = readIdentifier(masked, end + 1);
        if (!next) break;
        end = next.index + next.value.length;
    }
    // 泛型实参 Foo<Bar>
    if (masked[end] === '<') {
        const afterAngle = skipAngle(masked, end);
        if (afterAngle > end) end = afterAngle;
    }
    return end;
}

/**
 * 从函数类型的注解里拆出参数和返回类型：`(e: Event) => void`。
 * 不是函数类型时返回 null。
 */
function splitFunctionType(
    source: string,
    masked: string,
    start: number,
    end: number,
): { params: string; returnType: string } | null {
    const i = skipSpaces(masked, start);
    if (masked[i] !== '(') return null;

    const close = findMatchingBracket(masked, i);
    if (close === -1 || close >= end) return null;

    const after = skipSpaces(masked, close + 1);
    if (!masked.startsWith('=>', after)) return null;

    const returnEnd = scanType(masked, after + 2, end);
    if (returnEnd <= after + 2) return null;

    return {
        params: source.slice(i + 1, close).trim(),
        returnType: source.slice(after + 2, returnEnd).trim(),
    };
}

function tryParseArrow(masked: string, from: number, limit: number): ArrowInfo | null {
    let i = skipSpaces(masked, from);

    // async，允许 `async()` 紧贴写法
    if (masked.startsWith('async', i) && !IDENT_PART.test(masked[i + 5] ?? '')) {
        i = skipSpaces(masked, i + 5);
    }

    if (masked[i] === '<') {
        const afterAngle = skipAngle(masked, i);
        if (afterAngle > i) i = skipSpaces(masked, afterAngle);
    }

    let paramsStart: number;
    let paramsEnd: number;

    if (masked[i] === '(') {
        const close = findMatchingBracket(masked, i);
        if (close === -1) return null;
        paramsStart = i + 1;
        paramsEnd = close;
        i = close + 1;
    } else {
        // 单参数省略括号：`e => ...`
        const token = readIdentifier(masked, i);
        if (!token) return null;
        paramsStart = token.index;
        paramsEnd = token.index + token.value.length;
        i = paramsEnd;
    }

    let cursor = skipSpaces(masked, i);
    let returnType: string | null = null;
    if (masked[cursor] === ':') {
        const typeEnd = scanType(masked, cursor + 1, limit);
        if (typeEnd <= cursor + 1) return null;
        returnType = masked.slice(cursor + 1, typeEnd).trim();
        cursor = skipSpaces(masked, typeEnd);
    }

    if (!masked.startsWith('=>', cursor)) return null;
    cursor = skipSpaces(masked, cursor + 2);

    if (masked[cursor] === '{') {
        const close = findMatchingBracket(masked, cursor);
        if (close === -1) return null;
        return { paramsStart, paramsEnd, returnType, bodyEnd: close };
    }

    const end = skipToMemberBoundary(masked, cursor, limit);
    return { paramsStart, paramsEnd, returnType, bodyEnd: end };
}

/**
 * 「下一行是不是新成员」这类判断只向前看这么多字符，够覆盖一行签名即可。
 */
export const MEMBER_LOOKAHEAD = 200;

/**
 * 这些字符之后出现的 `{` 属于「类型里的对象字面量」，而不是方法体
 */
const TYPE_CONTINUES = new Set([':', '|', '&', ',', '(', '[', '<', '?', '=']);

/**
 * 类型注解的启发式结束位置扫描。
 *
 * **仅作兜底**：`scanType` 才是按类型语法解析的权威实现，只有在它解析失败时
 * 才退回这里，保证成员边界不错位。不要再往这个函数里加新分支。
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
                const rest = masked.slice(i + 1, Math.min(limit, i + MEMBER_LOOKAHEAD));
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
            if (NEXT_MEMBER_RE.test(masked.slice(i + 1, Math.min(limit, i + MEMBER_LOOKAHEAD)))) return i;
        }
    }
    return limit;
}

function skipMember(masked: string, from: number, limit: number): number {
    return skipToMemberBoundary(masked, from, limit);
}

export function skipSpaces(masked: string, from: number): number {
    let i = from;
    while (i < masked.length && /\s/.test(masked[i])) i++;
    return i;
}

export function readIdentifier(masked: string, from: number): { value: string; index: number } | null {
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

/**
 * 找到所有同名 `interface Name {` 的 `{` 下标。
 *
 * TS 允许同名 interface 声明合并，键集必须取所有声明的并集；
 * 只取首个会让第二个声明里的属性在模板里被误报未定义。
 */
export function findInterfaceBodies(masked: string, name: string): number[] {
    const re = new RegExp(`\\binterface\\s+${escapeRegex(name)}\\b`, 'g');
    const bodies: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(masked)) !== null) {
        // 从类型名之后找真正的类体 `{`，跳过泛型参数里的对象约束
        // （`interface S<T extends { id: string }> { ... }` 中前一个 `{` 属于泛型）。
        const open = findHeaderBrace(masked, match.index + match[0].length);
        if (open !== -1) bodies.push(open);
        re.lastIndex = Math.max(re.lastIndex, open === -1 ? match.index + match[0].length : open + 1);
    }

    return bodies;
}

/** `['key']` 形式计算属性名里的字符串键；索引签名 / 映射类型返回 null */
function readComputedStringKey(text: string, open: number, close: number): string | null {
    const inner = text.slice(open + 1, close).trim();
    const match = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/.exec(inner);
    return match ? match[2] : null;
}

/**
 * `[Symbol.iterator]` / `[typeof Symbol.x]` 这类符号键：是具名成员，但模板里
 * 引用不到，也不代表「还有无法枚举的动态键」，不能算索引签名。
 */
function isSymbolComputedKey(text: string, open: number, close: number): boolean {
    const inner = text.slice(open + 1, close).trim();
    return /^(?:typeof\s+)?Symbol\s*[.[]/.test(inner);
}

/** interface / 类成员前的修饰符 */
const MEMBER_MODIFIERS = new Set([
    'readonly',
    'public',
    'private',
    'protected',
    'static',
    'abstract',
    'override',
    'declare',
    'accessor',
]);

/** 访问器前缀（`get foo(): string` 里的 foo 才是成员名） */
const ACCESSOR_KEYWORDS = new Set(['get', 'set']);

/**
 * 跳过成员前的修饰符，返回成员名起点。
 * 后面必须还是成员名，否则这个单词本身就是名字（`readonly: boolean`）。
 */
function skipMemberModifiers(masked: string, from: number, limit: number): number {
    let i = from;
    while (i < limit) {
        const token = readIdentifier(masked, i);
        if (!token) return i;
        if (!MEMBER_MODIFIERS.has(token.value) && !ACCESSOR_KEYWORDS.has(token.value)) return i;

        const after = skipSpaces(masked, token.index + token.value.length);
        if (after >= limit || !IDENT_START.test(masked[after])) return i;
        i = after;
    }
    return i;
}

/**
 * 字符串键被掩码成空格后无法直接读取，回看原文：
 * 紧邻 `:` / `?` 之前的引号字面量就是成员名。
 */
function readStringKeyBefore(text: string, index: number): { value: string; start: number } | null {
    let k = index - 1;
    while (k >= 0 && /\s/.test(text[k])) k--;
    if (k < 0) return null;

    const quote = text[k];
    if (quote !== '"' && quote !== "'") return null;

    let start = k - 1;
    while (start >= 0) {
        if (text[start] === quote && text[start - 1] !== '\\') break;
        start--;
    }
    if (start < 0) return null;

    // 引号前必须是成员边界，避免把类型里的字符串字面量当成键
    const before = start - 1;
    if (before >= 0 && !/[\s;{,}]/.test(text[before])) return null;
    return { value: text.slice(start + 1, k), start };
}

export interface InterfaceKeys {
    keys: string[];
    /**
     * 体内有索引签名 / 映射类型（`[key: string]: T`、`[K in Keys]`）。
     * 这类成员意味着还存在无法枚举的动态键，键集不能当作完整集合使用。
     */
    hasIndexSignature: boolean;
}

interface MemberNameInfo {
    /** 成员名；null = 没有可读的具名键（动态键 / 展开 / 解析失败） */
    name: string | null;
    /** 名字在原文里的起点（字符串键是引号，计算键是 `[`） */
    nameIndex: number;
    /** 名字之后第一个非空字符的下标（可能是 `?` / `:` / `(`） */
    afterName: number;
    /** 下一个成员的起点（已吃掉后随的逗号） */
    next: number;
    /** 索引签名 / 映射类型 / symbol 等动态键 */
    dynamic: boolean;
}

/**
 * 读一个成员名，并把游标推到下一个成员；没有成员时返回 null。
 *
 * 成员名有三种写法，三种调用方（读键集 / 定位 key / 读 key 的类型）必须共用这一份，
 * 否则规则一改就只修好一处（`readonly ['a']` 曾经只在补全侧生效，悬停 / 跳转仍丢失）：
 * - 普通标识符，前面可能带 `readonly` / `static` / `get` 等修饰符
 * - 字符串 / 数字字面量键（掩码后只剩 `:` / `?`，名字要回原文取）
 * - 计算键 `['key']`；`[key: string]` / `[K in Keys]` / `[Symbol.x]` 是动态键
 */
function readMemberNameAt(text: string, masked: string, from: number, limit: number): MemberNameInfo | null {
    const start = skipTrivia(masked, from, limit);
    if (start >= limit) return null;

    const advance = (position: number): number => {
        let next = skipToMemberBoundary(masked, position, limit);
        if (next < limit && masked[next] === ',') next++;
        return next;
    };

    // `...rest` 展开不是具名键
    if (masked.startsWith('...', start)) {
        return { name: null, nameIndex: -1, afterName: -1, next: advance(start + 3), dynamic: false };
    }

    // 计算键；`[key: string]` / `[K in Keys]` 无法枚举出名字，`[Symbol.x]` 是具名但模板不可达
    if (masked[start] === '[') {
        const end = findMatchingBracket(masked, start);
        if (end === -1) return { name: null, nameIndex: -1, afterName: -1, next: limit, dynamic: true };
        const computed = readComputedStringKey(text, start, end);
        return {
            name: computed,
            nameIndex: start,
            afterName: skipSpaces(masked, end + 1),
            next: advance(end + 1),
            dynamic: computed === null && !isSymbolComputedKey(text, start, end),
        };
    }

    // 字符串键（掩码后只剩 `:` / `?`）
    if (masked[start] === ':' || masked[start] === '?') {
        const quoted = readStringKeyBefore(text, start);
        if (quoted) {
            return {
                name: quoted.value,
                nameIndex: quoted.start,
                afterName: start,
                next: advance(start + 1),
                dynamic: false,
            };
        }
    }

    // 数字键
    const numeric = /^\d+/.exec(masked.slice(start, limit));
    if (numeric) {
        const end = start + numeric[0].length;
        return {
            name: numeric[0],
            nameIndex: start,
            afterName: skipSpaces(masked, end),
            next: advance(end),
            dynamic: false,
        };
    }

    // `readonly a: string` / `get foo(): string`
    const afterModifiers = skipMemberModifiers(masked, start, limit);
    const token = readIdentifier(masked, afterModifiers);
    if (!token) {
        return { name: null, nameIndex: -1, afterName: -1, next: advance(afterModifiers), dynamic: false };
    }

    // `readonly [key: string]`：skipMemberModifiers 要求修饰符后是标识符，遇到 `[`
    // 会停在修饰符上。退回 `[` 重走计算键分支，否则动态键不会被标记
    const afterToken = skipSpaces(masked, token.index + token.value.length);
    if ((MEMBER_MODIFIERS.has(token.value) || ACCESSOR_KEYWORDS.has(token.value)) && masked[afterToken] === '[') {
        return readMemberNameAt(text, masked, afterToken, limit);
    }

    return {
        name: token.value,
        nameIndex: token.index,
        afterName: afterToken,
        next: advance(token.index + token.value.length),
        dynamic: false,
    };
}

/** 跳过名字后的 `?`，返回 `:` 所在位置（没有 `?` 时原样返回） */
function skipOptional(masked: string, position: number): number {
    return masked[position] === '?' ? skipSpaces(masked, position + 1) : position;
}

/** 读取 interface 顶层成员名，并回报是否存在动态键（索引签名 / 映射类型） */
export function readInterfaceKeys(text: string, masked: string, open: number): InterfaceKeys {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return { keys: [], hasIndexSignature: false };

    const keys: string[] = [];
    let hasIndexSignature = false;
    let i = open + 1;

    while (i < close) {
        const member = readMemberNameAt(text, masked, i, close);
        if (!member) break;
        if (member.dynamic) hasIndexSignature = true;
        // 方法签名（`foo(): void` / `foo<T>()`）不是数据属性
        if (member.name !== null && masked[skipOptional(masked, member.afterName)] === ':') {
            keys.push(member.name);
        }
        i = member.next;
    }

    return { keys, hasIndexSignature };
}

/** 在 `{ ... }` 块里定位某个顶层 key 的下标 */
export function findKeyIndex(text: string, masked: string, open: number, name: string): number | null {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return null;

    let i = open + 1;
    while (i < close) {
        const member = readMemberNameAt(text, masked, i, close);
        if (!member) break;

        if (member.name === name) {
            // `:` 是数据键；`,` / `}` 是对象字面量的简写（`super({ a })`）
            const next = masked[skipOptional(masked, member.afterName)];
            if (next === ':' || next === ',' || next === '}') return member.nameIndex;
        }

        i = member.next;
    }

    return null;
}

/** 读取 `{ name: Type }` 中 Type 的原文（找不到返回 null） */
export function findKeyType(source: string, masked: string, open: number, name: string): string | null {
    const close = findMatchingBracket(masked, open);
    if (close === -1) return null;

    let i = open + 1;
    while (i < close) {
        const member = readMemberNameAt(source, masked, i, close);
        if (!member) break;

        if (member.name === name) {
            const colon = skipOptional(masked, member.afterName);
            if (masked[colon] === ':') return readTypeAfterColon(source, masked, colon, close);
        }

        i = member.next;
    }

    return null;
}

/** 读取 `:` 之后到成员边界之间的类型原文 */
function readTypeAfterColon(source: string, masked: string, colon: number, close: number): string | null {
    const valueStart = skipSpaces(masked, colon + 1);
    // 对象类型 `{ a: string }` 单独处理，否则 scanTypeEnd 会在 `{` 处直接停住
    let typeEnd: number;
    if (masked[valueStart] === '{') {
        const objEnd = findMatchingBracket(masked, valueStart);
        typeEnd = objEnd === -1 ? close : objEnd + 1;
    } else {
        typeEnd = scanTypeEnd(masked, colon + 1, close);
    }
    const type = source.slice(colon + 1, typeEnd).trim();
    return type || null;
}

export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
