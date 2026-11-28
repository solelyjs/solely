/**
 * `$data` 类型解析。
 *
 * 输入：组件文件路径 + 组件类（找不到单类时传 null），输出「对象类型体」列表，
 * 每个元素指向某个文件里 interface / 类型字面量的 `{`。调用方拿到 refs 后
 * 用 `readTypeBodyKeys` 读键，或用 `findKeyIndex` / `findKeyType` 定位。
 *
 * 支持：交叉类型、interface extends 继承链、导入类型、type 别名、
 * barrel re-export，以及 Partial / Required / Readonly / NonNullable / Pick / Omit。
 */
import * as path from 'path';
import {
    ClassInfo,
    MEMBER_LOOKAHEAD,
    escapeRegex,
    findHeaderBrace,
    findInterfaceBodies,
    findKeyIndex,
    findKeyType,
    findKeyTypeRange,
    findMatchingBracket,
    findMemberText,
    readIdentifier,
    readInterfaceKeys,
    skipAngle,
    skipSpaces,
} from './tsSource';
import { loadSource, SourceInfo } from './tsLoader';
import { codeMatches, findImportBinding, normalizePath, resolveModuleFile } from './moduleResolver';

export interface TypeBodyRef {
    path: string;
    open: number;
    kind: 'interface' | 'literal';
    /** `Pick<T, K>` 保留的键 */
    pick?: string[];
    /** `Omit<T, K>` 排除的键 */
    omit?: string[];
}

interface SourceRange {
    start: number;
    end: number;
}

/** 类型嵌套的最大深度（换文件 / barrel 跳转不计；环路由递归栈兜住） */
const MAX_TYPE_DEPTH = 32;

/** 拆掉外层即可拿到有效键的包装类型 */
const UNWRAP_TYPE_WRAPPERS = new Set(['Partial', 'Required', 'Readonly', 'NonNullable']);

/** 本身不携带具名键的工具类型 */
const OPAQUE_TYPE_WRAPPERS = new Set([
    'Record',
    'Array',
    'ReadonlyArray',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'Function',
]);

/**
 * 一次解析过程中的共享状态。
 *
 * - `stack` 是**递归栈**（进入 add、退出 delete），只用于防环：
 *   同一类型出现在 union 的另一个分支里是合法的，不能被当成循环丢弃。
 * - `memo` 缓存本次解析已算出的结果，避免菱形继承重复展开。
 * - `sources` 记录解析时读到的每个文件及其版本：refs 里存的是**其它文件**的绝对
 *   下标，必须能判断这些文件事后有没有被改过。
 * - `files` 是本次解析内的源码缓存：`loadSource` 每次都要 `statSync`（Windows 上
 *   约 0.1ms），同一次解析反复取同一文件时不该重复付这个代价。
 * - `incomplete` 表示存在无法静态确定的类型表达式，键集不能作为校验依据。
 */
interface ResolveContext {
    stack: Set<string>;
    memo: Map<string, TypeBodyRef[]>;
    sources: Map<string, SourceVersion>;
    files: Map<string, SourceInfo | null>;
    incomplete: boolean;
}

/** 解析时读过的文件及版本（`path` 保留原始大小写，normalizePath 只用于去重键） */
interface SourceVersion {
    path: string;
    version: string;
}

interface CachedDataBodies {
    refs: TypeBodyRef[];
    incomplete: boolean;
    /** 解析 refs 时依赖的文件版本：任一文件变了，绝对下标就不可信 */
    sources: Map<string, SourceVersion>;
    /** 校验 sources 时所处的代次：同一代次内不必重复校验 */
    verifiedGeneration: number;
}

/**
 * 缓存代次。文档 / 文件事件只递增它，不丢弃解析结果：命中缓存时代次一致就直接
 * 返回（热路径零 IO），不一致才逐文件校验版本，版本没变则保留结果。
 */
let generation = 0;

/** 源码文件可能变了（文档事件 / 磁盘监听）：让后续缓存命中重新校验文件版本 */
export function invalidateTypeCache(): void {
    generation++;
}

