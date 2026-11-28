import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ClassInfo,
    MemberInfo,
    escapeRegex,
    findKeyIndex,
    findKeyType,
    findMatchingBracket,
    readObjectLiteralKeys,
    scanClassMembers,
} from './tsSource';
import { collectExpressionRegions, computeLineStarts, maskHtmlNonContent, offsetToLineCol } from './htmlSource';
import { clearSourceCache, loadSource, SourceInfo } from './tsLoader';
import {
    clearModuleCache,
    findImportBinding,
    findNamespaceImports,
    normalizePath,
    resolveImportDeclaration,
    resolveModuleFile,
    resolvePackageImport,
} from './moduleResolver';
import {
    clearTypeCache,
    invalidateTypeCache,
    readTypeBodyKeys,
    resolveDataBodies,
    resolveDataBodiesInfo,
    typeBodyHasKey,
} from './typeResolver';

const SOLELY_CONTROL_TAGS = new Set(['if', 'elseif', 'else', 'for', 'show']);

/**
 * 组件继承自 BaseElement（→ HTMLElement），这些成员在模板里可以直接调用。
 * 只做「放行」不做「补全」，因此宁多勿少——漏掉会变成误报。
 */
const FRAMEWORK_METHODS = new Set([
    // BaseElement 公开 API
    'emit',
    'emitNative',
    'refresh',
    'dispose',
    'warn',
    'error',
    // HTMLElement / Node 常用 API
    'setAttribute',
    'getAttribute',
    'removeAttribute',
    'hasAttribute',
    'toggleAttribute',
    'appendChild',
    'removeChild',
    'insertBefore',
    'replaceChildren',
    'remove',
    'querySelector',
    'querySelectorAll',
    'closest',
    'matches',
    'contains',
    'getBoundingClientRect',
    'getClientRects',
    'focus',
    'blur',
    'click',
    'scrollIntoView',
    'scrollTo',
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
    'animate',
    'requestFullscreen',
    'getRootNode',
    'cloneNode',
    'setPointerCapture',
    'releasePointerCapture',
]);

/** 不是「可调用成员」的名字（构造函数不会被模板调用） */
const NON_CALLABLE = new Set(['constructor']);

// HTML → TS 文件映射
const tsFileCache = new Map<string, string | null>();
// 父类解析结果（key: tsPath#className）
const parentCache = new Map<string, { path: string; name: string } | null>();

export function clearTsFileCache(htmlPath?: string): void {
    if (htmlPath) {
        tsFileCache.delete(htmlPath);
    } else {
        tsFileCache.clear();
        parentCache.clear();
        clearTypeCache();
        // 路径 → 源码缓存也一并清掉，避免文件删改后旧内容常驻
        clearSourceCache();
        // 包内声明文件的位置可能随依赖更新变化
        baseElementDirCache.clear();
        // 包入口解析同理
        clearModuleCache();
    }
}

/**
 * 内容变化后失效缓存。
 * 之前的实现只在「文件增删改名」时清缓存，导致补上 `import './x.html?solely'`
 * 之后仍然拿不到对应 TS，必须重启扩展宿主。
 */
export function invalidateForChangedFile(filePath: string): void {
    for (const [htmlPath, tsPath] of tsFileCache) {
        // 指向被改文件的映射必然失效；
        // null（未找到）也可能因为新增了 import 而变得可解析，一并清掉。
        // 不能只清「同目录」——模板在 templates/、组件在 components/ 时清不到。
        if (tsPath === null || tsPath === filePath) tsFileCache.delete(htmlPath);
    }
    parentCache.clear();
    // $data 类型可能来自被修改的文件（types.ts / 导入链）。这里只递增缓存代次：
    // 下次命中时按文件版本决定是否重解析，没被牵动的类型链不必重新展开
    invalidateTypeCache();
}

export type ReferenceKind = 'method' | 'dataProp' | 'ref' | 'dataKeyword' | 'getter';

export interface TemplateReference {
    kind: ReferenceKind;
    name: string;
    range: vscode.Range;
    fullExpression: string;
}

export interface TemplateDiagnostic {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
}

export interface MethodSignature {
    name: string;
    signature: string;
    range: vscode.Range;
}

/* ============================================================
 * 模板 ↔ 组件关联
 * ============================================================ */

interface TemplateImport {
    spec: string;
    localName: string | null;
}

/**
 * 列出文件里所有 `?solely` / `?raw` 模板导入。
 *
 * 只认代码区域：`masked` 与原文逐字符对齐，注释 / 字符串里的 `import` 早已被
 * 替换成空格，因此注释掉的导入不会把组件关联到别的模板上。
 */
function findTemplateImports(text: string, masked: string): TemplateImport[] {
    const result: TemplateImport[] = [];
    // 允许紧凑写法：`import tpl from'./x?solely'` / `import{x}from'./y?solely'`
    // `\bimport\b` 两边都要：否则 "imports from './x?solely'" 这类说明文字也会命中
    const re = /\bimport\b\s*([^'"]*?)\s*from\s*['"]([^'"]+)['"]|\bimport\b\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        if (!masked.startsWith('import', match.index)) continue;
        const spec = match[2] ?? match[3] ?? '';
        if (!/\?(?:solely|raw)$/.test(spec)) continue;

        // 说明符的引号也要落在代码区：`import { a } // from './x?solely'` 这种
        // 行尾（或多行导入中间的）注释，路径在注释里而不是真的导入，不能算数。
        // 引号本身在 masked 里被抹成空格，于是改判「说明符之前有没有代码区的 from」
        if (match[2] !== undefined) {
            const quoteIndex = match.index + match[0].length - spec.length - 1;
            if (!masked.slice(match.index, quoteIndex).includes('from')) continue;
        }
        // 默认导入名：`import type { X } from` 没有默认绑定，`type` 不是导入名
        const clause = (match[1] ?? '').trim();
        const typeOnly = /^type\b\s*/.exec(clause);
        const def = /^([A-Za-z_$][\w$]*)/.exec(typeOnly ? clause.slice(typeOnly[0].length) : clause);
        result.push({ spec, localName: def ? def[1] : null });
    }

    return result;
}

function importsTemplate(tsPath: string, htmlPath: string): boolean {
    const source = loadSource(tsPath);
    if (!source) return false;
    return findTemplateImports(source.text, source.masked).some(
        item => resolveSpecifier(tsPath, item.spec) === normalizePath(htmlPath),
    );
}

