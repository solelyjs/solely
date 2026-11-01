import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ClassInfo,
    MemberInfo,
    escapeRegex,
    findInterfaceBody,
    findKeyIndex,
    findKeyType,
    findMatchingBracket,
    listClasses,
    maskTypeScript,
    readInterfaceKeys,
    readObjectLiteralKeys,
    scanClassMembers,
} from './tsSource';
import { collectExpressionRegions, computeLineStarts, maskHtmlNonContent, offsetToLineCol } from './htmlSource';

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
 * 源码读取与缓存
 * ============================================================ */

interface SourceInfo {
    text: string;
    masked: string;
    classes: ClassInfo[];
    version: string;
}

const sourceCache = new Map<string, SourceInfo>();

function buildSource(filePath: string, text: string, version: string): SourceInfo {
    const masked = maskTypeScript(text);
    const info: SourceInfo = { text, masked, classes: listClasses(masked), version };
    sourceCache.set(filePath, info);
    return info;
}

/**
 * 读取 TS 源码。优先用编辑器里**未保存**的内容，保证刚写完的方法立刻参与诊断；
 * 用 version（文档 version / mtime+size）做缓存键，避免每次调用都重新掩码。
 */
function loadSource(filePath: string): SourceInfo | null {
    const documents: readonly vscode.TextDocument[] = vscode.workspace?.textDocuments ?? [];
    const open = documents.find(doc => doc.uri?.scheme === 'file' && doc.uri.fsPath === filePath);
    if (open) {
        const version = `doc:${open.version}`;
        const cached = sourceCache.get(filePath);
        if (cached && cached.version === version) return cached;
        return buildSource(filePath, open.getText(), version);
    }

    let stat: fs.Stats;
    try {
        stat = fs.statSync(filePath);
    } catch {
        sourceCache.delete(filePath);
        return null;
    }

    const version = `fs:${stat.mtimeMs}:${stat.size}`;
    const cached = sourceCache.get(filePath);
    if (cached && cached.version === version) return cached;

    try {
        return buildSource(filePath, fs.readFileSync(filePath, 'utf-8'), version);
    } catch {
        return null;
    }
}

function readText(filePath: string): string | null {
    return loadSource(filePath)?.text ?? null;
}

/* ============================================================
 * 模板 ↔ 组件关联
 * ============================================================ */

interface TemplateImport {
    spec: string;
    localName: string | null;
}