/** 键是 SourceInfo，源码版本变化后自动失效 */
let typeBodyCache = new WeakMap<SourceInfo, Map<string, CachedDataBodies>>();

/** interface 基础键集缓存（Pick / Omit 过滤在读取时叠加） */
let baseKeyCache = new WeakMap<SourceInfo, Map<number, BaseKeys>>();

interface BaseKeys {
    keys: string[];
    /** 体内有索引签名 / 映射类型：还存在无法枚举的动态键 */
    hasIndexSignature: boolean;
}

/** 被引用文件内容变化时调用，丢掉所有解析结果 */
export function clearTypeCache(): void {
    typeBodyCache = new WeakMap();
    baseKeyCache = new WeakMap();
}

function createContext(): ResolveContext {
    return { stack: new Set(), memo: new Map(), sources: new Map(), files: new Map(), incomplete: false };
}

/** 解析期读取源码，顺带记下版本供缓存命中时校验；同一上下文内只读一次磁盘 */
function sourceOf(filePath: string, ctx: ResolveContext): SourceInfo | null {
    const key = normalizePath(filePath);
    const cached = ctx.files.get(key);
    if (cached !== undefined) return cached;

    const source = loadSource(filePath);
    ctx.files.set(key, source);
    if (source) ctx.sources.set(key, { path: filePath, version: source.version });
    return source;
}

/** 缓存是否仍有效：所有被引用的文件都还是解析时的版本 */
function sourcesCurrent(sources: Map<string, SourceVersion>): boolean {
    for (const { path: filePath, version } of sources.values()) {
        const source = loadSource(filePath);
        if (!source || source.version !== version) return false;
    }
    return true;
}

function findFirstBaseElementClass(source: SourceInfo): ClassInfo | null {
    return source.classes.find(cls => cls.extendsName === 'BaseElement' && cls.extendsTypeArg) ?? null;
}

export interface DataBodyResolution {
    refs: TypeBodyRef[];
    /** true 表示有无法静态确定的类型，键集不可作为 `$data` 校验依据 */
    incomplete: boolean;
}

export function resolveDataBodies(tsPath: string, cls: ClassInfo | null): TypeBodyRef[] {
    return resolveDataBodiesInfo(tsPath, cls).refs;
}

/** 同 `resolveDataBodies`，同时返回键集是否完整（诊断据此决定要不要跳过校验） */
export function resolveDataBodiesInfo(tsPath: string, cls: ClassInfo | null): DataBodyResolution {
    const source = loadSource(tsPath);
    if (!source) return { refs: [], incomplete: false };

    const owner = cls ?? findFirstBaseElementClass(source);
    if (!owner || owner.extendsTypeArgStart < 0 || owner.extendsTypeArgEnd <= owner.extendsTypeArgStart) {
        return { refs: [], incomplete: false };
    }

    const cacheKey = `${owner.name}#${owner.extendsTypeArgStart}`;
    let byOwner = typeBodyCache.get(source);
    if (!byOwner) {
        byOwner = new Map();
        typeBodyCache.set(source, byOwner);
    }

    const cached = byOwner.get(cacheKey);
    if (cached) {
        // 本代次内已经校验过，直接返回（hover / 补全会反复命中）
        if (cached.verifiedGeneration === generation) {
            return { refs: cached.refs, incomplete: cached.incomplete };
        }
        // 代次变了才逐文件校验：被 import 的类型文件可能没在编辑器里打开
        // （git checkout / 外部生成），必须确认它们都还是解析时的版本，
        // 否则 refs 里的绝对下标会错位。
        if (sourcesCurrent(cached.sources)) {
            cached.verifiedGeneration = generation;
            return { refs: cached.refs, incomplete: cached.incomplete };
        }
    }

    const ctx = createContext();
    ctx.sources.set(normalizePath(tsPath), { path: tsPath, version: source.version });
    const refs = resolveTypeRange(tsPath, { start: owner.extendsTypeArgStart, end: owner.extendsTypeArgEnd }, 0, ctx);
    const incomplete = ctx.incomplete || refs.some(bodyHasIndexSignature);
    byOwner.set(cacheKey, {
        refs,
        incomplete,
        sources: ctx.sources,
        verifiedGeneration: generation,
    });
    return { refs, incomplete };
}