/** 把 import 说明符解析成绝对路径（去查询串、统一分隔符与大小写） */
function resolveSpecifier(tsPath: string, spec: string): string {
    return normalizePath(path.resolve(path.dirname(tsPath), spec.split('?')[0]));
}

/**
 * 候选目录：模板自身目录 → 父目录 → 父目录下的兄弟目录（模板放在 templates/ 子目录的场景）。
 * 大多数项目第一个就命中，后面的只是兜底。
 */
function candidateDirs(htmlDir: string): string[] {
    const dirs = [htmlDir];
    const parent = path.dirname(htmlDir);
    if (parent === htmlDir) return dirs;

    dirs.push(parent);
    try {
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            dirs.push(path.join(parent, entry.name));
            if (dirs.length >= 40) break;
        }
    } catch {
        /* 忽略无权限目录 */
    }
    return dirs;
}

export function findCorrespondingTsFile(htmlPath: string): string | null {
    const cached = tsFileCache.get(htmlPath);
    if (cached !== undefined) {
        if (cached === null || fs.existsSync(cached)) return cached;
        tsFileCache.delete(htmlPath);
    }

    let budget = 400;

    for (const dir of candidateDirs(path.dirname(htmlPath))) {
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            continue;
        }

        for (const file of entries) {
            if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
            if (--budget <= 0) break;

            const tsPath = path.join(dir, file);
            if (importsTemplate(tsPath, htmlPath)) {
                tsFileCache.set(htmlPath, tsPath);
                return tsPath;
            }
        }
    }

    tsFileCache.set(htmlPath, null);
    return null;
}

/** 从 TS 文件查找其导入的对应 HTML 模板文件 */
export function findCorrespondingHtmlFile(tsPath: string): string | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const dir = path.dirname(tsPath);
    for (const item of findTemplateImports(source.text, source.masked)) {
        const htmlPath = path.resolve(dir, item.spec.split('?')[0]);
        if (fs.existsSync(htmlPath)) return htmlPath;
    }
    return null;
}

/* ============================================================
 * 组件类定位
 * ============================================================ */

/** 找到某个模板导入在文件里的默认导入名 */
function findTemplateLocalName(source: SourceInfo, tsPath: string, htmlPath: string): string | null {
    const target = normalizePath(htmlPath);
    for (const item of findTemplateImports(source.text, source.masked)) {
        if (!item.localName) continue;
        if (resolveSpecifier(tsPath, item.spec) === target) return item.localName;
    }
    return null;
}

/** 在装饰器参数里找到 `template: localName` 或 `template,` 简写，返回其后第一个类 */
function findClassByTemplateBinding(masked: string, classes: ClassInfo[], localName: string): ClassInfo | null {
    const decorator = /@[A-Za-z_$][\w$]*\s*\(/g;
    const explicit = new RegExp(`\\btemplate\\s*:\\s*${escapeRegex(localName)}\\b`);
    const shorthand = /(?:^|[{,])\s*template\s*(?=[,}]|$)/;

    let match: RegExpExecArray | null;
    while ((match = decorator.exec(masked)) !== null) {
        const open = match.index + match[0].length - 1;
        const close = findMatchingBracket(masked, open);
        if (close === -1) continue;

        const args = masked.slice(open + 1, close);
        if (!explicit.test(args) && !shorthand.test(args)) continue;

        const owner = classes.find(cls => cls.keywordIndex > close);
        if (owner) return owner;
    }

    return null;
}

/**
 * 定位「这个模板属于哪个类」。
 *
 * 单文件多组件（父组件 + 私有子组件）是 Web Components 的常见写法，
 * 之前只取文件里第一个 `super({})` / 第一个 `extends BaseElement<...>`，
 * 导致同文件其它组件的模板全部误报。
 */
function resolveComponentClass(tsPath: string, htmlPath?: string): ClassInfo | null {
    const source = loadSource(tsPath);
    if (!source || source.classes.length === 0) return null;
    if (source.classes.length === 1) return source.classes[0];

    if (htmlPath) {
        const localName = findTemplateLocalName(source, tsPath, htmlPath);
        if (localName) {
            const byBinding = findClassByTemplateBinding(source.masked, source.classes, localName);
            if (byBinding) return byBinding;
        }
    }

    const baseClasses = source.classes.filter(cls => cls.extendsName === 'BaseElement');
    return baseClasses.length === 1 ? baseClasses[0] : null;
}

/**
 * 类成员扫描缓存。键是 SourceInfo 对象本身——源码版本一变就会生成新对象，
 * 缓存自然失效，不需要手动清理。
 */
const memberCache = new WeakMap<SourceInfo, Map<string, MemberInfo[]>>();

function membersOf(source: SourceInfo, cls: ClassInfo | null): MemberInfo[] {
    const key = cls?.name ?? '*';
    let byClass = memberCache.get(source);
    if (!byClass) {
        byClass = new Map();
        memberCache.set(source, byClass);
    }

    const cached = byClass.get(key);
    if (cached) return cached;

    const targets = cls ? [cls] : source.classes;
    const members: MemberInfo[] = [];
    for (const target of targets) {
        members.push(...scanClassMembers(source.text, source.masked, target.bodyStart, target.bodyEnd));
    }

    byClass.set(key, members);
    return members;
}

/** 取类体范围内的成员；无法定位到单个类时合并全部类的成员 */
function collectMembers(tsPath: string, htmlPath?: string): MemberInfo[] {
    const source = loadSource(tsPath);
    if (!source) return [];
    return membersOf(source, resolveComponentClass(tsPath, htmlPath));
}

/** 取组件类（或全部类）的 `super({...})` 对象字面量起始下标 */
function findSuperObject(source: SourceInfo, cls: ClassInfo | null): number | null {
    const ranges = cls
        ? [[cls.bodyStart, cls.bodyEnd] as const]
        : source.classes.map(c => [c.bodyStart, c.bodyEnd] as const);

    for (const [start, end] of ranges) {
        const re = /\bsuper\s*\(/g;
        re.lastIndex = start;
        const match = re.exec(source.masked);
        if (!match || match.index >= end) continue;

        const parenOpen = match.index + match[0].length - 1;
        const parenClose = findMatchingBracket(source.masked, parenOpen);
        if (parenClose === -1 || parenClose > end) continue;

        // `{` 必须落在实参括号内：`super()` / `super(init)` 没有对象字面量，
        // 不能顺手把后面方法体的 `{` 当成数据对象。
        const open = source.masked.indexOf('{', parenOpen);
        if (open !== -1 && open < parenClose) return open;
    }

    return null;
}

/* ============================================================
 * 数据属性提取
 * ============================================================ */

/** 从 TS 文件提取 $data 的数据属性名（super({}) + interface） */
export function extractDataPropsFromTs(tsPath: string, htmlPath?: string): string[] {
    return extractDataPropsInfo(tsPath, htmlPath).props;
}

/** 同 `extractDataPropsFromTs`，同时返回键集是否完整（诊断据此决定要不要跳过校验） */
function extractDataPropsInfo(tsPath: string, htmlPath?: string): { props: string[]; incomplete: boolean } {
    const { props: interfaceProps, incomplete } = extractDataPropsFromInterface(tsPath, htmlPath);
    const props = [...extractDataPropsFromSuper(tsPath, htmlPath), ...interfaceProps];
    return { props: Array.from(new Set(props)), incomplete };
}

function extractDataPropsFromSuper(tsPath: string, htmlPath?: string): string[] {
    const source = loadSource(tsPath);
    if (!source) return [];

    const open = findSuperObject(source, resolveComponentClass(tsPath, htmlPath));
    if (open === null) return [];

    return readObjectLiteralKeys(source.masked, open);
}

/** 从 `BaseElement<...>` 的类型声明里提取 $data 属性名（交叉 / 继承 / 导入 / 别名，见 typeResolver） */
function extractDataPropsFromInterface(tsPath: string, htmlPath?: string): { props: string[]; incomplete: boolean } {
    const props: string[] = [];
    // 去重由 extractDataPropsInfo 统一负责
    const resolution = resolveDataBodiesInfo(tsPath, resolveComponentClass(tsPath, htmlPath));
    for (const body of resolution.refs) {
        props.push(...readTypeBodyKeys(body));
    }
    return { props, incomplete: resolution.incomplete };
}

/* ============================================================
 * 位置 → 引用
 * ============================================================ */

export function extractReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
): TemplateReference | null {
    const line = document.lineAt(position.line).text;
    const charIndex = position.character;

    const refAttr = extractRefAtPosition(line, position.line, charIndex);
    if (refAttr) return refAttr;

    const sModelProp = extractSModelPropAtPosition(line, position.line, charIndex);
    if (sModelProp) return sModelProp;

    const chained = extractChainedMethodAtPosition(line, position.line, charIndex);
    if (chained) return chained;

    const method = extractMethodCallAtPosition(line, position.line, charIndex);
    if (method) return method;

    const thisProp = extractThisPropAtPosition(line, position.line, charIndex);
    if (thisProp) return thisProp;

    const dataProp = extractDataPropAtPosition(line, position.line, charIndex);
    if (dataProp) return dataProp;

    const dataKw = extractDataKeywordAtPosition(line, position.line, charIndex);
    if (dataKw) return dataKw;

    return null;
}

function extractMethodCallAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bthis\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index + match[0].indexOf(match[1]);
        const endChar = startChar + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'method',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractThisPropAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    // `this.xxx` 且后面不是 `(`；`\b` 防止回溯到词中间
    const regex = /\bthis\.(\w+)\b(?!\s*\()/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index + 'this.'.length;
        const endChar = startChar + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'getter',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractDataPropAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\$data\.(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index + '$data.'.length;
        const endChar = startChar + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'dataProp',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractDataKeywordAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\$data\b/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index;
        const endChar = startChar + 5;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'dataKeyword',
                name: '$data',
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: '$data',
            };
        }
    }

    return null;
}

function extractRefAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bref\s*=\s*(["'])([\w-]+)\1/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const quote = match[1];
        const valueStart = match.index + match[0].indexOf(quote) + 1;
        const startChar = valueStart;
        const endChar = valueStart + match[2].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'ref',
                name: match[2],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractSModelPropAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bs-model\s*=\s*(["'])([^"']*)\1/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const quote = match[1];
        const valueStart = match.index + match[0].indexOf(quote) + 1;
        const value = match[2];

        // 去掉 $data. / this. 前缀和前导空白；尾部空白不能影响偏移（历史 bug）
        let offset = 0;
        let remaining = value;
        const prefixMatch = remaining.match(/^(\$data\.|this\.)/);
        if (prefixMatch) {
            offset += prefixMatch[0].length;
            remaining = remaining.substring(prefixMatch[0].length);
        }
        const leadingSpaces = remaining.match(/^\s*/);
        if (leadingSpaces) {
            offset += leadingSpaces[0].length;
            remaining = remaining.substring(leadingSpaces[0].length);
        }
        const bareName = remaining.replace(/\s+$/, '');
        if (!bareName || !/^\w+$/.test(bareName)) continue;

        const nameStart = valueStart + offset;
        const nameEnd = nameStart + bareName.length;

        if (charIndex >= nameStart && charIndex <= nameEnd) {
            return {
                kind: 'dataProp',
                name: bareName,
                range: new vscode.Range(lineNum, nameStart, lineNum, nameEnd),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

/**
 * 链式调用 `this.router.push(...)`：
 * 第一段是属性访问（getter/类字段），第二段才是方法。
 * 之前把第一段标成 `chainedMethod` 会去「方法表」里找 router，永远找不到；
 * 这里直接按属性处理，跳转/悬停都走 getter 分支。
 */
function extractChainedMethodAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bthis\.(\w+)\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const firstStart = match.index + 'this.'.length;
        const firstEnd = firstStart + match[1].length;
        const secondStart = firstEnd + 1;
        const secondEnd = secondStart + match[2].length;

        if (charIndex >= firstStart && charIndex <= firstEnd) {
            return {
                kind: 'getter',
                name: match[1],
                range: new vscode.Range(lineNum, firstStart, lineNum, firstEnd),
                fullExpression: match[0],
            };
        }

        if (charIndex >= secondStart && charIndex <= secondEnd) {
            return {
                kind: 'method',
                name: match[2],
                range: new vscode.Range(lineNum, secondStart, lineNum, secondEnd),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

/* ============================================================
 * 定义跳转
 * ============================================================ */

export function findDefinitionInTsFile(
    tsPath: string,
    ref: TemplateReference,
    htmlPath?: string,
): vscode.Location | null {
    if (!fs.existsSync(tsPath)) return null;

    const localResult = findDefinitionLocally(tsPath, ref, htmlPath);
    if (localResult) return localResult;

    if (ref.kind === 'method' || ref.kind === 'getter') {
        for (const ancestorPath of findAncestorFiles(tsPath, htmlPath)) {
            const result = findDefinitionLocally(ancestorPath, ref, htmlPath);
            if (result) return result;
        }
    }

    // 框架成员（emit / refresh / setAttribute …）跳到声明处
    if (ref.kind === 'method' && FRAMEWORK_METHODS.has(ref.name)) {
        const baseElementPath = findParentClassFile(tsPath, undefined)?.path ?? findBaseElementDeclaration(tsPath);
        if (baseElementPath) {
            const result = findMethodInTsFile(baseElementPath, ref.name);
            if (result) return result;
        }
    }

    // 链式调用：this.router.push() → 先找 router 的类型，再在那个类里找 push。
    if (ref.kind === 'method' && ref.fullExpression) {
        const chainedMatch = ref.fullExpression.match(/\bthis\.(\w+)\.\w+\s*\(/);
        if (chainedMatch) {
            const propClassPath = findChainedPropertyClass(tsPath, chainedMatch[1], htmlPath);
            if (propClassPath) return findMethodInTsFile(propClassPath, ref.name);
        }
    }

    return null;
}

/**
 * 找 `this.<prop>.<method>()` 中 prop 的类型声明文件。
 * 属性可能声明在当前类或任意父类，因此沿继承链逐个查找（definition 与 hover 共用）。
 */
export function findChainedPropertyClass(tsPath: string, propName: string, htmlPath?: string): string | null {
    for (const ownerPath of [tsPath, ...findAncestorFiles(tsPath, htmlPath)]) {
        const propClassPath = findPropertyClassFile(ownerPath, propName, htmlPath);
        if (propClassPath) return propClassPath;
    }
    return null;
}

/**
 * 文件里所有**非相对路径**的模块说明符（只认代码区，注释 / 字符串里的不算）。
 * 返回全部而不是第一个：组件通常还导入了 lodash / clsx 这类包，
 * 只取第一个会按「谁写在前面」决定成败
 */
function findPackageImportSpecs(text: string, masked: string): string[] {
    const specs: string[] = [];
    const fromRe = /\bfrom\b/g;
    // 粘性匹配直接在原文上取引号串，省掉每个 from 都切一次尾部字符串
    const specRe = /\s*(['"])([^'".][^'"]*)\1/y;
    let match: RegExpExecArray | null;
    while ((match = fromRe.exec(masked)) !== null) {
        specRe.lastIndex = match.index + match[0].length;
        const spec = specRe.exec(text);
        if (spec && !specs.includes(spec[2])) specs.push(spec[2]);
    }
    return specs;
}

interface BaseElementLookup {
    file: string | null;
    /** 命中时的指纹：`npm install` 更新依赖、或本地构建补进声明后据此判断缓存过期 */
    stamp: string;
    /**
     * 负结果时遍历过的目录及其 mtime：构件补进**已存在**的子目录（`dist/deep/`）时，
     * 包根和入口目录都不会变，只有那个子目录会变。目录数超上限时不记录。
     */
    dirs?: Array<{ path: string; mtime: string }>;
}

/** `包目录|入口目录` → base-element 声明文件（找不到记 null，但带指纹校验） */
const baseElementDirCache = new Map<string, BaseElementLookup>();

/**
 * 负结果最多跟踪的目录数。
 *
 * 命中时要对每个被跟踪目录做一次 stat（Windows + Defender 下约 0.11~0.2ms/目录）：
 * 8 个约 3ms、16 个约 4ms；放大到 60 个会到 8.5ms，反而比「超上限退回 3 项指纹」的
 * 1.4ms 更慢 —— 上限不是越大越好。真实项目的构建产物目录通常 < 8 个。
 */
const MAX_TRACKED_DIRS = 16;

/**
 * 包目录指纹：package.json 的 mtime+size、包根目录 mtime、入口文件所在目录 mtime。
 * 后两项覆盖「只补文件不动 package.json」：构建产物通常落在包根或 `dist/`。
 */
function packageStamp(packageDir: string, entryDir: string): string {
    let jsonStamp = '';
    try {
        const stat = fs.statSync(path.join(packageDir, 'package.json'));
        jsonStamp = `${stat.mtimeMs}:${stat.size}`;
    } catch {
        /* 没有 package.json */
    }

    return `${jsonStamp}|${dirMtime(packageDir)}|${dirMtime(entryDir)}`;
}

function dirMtime(dir: string): string {
    try {
        return String(fs.statSync(dir).mtimeMs);
    } catch {
        return '';
    }
}

/**
 * 在包目录里深度优先找 `base-element.d.ts`（跳过嵌套 node_modules）。
 * 结果按包目录缓存：大包（@types/node 这类）遍历一次就要十几毫秒，
 * hover / 补全会反复走到这里。
 *
 * 负结果（没有 base-element 的包，比如 lodash）也缓存，但每次命中都用指纹
 * 做一次廉价校验：`npm install` 更新依赖、或本地构建把声明补进已遍历过的目录后
 * （node_modules 不在监听范围，不会触发清缓存）也能自动生效。
 */
function findBaseElementFile(packageDir: string, entryDir: string): string | null {
    // 键带上入口目录：同一个包被不同子路径导入时，两条指纹不同，
    // 只用 packageDir 作键会让两边互相顶掉，每次查询都退化成重新遍历
    const cacheKey = `${packageDir}|${entryDir}`;
    const stamp = packageStamp(packageDir, entryDir);
    const cached = baseElementDirCache.get(cacheKey);
    if (cached && cached.stamp === stamp && (!cached.dirs || cached.dirs.every(isUnchangedDir))) {
        return cached.file;
    }

    let found: string | null = null;
    const visited: Array<{ path: string; mtime: string }> = [];
    let overLimit = false;
    const pending = [packageDir];
    while (pending.length > 0 && found === null) {
        const current = pending.pop();
        if (!current) continue;
        if (visited.length < MAX_TRACKED_DIRS) visited.push({ path: current, mtime: dirMtime(current) });
        else overLimit = true;

        for (const item of fs.readdirSync(current, { withFileTypes: true })) {
            const itemPath = path.join(current, item.name);
            if (item.isDirectory() && item.name !== 'node_modules') {
                pending.push(itemPath);
            } else if (/^base-element\.(?:d\.ts|ts|tsx)$/.test(item.name)) {
                found = itemPath;
                break;
            }
        }
    }

    baseElementDirCache.set(cacheKey, {
        file: found,
        stamp,
        // 只在「没找到」且目录数没超上限时记录；正结果靠 stamp 就够
        dirs: found === null && !overLimit ? visited : undefined,
    });
    return found;
}

function isUnchangedDir(dir: { path: string; mtime: string }): boolean {
    return dirMtime(dir.path) === dir.mtime;
}

/**
 * 从包入口文件向上找包根目录（含 `package.json`）。
 * 以 `node_modules` 为边界：包没有 package.json 时直接放弃，绝不能一路走到盘根
 * 再对整盘做深度遍历。
 */
export function findPackageRoot(entry: string): string | null {
    let current = path.dirname(entry);
    while (path.basename(current) !== 'node_modules') {
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
    }
    return null;
}

/** Locate BaseElement directly inside the imported framework package. */
function findBaseElementDeclaration(tsPath: string): string | null {
    try {
        const source = loadSource(tsPath);
        if (!source) return null;

        for (const spec of findPackageImportSpecs(source.text, source.masked)) {
            const entry = resolvePackageImport(path.dirname(tsPath), spec);
            if (!entry) continue;

            const packageDir = findPackageRoot(entry);
            if (!packageDir) continue;

            const found = findBaseElementFile(packageDir, path.dirname(entry));
            if (found) return found;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function findDefinitionLocally(tsPath: string, ref: TemplateReference, htmlPath?: string): vscode.Location | null {
    switch (ref.kind) {
        case 'method':
            return findMethodInTsFile(tsPath, ref.name, htmlPath);
        case 'getter':
            return findGetterInTsFile(tsPath, ref.name, htmlPath);
        case 'dataProp':
            return findPropInTsFile(tsPath, ref.name, htmlPath);
        case 'dataKeyword':
            return findDataDefinitionInTsFile(tsPath, htmlPath);
        case 'ref':
            return findRefInTsFile(tsPath, ref.name);
        default:
            return null;
    }
}

/**
 * 沿继承链返回所有祖先文件路径（按由近到远）。
 * e.g. MyComponent extends MyBase extends BaseElement → [MyBase.ts, base-element.ts]
 */
export function findAncestorFiles(tsPath: string, htmlPath?: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>([tsPath]);

    let currentPath: string | null = tsPath;
    let currentClass = resolveComponentClass(tsPath, htmlPath)?.name ?? undefined;

    while (currentPath) {
        const parent = findParentClassFile(currentPath, currentClass);
        if (!parent || visited.has(parent.path)) break;
        visited.add(parent.path);
        result.push(parent.path);
        currentPath = parent.path;
        currentClass = parent.name;
    }

    return result;
}

/** 找到 `class X extends Y` 里 Y 所在的文件 */
function findParentClassFile(tsPath: string, className?: string): { path: string; name: string } | null {
    const cacheKey = `${tsPath}#${className ?? ''}`;
    const cached = parentCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const source = loadSource(tsPath);
    if (!source) return null;

    const cls = className
        ? (source.classes.find(item => item.name === className) ?? null)
        : source.classes.length === 1
          ? source.classes[0]
          : null;

    if (!cls?.extendsName) {
        parentCache.set(cacheKey, null);
        return null;
    }

    let declaration: ReturnType<typeof resolveImportDeclaration> = null;

    // `extends ns.Base`：extendsExpr 带命名空间前缀时，必须按别名精确匹配 namespace 来源。
    // 不能先走命名导入 —— 同文件里若有 `import { Base } from './other'` 会抢先命中，
    // 静默解析到错误的类。
    const namespaceAlias = cls.extendsExpr?.includes('.') ? cls.extendsExpr.split('.')[0] : null;
    if (namespaceAlias) {
        const target = findNamespaceImports(source.text, source.masked).find(item => item.alias === namespaceAlias);
        if (target) declaration = resolveImportDeclaration(path.dirname(tsPath), target.spec, cls.extendsName);
    } else {
        // 别名导入 / 默认导入要拿到目标文件里的真实声明名，才能继续往上一层查找；
        // resolveImportDeclaration 同时跟随任意 barrel 的命名 / * 再导出。
        const binding = findImportBinding(source.text, source.masked, cls.extendsName);
        if (binding) {
            declaration = resolveImportDeclaration(
                path.dirname(tsPath),
                binding.spec,
                binding.imported,
                binding.isDefault,
            );
        }
    }
    const value = declaration ? { path: declaration.path, name: declaration.name } : null;
    parentCache.set(cacheKey, value);
    return value;
}

export function findPropertyClassFile(tsPath: string, propName: string, htmlPath?: string): string | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const members = collectMembers(tsPath, htmlPath);
    const property = members.find(member => member.name === propName && member.kind === 'property');
    if (!property) return null;

    // 取属性声明所在的行，解析 `= new Foo(...)` / `: Foo = ...`
    const lineStart = source.text.lastIndexOf('\n', property.nameIndex) + 1;
    const lineEnd = source.text.indexOf('\n', property.nameIndex);
    const declaration = source.text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    const typeMatch = declaration.match(new RegExp(`\\b${escapeRegex(propName)}\\s*[:=]\\s*(?:new\\s+)?([A-Z]\\w*)`));
    if (!typeMatch) return null;

    // 与父类解析共用同一套「真实声明名」解析，支持别名导入与任意 barrel 再导出
    const binding = findImportBinding(source.text, source.masked, typeMatch[1]);
    if (!binding) return null;
    const resolvedDecl = resolveImportDeclaration(
        path.dirname(tsPath),
        binding.spec,
        binding.imported,
        binding.isDefault,
    );
    if (resolvedDecl) return resolvedDecl.path;

    // 属性类型是 interface / type 别名（非 class）时没有类声明可解析，
    // 退回模块文件，交给 findMethodInTsFile 的全文签名兜底定位方法。
    return resolveModuleFile(path.dirname(tsPath), binding.spec);
}

/* ============================================================
 * 定位（定义跳转用）
 * ============================================================ */

function offsetToPosition(text: string, offset: number): vscode.Position {
    const starts = computeLineStarts(text);
    const { line, col } = offsetToLineCol(starts, offset);
    return new vscode.Position(line, col);
}

function locate(tsPath: string, offset: number): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;
    return new vscode.Location(vscode.Uri.file(tsPath), offsetToPosition(source.text, offset));
}

function findMethodInTsFile(tsPath: string, methodName: string, htmlPath?: string): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    // 先只在「当前模板对应的类」里找：多组件文件里同名方法不会跳错类
    const cls = resolveComponentClass(tsPath, htmlPath);
    if (cls) {
        const scoped = membersOf(source, cls).find(member => member.name === methodName && member.kind !== 'property');
        if (scoped) return locate(tsPath, scoped.nameIndex);
    }

    for (const target of source.classes) {
        const hit = scanClassMembers(source.text, source.masked, target.bodyStart, target.bodyEnd).find(
            member => member.name === methodName && member.kind !== 'property',
        );
        if (hit) return locate(tsPath, hit.nameIndex);
    }

    // 没有类（或类里没有）时退回全文搜索声明位置
    const fallback = new RegExp(
        `^\\s*(?:(?:public|private|protected)\\s+)?(?:static\\s+)?(?:async\\s+)?` +
            `(?:get\\s+|set\\s+)?${escapeRegex(methodName)}\\s*[\\(=:]`,
        'm',
    );
    const match = fallback.exec(source.masked);
    return match ? locate(tsPath, match.index + match[0].indexOf(methodName)) : null;
}

function findPropInTsFile(tsPath: string, propName: string, htmlPath?: string): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const cls = resolveComponentClass(tsPath, htmlPath);

    // 1. super({ ... }) 里的键
    const superOpen = findSuperObject(source, cls);
    if (superOpen !== null) {
        const keyIndex = findKeyIndex(source.text, source.masked, superOpen, propName);
        if (keyIndex !== null) return locate(tsPath, keyIndex);
    }

    // 2. 类型声明里的属性（interface / 内联字面量 / 交叉类型 / 导入）
    for (const body of resolveDataBodies(tsPath, cls)) {
        if (!typeBodyHasKey(body, propName)) continue;
        const bodySource = loadSource(body.path);
        if (!bodySource) continue;
        const keyIndex = findKeyIndex(bodySource.text, bodySource.masked, body.open, propName);
        if (keyIndex !== null) return locate(body.path, keyIndex);
    }

    // 3. 装饰器 props 数组里的 { name: 'xxx' }
    const quoted = new RegExp(`name\\s*:\\s*(['"])${escapeRegex(propName)}\\1`);
    const quotedMatch = quoted.exec(source.text);
    if (quotedMatch) {
        return locate(tsPath, quotedMatch.index + quotedMatch[0].indexOf(quotedMatch[1]));
    }

    // 4. 代码里对 $data 的使用
    const usage = new RegExp(`this\\.\\$data\\.${escapeRegex(propName)}\\b`);
    const usageMatch = usage.exec(source.text);
    return usageMatch ? locate(tsPath, usageMatch.index + 'this.$data.'.length) : null;
}

function findGetterInTsFile(tsPath: string, propName: string, htmlPath?: string): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const members = collectMembers(tsPath, htmlPath);
    const getter = members.find(member => member.name === propName && member.kind === 'getter');
    if (getter) return locate(tsPath, getter.nameIndex);

    const property = members.find(member => member.name === propName && member.kind === 'property');
    if (property) return locate(tsPath, property.nameIndex);

    const fallback = new RegExp(`^\\s*(?:public\\s+)?(?:readonly\\s+)?${escapeRegex(propName)}\\s*[=:]`, 'm');
    const match = fallback.exec(source.masked);
    return match ? locate(tsPath, match.index + match[0].indexOf(propName)) : null;
}

function findDataDefinitionInTsFile(tsPath: string, htmlPath?: string): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const cls = resolveComponentClass(tsPath, htmlPath);

    const dataBodies = resolveDataBodies(tsPath, cls);
    if (dataBodies.length > 0) {
        const body = dataBodies[0];
        const bodySource = loadSource(body.path);
        if (bodySource) {
            if (body.kind === 'literal') return locate(body.path, body.open);
            const interfaceIndex = bodySource.masked.lastIndexOf('interface', body.open);
            if (interfaceIndex !== -1) return locate(body.path, interfaceIndex);
            return locate(body.path, body.open);
        }
    }

    if (cls) return locate(tsPath, cls.keywordIndex);

    const superOpen = findSuperObject(source, null);
    return superOpen === null ? null : locate(tsPath, superOpen);
}

function findRefInTsFile(tsPath: string, refName: string): vscode.Location | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const patterns = [`this.$refs.${refName}`, `$refs.${refName}`, `${refName}Ref`, `${refName}Refs`];
    for (const pattern of patterns) {
        const index = source.text.indexOf(pattern);
        if (index !== -1) return locate(tsPath, index);
    }

    const typeAnnotation = new RegExp(`\\b${escapeRegex(refName)}\\s*:\\s*HTML\\w+Element`);
    const typeMatch = typeAnnotation.exec(source.text);
    if (typeMatch) return locate(tsPath, typeMatch.index);

    const generic = new RegExp(`\\b${escapeRegex(refName)}\\s*:\\s*`);
    const genericMatch = generic.exec(source.text);
    return genericMatch ? locate(tsPath, genericMatch.index) : null;
}

/* ============================================================
 * 成员 / 签名
 * ============================================================ */

function formatSignature(member: MemberInfo): string {
    const params = member.params.replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
    const returnType = (member.returnType ?? 'void').replace(/\s+/g, ' ').trim();
    return `${member.name}(${params}): ${returnType}`;
}

export function getMethodSignatures(tsPath: string, htmlPath?: string): MethodSignature[] {
    const source = loadSource(tsPath);
    if (!source) return [];

    const lineStarts = computeLineStarts(source.text);
    const signatures: MethodSignature[] = [];
    const seen = new Set<string>();

    for (const member of collectMembers(tsPath, htmlPath)) {
        if (member.kind === 'property' || member.kind === 'getter' || member.kind === 'setter') continue;
        if (NON_CALLABLE.has(member.name)) continue;
        if (seen.has(member.name)) continue;
        seen.add(member.name);

        const from = offsetToLineCol(lineStarts, member.nameIndex);
        const to = offsetToLineCol(lineStarts, member.nameIndex + member.name.length);

        signatures.push({
            name: member.name,
            signature: formatSignature(member),
            range: new vscode.Range(from.line, from.col, to.line, to.col),
        });
    }

    return signatures;
}

export function getPropTypeFromTsFile(tsPath: string, propName: string, htmlPath?: string): string | null {
    const source = loadSource(tsPath);
    if (!source) return null;

    const cls = resolveComponentClass(tsPath, htmlPath);

    // 1. 类型声明里的类型注解（interface / 内联字面量 / 交叉类型 / 导入）
    for (const body of resolveDataBodies(tsPath, cls)) {
        if (!typeBodyHasKey(body, propName)) continue;
        const bodySource = loadSource(body.path);
        if (!bodySource) continue;
        const type = findKeyType(bodySource.text, bodySource.masked, body.open, propName);
        if (type) return type;
    }

    // 2. super({ prop: value as Type })
    const superOpen = findSuperObject(source, cls);
    if (superOpen !== null) {
        const asMatch = new RegExp(`\\b${escapeRegex(propName)}\\s*:\\s*[^,}\\n]*?\\bas\\s+([\\w<>\\[\\]| ]+)`).exec(
            source.text.slice(superOpen),
        );
        if (asMatch) return asMatch[1].trim();
    }

    // 3. getter 返回类型
    const members = collectMembers(tsPath, htmlPath);
    const getter = members.find(member => member.name === propName && member.kind === 'getter');
    if (getter?.returnType) return getter.returnType.replace(/\s+/g, ' ').trim();

    return null;
}

/** 获取组件所有有效成员名（方法 + getter + 数据属性），包含继承链 */
export function getComponentMembers(
    tsPath: string,
    htmlPath?: string,
): {
    methods: Set<string>;
    getters: Set<string>;
    dataProps: Set<string>;
    /** $data 键集不完整：有无法静态确定的类型，不能用于报未定义 */
    dataPropsIncomplete: boolean;
} {
    const methods = new Set<string>();
    const getters = new Set<string>();
    const dataProps = new Set<string>();
    let dataPropsIncomplete = false;

    // 组件继承 HTMLElement，这些 API 在模板里调用是合法的
    for (const name of FRAMEWORK_METHODS) methods.add(name);

    const allPaths = [tsPath, ...findAncestorFiles(tsPath, htmlPath)];

    for (const currentPath of allPaths) {
        for (const member of collectMembers(currentPath, currentPath === tsPath ? htmlPath : undefined)) {
            if (member.kind === 'getter') getters.add(member.name);
            else if (member.kind === 'setter') getters.add(member.name);
            else if (member.kind !== 'property') methods.add(member.name);
        }

        // 数据属性只在当前组件里找（父类的 $data 是另一套）
        if (currentPath === tsPath) {
            const info = extractDataPropsInfo(currentPath, htmlPath);
            for (const prop of info.props) dataProps.add(prop);
            dataPropsIncomplete = info.incomplete;
        }
    }

    return { methods, getters, dataProps, dataPropsIncomplete };
}

/* ============================================================
 * 诊断
 * ============================================================ */

/**
 * 检查 HTML 模板中的引用是否在 TS 组件中存在。
 *
 * 只在「会被编译成表达式」的区域里检查（`{{ }}` 内容与动态属性值），
 * 因此注释掉的代码、`<style>` 里的内容、正文里的 `this.xxx()` 文案都不会误报。
 */
export function validateReferences(document: vscode.TextDocument): TemplateDiagnostic[] {
    const diagnostics: TemplateDiagnostic[] = [];
    const tsPath = findCorrespondingTsFile(document.fileName);
    if (!tsPath) return diagnostics;

    const { methods, getters, dataProps, dataPropsIncomplete } = getComponentMembers(tsPath, document.fileName);
    const text = document.getText();
    const masked = maskHtmlNonContent(text);
    const lineStarts = computeLineStarts(text);
    const regions = collectExpressionRegions(masked);

    const pushDiagnostic = (message: string, start: number, length: number): void => {
        const from = offsetToLineCol(lineStarts, start);
        const to = offsetToLineCol(lineStarts, start + length);
        diagnostics.push({
            message,
            range: new vscode.Range(from.line, from.col, to.line, to.col),
            severity: vscode.DiagnosticSeverity.Error,
        });
    };

    for (const region of regions) {
        const slice = masked.slice(region.start, region.end);

        const methodCall = /\bthis\.(\w+)\s*\(/g;
        let match: RegExpExecArray | null;
        while ((match = methodCall.exec(slice)) !== null) {
            const name = match[1];
            if (name.startsWith('$')) continue;
            if (methods.has(name) || getters.has(name)) continue;
            pushDiagnostic(`方法 '${name}' 在组件及其父类中未定义`, region.start + match.index + 5, name.length);
        }

        // dataProps 为空说明 super/interface 都没解析出来；键集不完整说明存在无法静态
        // 确定的类型（泛型实参 / 索引访问等）。两种情况都跳过，以免按残缺键集误报
        if (dataProps.size === 0 || dataPropsIncomplete) continue;

        const dataProp = /\$data\.(\w+)/g;
        while ((match = dataProp.exec(slice)) !== null) {
            const name = match[1];
            if (dataProps.has(name) || getters.has(name) || methods.has(name)) continue;
            pushDiagnostic(
                `数据属性 '${name}' 在 super({}) 或 interface 中未定义`,
                region.start + match.index + 6,
                name.length,
            );
        }
    }

    return diagnostics;
}

/**
 * 模板语法校验。
 *
 * 只有能关联到 TS 组件的文件才会被当作 Solely 模板校验——普通 HTML
 * （Handlebars / Jinja / 静态演示页）不再被 `{{ }}`、`@click` 之类的规则骚扰。
 */
export function validateTemplate(document: vscode.TextDocument): TemplateDiagnostic[] {
    const diagnostics: TemplateDiagnostic[] = [];
    if (!findCorrespondingTsFile(document.fileName)) return diagnostics;

    const text = document.getText();
    const masked = maskHtmlNonContent(text);
    const lineStarts = computeLineStarts(text);

    validateControlFlowTags(masked, lineStarts, diagnostics);
    validateInterpolations(masked, lineStarts, diagnostics);
    validateAttributeSyntax(masked, lineStarts, diagnostics);

    return diagnostics;
}

function rangeAt(lineStarts: number[], start: number, length: number): vscode.Range {
    const from = offsetToLineCol(lineStarts, start);
    const to = offsetToLineCol(lineStarts, start + length);
    return new vscode.Range(from.line, from.col, to.line, to.col);
}

function validateControlFlowTags(masked: string, lineStarts: number[], diagnostics: TemplateDiagnostic[]): void {
    const tagStack: { tag: string; index: number }[] = [];
    const tagRegex = /<\/?([A-Za-z][A-Za-z0-9\-]*)/g;

    // 上一次闭合的控制流标签：Else/ElseIf 必须紧跟在它后面
    let lastClosed: { tag: string; depth: number; end: number } | null = null;

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(masked)) !== null) {
        const fullMatch = match[0];
        const tagName = match[1].toLowerCase();
        if (!SOLELY_CONTROL_TAGS.has(tagName)) continue;

        const isClosing = fullMatch.startsWith('</');
        const tagEnd = findTagEnd(masked, match.index);
        const isSelfClosing = !isClosing && tagEnd !== -1 && masked[tagEnd - 1] === '/';

        if (isClosing) {
            if (tagStack.length === 0) {
                diagnostics.push({
                    message: `意外的闭合标签 </${tagName}>，没有对应的开始标签`,
                    range: rangeAt(lineStarts, match.index, fullMatch.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
                continue;
            }

            const last = tagStack[tagStack.length - 1];
            if (tagName !== last.tag) {
                diagnostics.push({
                    message: `标签不匹配: 期望 </${last.tag}>，但找到 </${tagName}>`,
                    range: rangeAt(lineStarts, match.index, fullMatch.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
                continue;
            }

            tagStack.pop();
            lastClosed = { tag: tagName, depth: tagStack.length, end: tagEnd === -1 ? match.index : tagEnd + 1 };
            continue;
        }

        // 自闭合的 <Show test="x" /> 是合法的（框架把它当 void 元素）
        if (isSelfClosing) continue;

        if (tagName === 'elseif' || tagName === 'else') {
            const valid =
                lastClosed !== null &&
                lastClosed.depth === tagStack.length &&
                (lastClosed.tag === 'if' || lastClosed.tag === 'elseif') &&
                // 编译器只允许空白/注释出现在 </If> 与 <Else> 之间
                masked.slice(lastClosed.end, match.index).trim() === '';

            if (!valid) {
                diagnostics.push({
                    message: `<${match[1]}> 必须紧跟 <If> 或 <ElseIf> 之后`,
                    range: rangeAt(lineStarts, match.index, fullMatch.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
            }

            // 一个 Else 之后不能再接 ElseIf/Else
            lastClosed = null;
        }

        tagStack.push({ tag: tagName, index: match.index });
    }

    for (const unclosed of tagStack) {
        diagnostics.push({
            message: `未闭合的标签 <${unclosed.tag}>`,
            range: rangeAt(lineStarts, unclosed.index, unclosed.tag.length + 1),
            severity: vscode.DiagnosticSeverity.Error,
        });
    }
}

/** 从 `<` 开始找到标签结束的 `>`（考虑引号） */
function findTagEnd(text: string, from: number): number {
    let quote: string | null = null;
    for (let i = from; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '>') {
            return i;
        } else if (ch === '\n' && i - from > 2000) {
            return -1;
        }
    }
    return -1;
}

function validateInterpolations(masked: string, lineStarts: number[], diagnostics: TemplateDiagnostic[]): void {
    const matchedClosePositions = new Set<number>();

    const openRegex = /\{\{/g;
    let openMatch: RegExpExecArray | null;

    while ((openMatch = openRegex.exec(masked)) !== null) {
        const openPos = openMatch.index;
        const afterOpen = openPos + 2;

        const closeIdx = masked.indexOf('}}', afterOpen);
        if (closeIdx === -1) {
            diagnostics.push({
                message: '插值表达式未闭合，缺少 }}',
                range: rangeAt(lineStarts, openPos, Math.max(2, masked.length - openPos)),
                severity: vscode.DiagnosticSeverity.Error,
            });
            break;
        }

        matchedClosePositions.add(closeIdx);

        if (masked.substring(afterOpen, closeIdx).trim().length === 0) {
            diagnostics.push({
                message: '插值表达式内容为空',
                range: rangeAt(lineStarts, openPos, closeIdx + 2 - openPos),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }

        openRegex.lastIndex = closeIdx + 2;
    }

    const closeRegex = /\}\}/g;
    let closeMatch: RegExpExecArray | null;
    while ((closeMatch = closeRegex.exec(masked)) !== null) {
        if (matchedClosePositions.has(closeMatch.index)) continue;
        diagnostics.push({
            message: '意外的 }} ，缺少 {{',
            range: rangeAt(lineStarts, closeMatch.index, 2),
            severity: vscode.DiagnosticSeverity.Warning,
        });
    }
}

function validateAttributeSyntax(masked: string, lineStarts: number[], diagnostics: TemplateDiagnostic[]): void {
    // 要求属性名前是空白，避免把 `title="a:b=c"` 这种引号内的内容当成属性绑定
    const unquotedAt = /(?:^|\s)@(\w+(?:-\w+)*)\s*=\s*(?!"|')([^\s>]+)/g;
    let match: RegExpExecArray | null;

    while ((match = unquotedAt.exec(masked)) !== null) {
        const leading = match[0].length - match[0].trimStart().length;
        diagnostics.push({
            message: `事件绑定 @${match[1]} 的值建议使用引号包裹`,
            range: rangeAt(lineStarts, match.index + leading, match[0].length - leading),
            severity: vscode.DiagnosticSeverity.Warning,
        });
    }

    const unquotedBind = /(?:^|\s):(\w+(?:-\w+)*)\s*=\s*(?!"|')([^\s>]+)/g;
    while ((match = unquotedBind.exec(masked)) !== null) {
        const leading = match[0].length - match[0].trimStart().length;
        diagnostics.push({
            message: `属性绑定 :${match[1]} 的值建议使用引号包裹`,
            range: rangeAt(lineStarts, match.index + leading, match[0].length - leading),
            severity: vscode.DiagnosticSeverity.Warning,
        });
    }
}