/** 列出文件里所有 `?solely` / `?raw` 模板导入 */
function findTemplateImports(text: string): TemplateImport[] {
    const result: TemplateImport[] = [];
    const re = /import\s+([^'"]*?)from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        const spec = match[2] ?? match[3] ?? '';
        if (!/\?(?:solely|raw)$/.test(spec)) continue;
        const clause = match[1] ?? '';
        const def = /^\s*([A-Za-z_$][\w$]*)/.exec(clause);
        result.push({ spec, localName: def ? def[1] : null });
    }

    return result;
}

function importsTemplate(text: string, tsPath: string, htmlPath: string): boolean {
    return findTemplateImports(text).some(item => resolveSpecifier(tsPath, item.spec) === normalizePath(htmlPath));
}

/** 把 import 说明符解析成绝对路径（去查询串、统一分隔符与大小写） */
function resolveSpecifier(tsPath: string, spec: string): string {
    return normalizePath(path.resolve(path.dirname(tsPath), spec.split('?')[0]));
}

function normalizePath(filePath: string): string {
    const normalized = path.normalize(filePath);
    // Windows 下大小写不敏感，比较前统一小写
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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
            const text = readText(tsPath);
            if (!text) continue;
            if (importsTemplate(text, tsPath, htmlPath)) {
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
    const text = readText(tsPath);
    if (!text) return null;

    const dir = path.dirname(tsPath);
    for (const item of findTemplateImports(text)) {
        const htmlPath = path.resolve(dir, item.spec.split('?')[0]);
        if (fs.existsSync(htmlPath)) return htmlPath;
    }
    return null;
}

/* ============================================================
 * 组件类定位
 * ============================================================ */

/** 找到某个模板导入在文件里的默认导入名 */
function findTemplateLocalName(text: string, tsPath: string, htmlPath: string): string | null {
    const target = normalizePath(htmlPath);
    for (const item of findTemplateImports(text)) {
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
        const localName = findTemplateLocalName(source.text, tsPath, htmlPath);
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
    const props = [...extractDataPropsFromSuper(tsPath, htmlPath), ...extractDataPropsFromInterface(tsPath, htmlPath)];
    return Array.from(new Set(props));
}

function extractDataPropsFromSuper(tsPath: string, htmlPath?: string): string[] {
    const source = loadSource(tsPath);
    if (!source) return [];

    const open = findSuperObject(source, resolveComponentClass(tsPath, htmlPath));
    if (open === null) return [];

    return readObjectLiteralKeys(source.masked, open);
}

/**
 * 定位组件 `$data` 类型声明的 `{`。
 *
 * 支持两种写法：
 * - `BaseElement<MyData>` → 去找 `interface MyData {`（`inline: false`）
 * - `BaseElement<{ a: number }>` → 直接用类型字面量本身（`inline: true`）
 *
 * `BaseElement<Props, Refs>` 与 `BaseElement<TreeProps & {...}>` 都只取第一个类型参数。
 */
function findDataTypeBody(source: SourceInfo, cls: ClassInfo | null): { open: number; inline: boolean } | null {
    const owner = cls ?? findFirstBaseElementClass(source);
    const typeArg = owner?.extendsTypeArg;
    if (!typeArg) return null;

    if (typeArg.startsWith('{') && owner && owner.extendsTypeArgStart >= 0) {
        const open = source.masked.indexOf('{', owner.extendsTypeArgStart);
        return open === -1 ? null : { open, inline: true };
    }

    const firstName = /^\s*([A-Za-z_$][\w$]*)/.exec(typeArg)?.[1];
    if (!firstName) return null;

    const open = findInterfaceBody(source.masked, firstName);
    return open === null ? null : { open, inline: false };
}

function extractDataPropsFromInterface(tsPath: string, htmlPath?: string): string[] {
    const source = loadSource(tsPath);
    if (!source) return [];

    const body = findDataTypeBody(source, resolveComponentClass(tsPath, htmlPath));
    return body === null ? [] : readInterfaceKeys(source.masked, body.open);
}

function findFirstBaseElementClass(source: SourceInfo): ClassInfo | null {
    return source.classes.find(cls => cls.extendsName === 'BaseElement' && cls.extendsTypeArg) ?? null;
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

    // 链式调用：this.router.push() → 先找 router 的类型，再在那个类里找 push
    if (ref.kind === 'method' && ref.fullExpression) {
        const chainedMatch = ref.fullExpression.match(/\bthis\.(\w+)\.\w+\s*\(/);
        if (chainedMatch) {
            const propClassPath = findPropertyClassFile(tsPath, chainedMatch[1], htmlPath);
            if (propClassPath) return findMethodInTsFile(propClassPath, ref.name);
        }
    }

    return null;
}

/** Locate BaseElement directly inside the imported framework package. */
function findBaseElementDeclaration(tsPath: string): string | null {
    try {
        const componentSource = readText(tsPath);
        if (!componentSource) return null;

        const importMatch = componentSource.match(/from\s+['"]([^'".][^'"]*)['"]/);
        if (!importMatch) return null;

        const entry = resolvePackageImport(path.dirname(tsPath), importMatch[1]);
        if (!entry) return null;

        let packageDir = path.dirname(entry);
        while (packageDir !== path.dirname(packageDir)) {
            if (fs.existsSync(path.join(packageDir, 'package.json'))) break;
            packageDir = path.dirname(packageDir);
        }

        const pending = [packageDir];
        while (pending.length > 0) {
            const current = pending.pop();
            if (!current) continue;
            for (const item of fs.readdirSync(current, { withFileTypes: true })) {
                const itemPath = path.join(current, item.name);
                if (item.isDirectory() && item.name !== 'node_modules') {
                    pending.push(itemPath);
                } else if (/^base-element\.(?:d\.ts|ts|tsx)$/.test(item.name)) {
                    return itemPath;
                }
            }
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

    const importPath = findImportPathForName(source.text, cls.extendsName);
    if (!importPath) {
        parentCache.set(cacheKey, null);
        return null;
    }

    const resolved = resolveImportPath(path.dirname(tsPath), importPath, cls.extendsName);
    const value = resolved ? { path: resolved, name: cls.extendsName } : null;
    parentCache.set(cacheKey, value);
    return value;
}

/** 找到导入某个类名的模块路径（支持命名导入与默认导入） */
function findImportPathForName(text: string, className: string): string | null {
    const named = new RegExp(`import\\s+\\{[^}]*\\b${escapeRegex(className)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`);
    const namedMatch = text.match(named);
    if (namedMatch) return namedMatch[1];

    const defaultImport = new RegExp(`import\\s+${escapeRegex(className)}\\s+from\\s+['"]([^'"]+)['"]`);
    const defaultMatch = text.match(defaultImport);
    return defaultMatch ? defaultMatch[1] : null;
}

/**
 * Resolve an import path to an actual .ts file, following re-exports.
 */
function resolveImportPath(fromDir: string, importPath: string, className: string): string | null {
    if (!importPath.startsWith('.') && !path.isAbsolute(importPath)) {
        const packagePath = resolvePackageImport(fromDir, importPath);
        if (packagePath) {
            const packageResult = resolveImportPath(
                path.dirname(packagePath),
                './' + path.basename(packagePath),
                className,
            );
            return packageResult ?? packagePath;
        }
        return null;
    }

    let resolvedPath = path.resolve(fromDir, importPath);

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        const indexPath = ['index.ts', 'index.tsx', 'index.d.ts']
            .map(name => path.join(resolvedPath, name))
            .find(candidate => fs.existsSync(candidate));
        if (!indexPath) return null;
        resolvedPath = indexPath;
    }

    if (!/\.(?:ts|tsx|d\.ts)$/.test(resolvedPath)) {
        const candidates = [resolvedPath + '.ts', resolvedPath + '.tsx', resolvedPath + '.d.ts'];
        const candidate = candidates.find(p => fs.existsSync(p));
        if (!candidate) return null;
        resolvedPath = candidate;
    }

    if (!fs.existsSync(resolvedPath)) return null;

    if (/index\.(?:ts|tsx|d\.ts)$/.test(resolvedPath)) {
        const indexDir = path.dirname(resolvedPath);

        const kebabName = className
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');
        const directPath = resolveSourceFile(path.join(indexDir, kebabName));
        if (directPath) return directPath;

        try {
            const indexContent = fs.readFileSync(resolvedPath, 'utf-8');
            const reExportPattern = new RegExp(
                `export\\s+\\{[^}]*\\b${escapeRegex(className)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
            );
            const reExportMatch = indexContent.match(reExportPattern);
            if (reExportMatch) {
                const classPath = path.resolve(indexDir, reExportMatch[1]);
                const finalPath = resolveSourceFile(classPath);
                if (finalPath) return finalPath;
            }

            const declarationPattern = new RegExp(`(?:declare\\s+)?class\\s+${escapeRegex(className)}\\b`);
            if (declarationPattern.test(indexContent)) return resolvedPath;

            const starExportPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
            let starExport: RegExpExecArray | null;
            while ((starExport = starExportPattern.exec(indexContent)) !== null) {
                const finalPath = resolveImportPath(indexDir, starExport[1], className);
                if (finalPath) return finalPath;
            }
        } catch {
            /* ignore */
        }
    }

    const sourceContent = readText(resolvedPath);
    if (!sourceContent) return null;
    const classPattern = new RegExp(`(?:declare\\s+)?(?:export\\s+)?class\\s+${escapeRegex(className)}\\b`);
    if (!classPattern.test(sourceContent)) return null;
    return resolvedPath;
}

function resolveSourceFile(basePath: string): string | null {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
    for (const suffix of ['.ts', '.tsx', '.d.ts']) {
        if (fs.existsSync(basePath + suffix)) return basePath + suffix;
    }
    return null;
}

function resolvePackageImport(fromDir: string, importPath: string): string | null {
    const parts = importPath.split('/');
    const packageName = importPath.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const subpath = importPath.slice(packageName.length).replace(/^\//, '');
    let dir = fromDir;
    let parent = path.dirname(dir);

    while (dir !== parent) {
        const packageDir = path.join(dir, 'node_modules', packageName);
        if (fs.existsSync(packageDir)) {
            let entry: string | undefined;
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
                entry = subpath ? undefined : typeof pkg.types === 'string' ? pkg.types : pkg.typings || pkg.main;
            } catch {
                /* package.json may be unavailable */
            }
            const candidates = subpath
                ? [path.join(packageDir, subpath)]
                : entry
                  ? [
                        path.resolve(packageDir, entry),
                        path.join(packageDir, 'index.d.ts'),
                        path.join(packageDir, 'index.ts'),
                    ]
                  : [path.join(packageDir, 'index.d.ts'), path.join(packageDir, 'index.ts')];

            for (const candidate of candidates) {
                const file =
                    resolveSourceFile(candidate) ||
                    (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
                        ? resolveSourceFile(path.join(candidate, 'index'))
                        : null);
                if (file) return file;
            }
        }
        dir = parent;
        parent = path.dirname(dir);
    }
    return null;
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

    const className = typeMatch[1];
    const dir = path.dirname(tsPath);
    const importPath = findImportPathForName(source.text, className);
    if (!importPath) return null;

    let resolvedPath = path.resolve(dir, importPath);
    if (!resolvedPath.endsWith('.ts') && !resolvedPath.endsWith('.tsx')) {
        if (fs.existsSync(resolvedPath + '.ts')) resolvedPath += '.ts';
        else if (fs.existsSync(resolvedPath + '.tsx')) resolvedPath += '.tsx';
    }

    if (resolvedPath.endsWith('index.ts') || resolvedPath.endsWith('index.tsx')) {
        const indexDir = path.dirname(resolvedPath);
        const kebabName = className
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');
        const directPath = path.join(indexDir, kebabName + '.ts');
        if (fs.existsSync(directPath)) return directPath;

        const indexContent = readText(resolvedPath);
        if (indexContent) {
            const reExportMatch = indexContent.match(
                new RegExp(`export\\s+\\{[^}]*\\b${escapeRegex(className)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`),
            );
            if (reExportMatch) {
                const classPath = path.resolve(indexDir, reExportMatch[1]);
                const finalPath = classPath.endsWith('.ts') ? classPath : classPath + '.ts';
                if (fs.existsSync(finalPath)) return finalPath;
            }
        }
    }

    return fs.existsSync(resolvedPath) ? resolvedPath : null;
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
        const keyIndex = findKeyIndex(source.masked, superOpen, propName);
        if (keyIndex !== null) return locate(tsPath, keyIndex);
    }

    // 2. 类型声明里的属性（interface 或内联字面量）
    const dataBody = findDataTypeBody(source, cls);
    if (dataBody !== null) {
        const keyIndex = findKeyIndex(source.masked, dataBody.open, propName);
        if (keyIndex !== null) return locate(tsPath, keyIndex);
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

    const dataBody = findDataTypeBody(source, cls);
    if (dataBody !== null) {
        if (dataBody.inline) return locate(tsPath, dataBody.open);
        const interfaceIndex = source.masked.lastIndexOf('interface', dataBody.open);
        if (interfaceIndex !== -1) return locate(tsPath, interfaceIndex);
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

    // 1. 类型声明里的类型注解（interface 或内联字面量）
    const dataBody = findDataTypeBody(source, cls);
    if (dataBody !== null) {
        const type = findKeyType(source.text, source.masked, dataBody.open, propName);
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
} {
    const methods = new Set<string>();
    const getters = new Set<string>();
    const dataProps = new Set<string>();

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
            for (const prop of extractDataPropsFromTs(currentPath, htmlPath)) dataProps.add(prop);
        }
    }

    return { methods, getters, dataProps };
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

    const { methods, getters, dataProps } = getComponentMembers(tsPath, document.fileName);
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

        // dataProps 为空说明 super/interface 都没解析出来，跳过以免误报
        if (dataProps.size === 0) continue;

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