/** 类型体里有索引签名 / 映射类型：键集不完整，不能拿来报未定义 */
function bodyHasIndexSignature(body: TypeBodyRef): boolean {
    const source = loadSource(body.path);
    return source !== null && readBaseKeys(source, body.open).hasIndexSignature;
}

/** 读取一个类型体的属性键（Pick / Omit 过滤在这一层生效） */
export function readTypeBodyKeys(body: TypeBodyRef): string[] {
    const source = loadSource(body.path);
    if (!source) return [];
    return bodyKeysOf(source, body).keys;
}

/**
 * 已持有源码时的键集读取：调用方已经 loadSource 过，不必再 stat 一次。
 *
 * `hasIndexSignature` 表示「任何名字都可能存在」——`Pick` / `Omit` 之后键集被
 * 收窄，这条退路也就不成立了。
 */
function bodyKeysOf(source: SourceInfo, body: TypeBodyRef): BaseKeys {
    const base = readBaseKeys(source, body.open);
    let keys = base.keys;
    if (body.pick) {
        const picked = body.pick;
        keys = keys.filter(key => picked.includes(key));
    }
    if (body.omit) {
        const omitted = body.omit;
        keys = keys.filter(key => !omitted.includes(key));
    }
    const hasIndexSignature = base.hasIndexSignature && !body.pick && !body.omit;
    return { keys, hasIndexSignature };
}

/** interface 基础键集按 `{` 下标缓存：`typeBodyHasKey` 会被反复调用 */
function readBaseKeys(source: SourceInfo, open: number): BaseKeys {
    let byOpen = baseKeyCache.get(source);
    if (!byOpen) {
        byOpen = new Map();
        baseKeyCache.set(source, byOpen);
    }

    const cached = byOpen.get(open);
    if (cached) return cached;

    const parsed = readInterfaceKeys(source.text, source.masked, open);
    const value: BaseKeys = { keys: parsed.keys, hasIndexSignature: parsed.hasIndexSignature };
    byOpen.set(open, value);
    return value;
}

export function typeBodyHasKey(body: TypeBodyRef, name: string): boolean {
    return readTypeBodyKeys(body).includes(name);
}

export interface DataPathResult {
    /** 每一段都在已知类型体里找到 */
    found: boolean;
    /** 有无法静态确定的类型：找不到也不能断言「不存在」 */
    incomplete: boolean;
    /** 第一段**确定**不存在的下标（诊断定位用）；null 表示没有确定缺失 */
    missingAt: number | null;
    /** 最后一段命中的位置（跳转用）；路径未走完时为 null */
    location: { path: string; index: number } | null;
    /** 最后一段的类型原文（悬停用）；路径未走完时为 null */
    typeText: string | null;
    /** 末段是方法 / 访问器时的声明原文（悬停用），普通数据键为 null */
    memberText: string | null;
    /** 最后一段的类型体（补全下一级用） */
    refs: TypeBodyRef[];
}

/**
 * 沿 `$data.a.b` 的路径逐级解析：每一级在当前类型体里找键，再把该键的类型解析成
 * 下一组类型体。
 *
 * 中间类型无法静态确定（外部类型 / 泛型实参 / 索引访问）时标记 `incomplete`，
 * 调用方据此跳过诊断，而不是按不完整的链报「未定义」。
 *
 * 走不完时 `location` / `typeText` 一律为 null：把父级的位置和类型当成末段的，
 * 会让悬停显示 `$data.map.zzz: Record<...>` 这种并非该键类型的信息。
 */
export function resolveDataPath(tsPath: string, cls: ClassInfo | null, segments: string[]): DataPathResult {
    const initial = resolveDataBodiesInfo(tsPath, cls);
    let refs = initial.refs;
    let incomplete = initial.incomplete;
    let location: { path: string; index: number } | null = null;
    let typeText: string | null = null;
    let memberText: string | null = null;
    // 整条路径共用一个上下文：memo / 源码缓存跨段复用，否则每段都要重新 stat
    const ctx = createContext();

    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        if (refs.length === 0) {
            return {
                found: false,
                incomplete: true,
                missingAt: null,
                location: null,
                typeText: null,
                memberText: null,
                refs: [],
            };
        }

        let hit: { path: string; index: number } | null = null;
        let hitType: string | null = null;
        let hitMemberText: string | null = null;
        let unreadable = false;
        const next: TypeBodyRef[] = [];

        for (const body of refs) {
            const source = sourceOf(body.path, ctx);
            if (!source) {
                unreadable = true;
                continue;
            }

            const bodyKeys = bodyKeysOf(source, body);
            // 索引签名（`{ [k: string]: T }`）下任何名字都合法：这一段只能算「不确定」，
            // 具名键仍然照常解析，但缺名字时不能断言不存在
            if (bodyKeys.hasIndexSignature) ctx.incomplete = true;

            if (!bodyKeys.keys.includes(segment)) {
                // 方法签名 / 访问器也是合法成员（`$data.user.greet()`、`get title()`），
                // 只是不算数据键；`Pick` / `Omit` 收窄过的类型不适用这条退路
                const member =
                    bodyKeys.hasIndexSignature || body.pick || body.omit
                        ? null
                        : findMemberText(source.text, source.masked, body.open, segment);
                if (!member) continue;

                if (!hit) {
                    hit = { path: body.path, index: member.nameIndex };
                    hitMemberText = member.text;
                }
                // 方法 / 访问器的返回值类型不继续展开：末段是它本身，没有「下一级」
                continue;
            }

            const keyIndex = findKeyIndex(source.text, source.masked, body.open, segment);
            if (keyIndex === null) {
                unreadable = true;
                continue;
            }
            if (!hit) {
                hit = { path: body.path, index: keyIndex };
                hitType = findKeyType(source.text, source.masked, body.open, segment);
            }
            next.push(...resolveKeyTypeBodies(body, segment, ctx));
        }

        if (ctx.incomplete) incomplete = true;

        if (!hit) {
            const definite = !incomplete && !unreadable;
            return {
                found: false,
                incomplete: !definite,
                missingAt: definite ? index : null,
                location: null,
                typeText: null,
                memberText: null,
                refs: [],
            };
        }

        location = hit;
        typeText = hitType;
        memberText = hitMemberText;
        refs = next;
    }

    return { found: true, incomplete, missingAt: null, location, typeText, memberText, refs };
}

/** 某个键的**类型**解析出的类型体（对象 / interface / 别名 / 导入链） */
function resolveKeyTypeBodies(body: TypeBodyRef, name: string, ctx: ResolveContext): TypeBodyRef[] {
    const source = sourceOf(body.path, ctx);
    if (!source) return [];

    const range = findKeyTypeRange(source.text, source.masked, body.open, name);
    if (!range) return [];
    return resolveTypeRange(body.path, range, 0, ctx);
}

function trimRange(masked: string, start: number, end: number): SourceRange {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(masked[from])) from++;
    while (to > from && /\s/.test(masked[to - 1])) to--;
    return { start: from, end: to };
}

/** 按顶层分隔符切分区间（忽略 `<>` `()` `[]` `{}` 内部的分隔符） */
function splitTopLevel(masked: string, range: SourceRange, sep: '&' | '|' | ','): SourceRange[] {
    const parts: SourceRange[] = [];
    let angle = 0;
    let round = 0;
    let square = 0;
    let curly = 0;
    let partStart = range.start;

    for (let i = range.start; i < range.end; i++) {
        const c = masked[i];
        if (c === '<') angle++;
        else if (c === '>') {
            // `=>` 里的 `>` 不是泛型闭合
            if (masked[i - 1] === '=') continue;
            if (angle > 0) angle--;
        } else if (c === '(') round++;
        else if (c === ')') {
            if (round > 0) round--;
        } else if (c === '[') square++;
        else if (c === ']') {
            if (square > 0) square--;
        } else if (c === '{') curly++;
        else if (c === '}') {
            if (curly > 0) curly--;
        } else if (c === sep && angle === 0 && round === 0 && square === 0 && curly === 0) {
            if (i > partStart) parts.push({ start: partStart, end: i });
            partStart = i + 1;
        }
    }

    if (range.end > partStart) parts.push({ start: partStart, end: range.end });
    return parts;
}

function resolveTypeRange(filePath: string, range: SourceRange, depth: number, ctx: ResolveContext): TypeBodyRef[] {
    if (depth > MAX_TYPE_DEPTH) return [];
    const source = sourceOf(filePath, ctx);
    if (!source) return [];

    const refs: TypeBodyRef[] = [];
    for (const part of splitTopLevel(source.masked, range, '&')) {
        refs.push(...resolveSingleType(filePath, part, depth, ctx));
    }
    return refs;
}

function resolveSingleType(filePath: string, range: SourceRange, depth: number, ctx: ResolveContext): TypeBodyRef[] {
    if (depth > MAX_TYPE_DEPTH) return [];
    const source = sourceOf(filePath, ctx);
    if (!source) return [];

    const masked = source.masked;
    let { start, end } = trimRange(masked, range.start, range.end);
    if (start >= end) return [];

    // 去掉外层括号：`(A & B)`
    while (masked[start] === '(') {
        const close = findMatchingBracket(masked, start);
        if (close === -1 || close >= end) break;
        if (skipSpaces(masked, close + 1) < end) break;
        start = skipSpaces(masked, start + 1);
        end = close;
    }
    if (start >= end) return [];

    // 联合类型：任一分支的键都视为可用（宁可少报错，不要误报）
    const unionParts = splitTopLevel(masked, { start, end }, '|');
    if (unionParts.length > 1) {
        return unionParts.flatMap(part => resolveSingleType(filePath, part, depth + 1, ctx));
    }

    // 括号里可能包着交叉类型：`(Pick<S, 'a'> & { d: string })`
    const intersectionParts = splitTopLevel(masked, { start, end }, '&');
    if (intersectionParts.length > 1) {
        return intersectionParts.flatMap(part => resolveSingleType(filePath, part, depth + 1, ctx));
    }

    if (masked[start] === '{') {
        return [{ path: filePath, open: start, kind: 'literal' }];
    }

    const token = readIdentifier(masked, start);
    if (!token) return [];

    const name = token.value;
    const nameEnd = token.index + name.length;
    const genericOpen = skipSpaces(masked, nameEnd);

    if (masked[genericOpen] === '<') {
        if (OPAQUE_TYPE_WRAPPERS.has(name)) {
            // `Record<K, V>` / `Array<T>` 这类没有可枚举的具名键（索引用动态键），
            // 与交叉类型叠加时键集并不完整，不能拿剩下的键去报未定义
            ctx.incomplete = true;
            return [];
        }

        const genericEnd = skipAngle(masked, genericOpen);
        if (genericEnd <= genericOpen) {
            // 泛型都解析不出来，键集同样不可信
            ctx.incomplete = true;
            return resolveNamedType(filePath, name, depth, ctx);
        }
        const args = splitTopLevel(masked, { start: genericOpen + 1, end: genericEnd - 1 }, ',');
        if (UNWRAP_TYPE_WRAPPERS.has(name) && args.length > 0) {
            return resolveTypeRange(filePath, args[0], depth + 1, ctx);
        }
        if ((name === 'Pick' || name === 'Omit') && args.length >= 2) {
            return applyKeyFilter(name, filePath, args, depth, ctx);
        }
        // 其它泛型（`WithId<Data>` 这种）：类型实参不会被代入别名 / 接口体，
        // 解析出的键一定残缺，标记后让诊断整体跳过，而不是按残缺键集报错。
        ctx.incomplete = true;
        return resolveNamedType(filePath, name, depth, ctx);
    }

    // 索引访问 `Props['data']`、条件类型 `T extends X ? A : B` 都依赖尚未求值的
    // 类型运算，解析出的键只是巧合，不能用来校验
    if (masked[genericOpen] === '[' || /^extends\b/.test(masked.slice(genericOpen, genericOpen + 8))) {
        ctx.incomplete = true;
    }

    return resolveNamedType(filePath, name, depth, ctx);
}

/** `Pick<T, K>` / `Omit<T, K>`：先解析 T，再按第二个参数的字面量键集过滤 */
function applyKeyFilter(
    wrapper: 'Pick' | 'Omit',
    filePath: string,
    args: SourceRange[],
    depth: number,
    ctx: ResolveContext,
): TypeBodyRef[] {
    const inner = resolveTypeRange(filePath, args[0], depth + 1, ctx);
    const keys = readKeyUnion(filePath, args[1], depth + 1, ctx);

    if (keys === null) {
        // 键集无法静态确定：Omit 保留全部键（宁可多补全，不误报），Pick 不敢猜
        return wrapper === 'Omit' ? inner : [];
    }

    return inner.map(ref => {
        if (wrapper === 'Pick') {
            const picked = ref.pick ? ref.pick.filter(key => keys.includes(key)) : keys;
            return { ...ref, pick: picked };
        }
        return { ...ref, omit: [...(ref.omit ?? []), ...keys] };
    });
}

/**
 * 读取键集：`'a' | 'b'` 形式的字面量联合，或指向字面量别名的类型名。
 * 无法确定时返回 null。
 */
function readKeyUnion(filePath: string, range: SourceRange, depth: number, ctx: ResolveContext): string[] | null {
    if (depth > MAX_TYPE_DEPTH) return null;
    const source = sourceOf(filePath, ctx);
    if (!source) return null;

    // 按顶层 `|` 拆成多段，逐段解析后取并集。这样 `K | 'c'`、`keyof S | 'c'`
    // 这种「别名 + 字面量」混合键集不会丢掉其中一边。
    const parts = splitTopLevel(source.masked, range, '|');
    const segments = parts.length > 0 ? parts : [range];
    const keys: string[] = [];

    for (const part of segments) {
        const start = skipTextSpaces(source.text, part.start);
        if (start >= part.end) continue;
        const raw = source.text.slice(start, part.end);

        // 纯字符串字面量段：键名只能从原文取（掩码里是空格）
        const literalRe = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
        const literal = literalRe.exec(raw.trim());
        if (literal) {
            keys.push(literal[2]);
            continue;
        }

        // `keyof X`：取操作数类型的全部键
        const token = readIdentifier(source.masked, start);
        if (!token) continue;
        if (token.value === 'keyof') {
            const operand = { start: skipTextSpaces(source.text, token.index + token.value.length), end: part.end };
            const bodies = resolveTypeRange(filePath, operand, depth + 1, ctx);
            keys.push(...bodies.flatMap(readTypeBodyKeys));
            continue;
        }

        // 类型别名 / 导入 / barrel 转出的键别名
        const named = readNamedKeyUnion(filePath, token.value, depth + 1, ctx);
        if (named) keys.push(...named);
    }

    return keys.length > 0 ? Array.from(new Set(keys)) : null;
}

/** 键集别名：同文件 `type K = ...` → import → barrel re-export */
function readNamedKeyUnion(filePath: string, name: string, depth: number, ctx: ResolveContext): string[] | null {
    if (depth > MAX_TYPE_DEPTH) return null;
    const source = sourceOf(filePath, ctx);
    if (!source) return null;

    const alias = findTypeAliasRange(source.masked, source.text, name);
    if (alias) return readKeyUnion(filePath, alias, depth + 1, ctx);

    const binding = findImportBinding(source.text, source.masked, name);
    if (binding) {
        const target = resolveModuleFile(path.dirname(filePath), binding.spec);
        if (target) {
            const imported = readNamedKeyUnion(target, binding.imported, depth + 1, ctx);
            if (imported) return imported;
        }
    }

    // 经 barrel 转出的键别名：`export { Keys as K } from './types'`
    for (const target of reExportTargetFiles(filePath, name, ctx)) {
        const reExported = readNamedKeyUnion(target.path, target.name, depth + 1, ctx);
        if (reExported) return reExported;
    }

    return null;
}

interface ReExportTarget {
    path: string;
    /** 目标文件里声明的原名（`export { X as Y }` 时为 X，其余与请求名相同） */
    name: string;
}

/**
 * barrel 里 `export { X } from` / `export * from` 指向的目标文件（去重）。
 * `export { X as Y }` 会把本地名 Y 映射回原名 X —— 目标文件里声明的是 X，
 * 必须带回原名，否则后续按 Y 找不到声明（`export *` 时原名不变）。
 */
function reExportTargetFiles(filePath: string, name: string, ctx: ResolveContext): ReExportTarget[] {
    const source = sourceOf(filePath, ctx);
    if (!source) return [];

    const dir = path.dirname(filePath);
    const targets = new Map<string, ReExportTarget>();
    const push = (spec: string, importedName: string): void => {
        const target = resolveModuleFile(dir, spec);
        if (target && normalizePath(target) !== normalizePath(filePath)) {
            const key = `${normalizePath(target)}#${importedName}`;
            targets.set(key, { path: target, name: importedName });
        }
    };

    // 逐条 clause 解析，才能拿到 `X as Y` 里的原名 X（本地名 Y 才是请求名）
    const named = new RegExp(`\\bexport\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`, 'g');
    for (const match of codeMatches(source.text, source.masked, named, 'export')) {
        for (const clause of match[1].split(',')) {
            const parts = clause.trim().split(/\s+as\s+/);
            const imported = (parts[0] ?? '').trim().replace(/^type\s+/, '');
            const local = (parts.length > 1 ? parts[parts.length - 1] : imported).trim();
            if (local === name && imported) push(match[2], imported);
        }
    }

    const star = /\bexport\s*(?:type\s*)?\*\s*from\s*['"]([^'"]+)['"]/g;
    for (const match of codeMatches(source.text, source.masked, star, 'export')) push(match[1], name);

    return Array.from(targets.values());
}

function resolveNamedType(filePath: string, name: string, depth: number, ctx: ResolveContext): TypeBodyRef[] {
    if (depth > MAX_TYPE_DEPTH) return [];

    const key = `${normalizePath(filePath)}#${name}`;
    const memoized = ctx.memo.get(key);
    if (memoized) return memoized;

    // 只在「当前递归栈」上判环：union 的兄弟分支可以重复访问同一个类型
    if (ctx.stack.has(key)) return [];
    ctx.stack.add(key);

    try {
        const refs = resolveNamedTypeInner(filePath, name, depth, ctx);
        ctx.memo.set(key, refs);
        return refs;
    } finally {
        ctx.stack.delete(key);
    }
}

function resolveNamedTypeInner(filePath: string, name: string, depth: number, ctx: ResolveContext): TypeBodyRef[] {
    const source = sourceOf(filePath, ctx);
    if (!source) return [];

    // 1. 同文件的 interface（同名声明合并 + extends 继承链）
    const interfaceOpens = findInterfaceBodies(source.masked, name);
    if (interfaceOpens.length > 0) {
        const refs: TypeBodyRef[] = interfaceOpens.map(open => ({ path: filePath, open, kind: 'interface' }));
        for (const base of readInterfaceExtends(source.masked, name)) {
            refs.push(...resolveSingleType(filePath, base, depth + 1, ctx));
        }
        return refs;
    }

    // 2. 同文件的 type 别名
    const alias = findTypeAliasRange(source.masked, source.text, name);
    if (alias) return resolveTypeRange(filePath, alias, depth + 1, ctx);

    // 3. 从 import 进来的类型（正则只接受代码区域，注释里的 import 不算）
    //    `import { A as B }` 时本地名是 B，但目标文件里声明的是原名 A，按原名找
    const binding = findImportBinding(source.text, source.masked, name);
    if (binding) {
        const target = resolveModuleFile(path.dirname(filePath), binding.spec);
        if (target) {
            // 换文件不算类型嵌套深度；环路由递归栈兜住
            const imported = resolveNamedType(target, binding.imported, depth, ctx);
            if (imported.length > 0) return imported;
        }
    }

    // 4. 当前文件是 barrel：`export { X } from './x'` / `export * from './x'`
    return resolveReExportedType(filePath, name, depth + 1, ctx);
}

/** 所有同名 `interface Name<...> extends ...` 声明里的基类区间（声明合并） */
function readInterfaceExtends(masked: string, name: string): SourceRange[] {
    const re = new RegExp(`\\binterface\\s+${escapeRegex(name)}\\b`, 'g');
    const ranges: SourceRange[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(masked)) !== null) {
        const nameEnd = match.index + match[0].length;
        const open = findHeaderBrace(masked, nameEnd);
        if (open === -1) continue;
        re.lastIndex = Math.max(re.lastIndex, open + 1);

        // 先跨过泛型参数，避免把 `interface S<T extends { id: string }>` 里的
        // 约束 extends 当成继承的基类。
        let headerStart = skipSpaces(masked, nameEnd);
        if (masked[headerStart] === '<') {
            const afterAngle = skipAngle(masked, headerStart);
            if (afterAngle > headerStart) headerStart = skipSpaces(masked, afterAngle);
        }

        const extendsMatch = /\bextends\b/.exec(masked.slice(headerStart, open));
        if (!extendsMatch) continue;

        const baseStart = skipSpaces(masked, headerStart + extendsMatch.index + extendsMatch[0].length);
        if (open > baseStart) ranges.push(...splitTopLevel(masked, { start: baseStart, end: open }, ','));
    }

    return ranges;
}

const TYPE_ALIAS_DECL_START_RE =
    /^(?:export\s+|declare\s+|default\s+)*(?:interface|type|class|const|let|var|function|enum|namespace|import)\b/;

/** 定位 `type Name = ...` 右侧的区间 */
function findTypeAliasRange(masked: string, text: string, name: string): SourceRange | null {
    const re = new RegExp(`\\btype\\s+${escapeRegex(name)}\\b\\s*`, 'g');
    const match = re.exec(masked);
    if (!match) return null;

    let i = skipSpaces(masked, match.index + match[0].length);
    if (masked[i] === '<') {
        const afterAngle = skipAngle(masked, i);
        if (afterAngle <= i) return null;
        i = skipSpaces(masked, afterAngle);
    }
    if (masked[i] !== '=') return null;

    // 用原文跳过空白：别名右侧可能是字符串字面量联合（`type Keys = 'a' | 'b'`），
    // 掩码文本里这些字面量是空格，按掩码跳过会直接吃掉第一个键
    return { start: skipTextSpaces(text, i + 1), end: scanTypeAliasEnd(masked, i + 1) };
}

/** 只跳过原文里的空白字符（不跳过被掩码成空格的字符串字面量） */
function skipTextSpaces(text: string, from: number): number {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    return i;
}

function scanTypeAliasEnd(masked: string, start: number): number {
    let angle = 0;
    let round = 0;
    let square = 0;
    let curly = 0;

    for (let i = start; i < masked.length; i++) {
        const c = masked[i];
        if (c === '<') angle++;
        else if (c === '>') {
            if (masked[i - 1] === '=') continue;
            if (angle > 0) angle--;
        } else if (c === '(') round++;
        else if (c === ')') {
            if (round > 0) round--;
        } else if (c === '[') square++;
        else if (c === ']') {
            if (square > 0) square--;
        } else if (c === '{') curly++;
        else if (c === '}') {
            if (curly === 0) return i;
            curly--;
        } else if (c === ';' && angle === 0 && round === 0 && square === 0 && curly === 0) {
            return i;
        } else if (c === '\n' && angle === 0 && round === 0 && square === 0 && curly === 0) {
            const rest = masked.slice(i + 1, Math.min(masked.length, i + MEMBER_LOOKAHEAD)).replace(/^\s+/, '');
            if (TYPE_ALIAS_DECL_START_RE.test(rest)) return i;
        }
    }
    return masked.length;
}

/** 沿 barrel 文件里的 re-export 找类型（注释 / 字符串里的 export 不算） */
function resolveReExportedType(filePath: string, name: string, depth: number, ctx: ResolveContext): TypeBodyRef[] {
    if (depth > MAX_TYPE_DEPTH) return [];

    for (const target of reExportTargetFiles(filePath, name, ctx)) {
        const refs = resolveNamedType(target.path, target.name, depth, ctx);
        if (refs.length > 0) return refs;
    }

    return [];
}
