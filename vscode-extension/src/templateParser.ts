import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const SOLELY_CONTROL_TAGS = new Set(['if', 'elseif', 'else', 'for', 'show']);

// Cache for HTML → TS file mapping
const tsFileCache = new Map<string, string | null>();
// Cache for TS → BaseElement file mapping
const baseElementCache = new Map<string, string | null>();

export function clearTsFileCache(htmlPath?: string): void {
    if (htmlPath) {
        tsFileCache.delete(htmlPath);
    } else {
        tsFileCache.clear();
        baseElementCache.clear();
    }
}

export type ReferenceKind = 'method' | 'dataProp' | 'ref' | 'chainedMethod' | 'dataKeyword' | 'getter';

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

export function findCorrespondingTsFile(htmlPath: string): string | null {
    // Check cache first
    const cached = tsFileCache.get(htmlPath);
    if (cached !== undefined) {
        // Verify the cached file still exists
        if (cached === null || fs.existsSync(cached)) {
            return cached;
        }
        tsFileCache.delete(htmlPath);
    }

    const dir = path.dirname(htmlPath);
    const htmlBaseName = path.basename(htmlPath);

    if (!fs.existsSync(dir)) {
        tsFileCache.set(htmlPath, null);
        return null;
    }

    const entries = fs.readdirSync(dir);
    const tsFiles = entries.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    for (const tsFile of tsFiles) {
        const tsPath = path.join(dir, tsFile);
        try {
            const content = fs.readFileSync(tsPath, 'utf-8');
            if (isTemplateImport(content, htmlBaseName)) {
                tsFileCache.set(htmlPath, tsPath);
                return tsPath;
            }
        } catch {
            continue;
        }
    }

    tsFileCache.set(htmlPath, null);
    return null;
}

function isTemplateImport(tsContent: string, htmlBaseName: string): boolean {
    const escaped = escapeRegex(htmlBaseName);
    // 支持各种相对路径: ./, ../, ./templates/, 或无前缀
    const pattern = new RegExp(
        `import\\s+(?:\\{[^}]*\\}|\\w+|\\w+\\s*,\\s*\\{[^}]*\\})\\s+from\\s+['"]` +
        `(?:[^'"]*\\/)?${escaped}\\?(solely|raw)['"]`,
    );
    return pattern.test(tsContent);
}

/** 从 TS 文件查找其导入的对应 HTML 模板文件 */
export function findCorrespondingHtmlFile(tsPath: string): string | null {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const match = content.match(
            /import\s+(?:\{[^}]*\}|\w+|\w+\s*,\s*\{[^}]*\})\s+from\s+['"]([^'"]+\.html)\?(solely|raw)['"]/,
        );
        if (match) {
            const dir = path.dirname(tsPath);
            const htmlPath = path.resolve(dir, match[1]);
            if (fs.existsSync(htmlPath)) {
                return htmlPath;
            }
        }
    } catch {
        // ignore
    }
    return null;
}

/** 从 TS 文件提取 $data 的数据属性名(从 super({}) 和 interface 解析) */
export function extractDataPropsFromTs(tsPath: string): string[] {
    const fromSuper = extractDataPropsFromSuper(tsPath);
    const fromInterface = extractDataPropsFromInterface(tsPath);
    return Array.from(new Set([...fromSuper, ...fromInterface]));
}

function extractDataPropsFromSuper(tsPath: string): string[] {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const superMatch = content.match(/super\s*\(\s*\{/);
        if (!superMatch) return [];

        const startIdx = (superMatch.index ?? 0) + superMatch[0].length;
        // 找到匹配的 }
        let depth = 1;
        let endIdx = startIdx;
        for (let i = startIdx; i < content.length && depth > 0; i++) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') depth--;
            endIdx = i;
        }

        const body = content.substring(startIdx, endIdx);
        // 提取顶层属性: 仅在 currentDepth === 0 时识别 key。
        // 必须跳过字符串字面量(含模板字符串)和注释, 否则会把值里的 "word:" (如 'a: b') 误当成属性。
        const props: string[] = [];
        let currentDepth = 0;
        let inString = false;
        let stringQuote = '';
        let inLineComment = false;
        let inBlockComment = false;

        for (let i = 0; i < body.length; i++) {
            const ch = body[i];

            // 行注释
            if (inLineComment) {
                if (ch === '\n') inLineComment = false;
                continue;
            }
            // 块注释
            if (inBlockComment) {
                if (ch === '*' && i + 1 < body.length && body[i + 1] === '/') {
                    inBlockComment = false;
                    i++; // 跳过 '/'
                }
                continue;
            }
            if (ch === '/' && i + 1 < body.length) {
                if (body[i + 1] === '/') {
                    inLineComment = true;
                    i++; // 跳过第二个 '/'
                    continue;
                }
                if (body[i + 1] === '*') {
                    inBlockComment = true;
                    i++; // 跳过 '*'
                    continue;
                }
            }

            // 字符串/模板字符串
            if (inString) {
                if (ch === '\\' && i + 1 < body.length) {
                    i++; // 跳过转义后的字符
                    continue;
                }
                if (ch === stringQuote) {
                    inString = false;
                }
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inString = true;
                stringQuote = ch;
                continue;
            }

            // 括号深度
            if (ch === '{') {
                currentDepth++;
                continue;
            }
            if (ch === '}') {
                currentDepth--;
                continue;
            }

            // 在顶层提取属性名
            if (currentDepth === 0) {
                const m = body.substring(i).match(/^(\w+)\s*(?=:)/);
                if (m && !props.includes(m[1])) {
                    props.push(m[1]);
                    i += m[1].length - 1;
                }
            }
        }
        return props;
    } catch {
        return [];
    }
}

function extractDataPropsFromInterface(tsPath: string): string[] {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        // 查找 extends BaseElement<XXX>
        const match = content.match(/extends\s+BaseElement\s*<\s*(\w+)\s*>/);
        if (!match) return [];

        const interfaceName = match[1];
        // 查找 interface XXX {
        const interfaceRegex = new RegExp(`interface\\s+${escapeRegex(interfaceName)}\\s*\\{([\\s\\S]*?)\\}`);
        const interfaceMatch = content.match(interfaceRegex);
        if (!interfaceMatch) return [];

        const body = interfaceMatch[1];
        const props: string[] = [];
        const propRegex = /^\s*(\w+)\s*[\?\:]/gm;
        let m: RegExpExecArray | null;
        while ((m = propRegex.exec(body)) !== null) {
            if (!props.includes(m[1])) {
                props.push(m[1]);
            }
        }
        return props;
    } catch {
        return [];
    }
}

export function extractReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
): TemplateReference | null {
    const line = document.lineAt(position.line).text;
    const charIndex = position.character;

    // Try all patterns on the current line (works for both {{ }} interpolation and attribute values)
    const refAttr = extractRefAtPosition(line, position.line, charIndex);
    if (refAttr) return refAttr;

    // s-model bare prop (e.g. s-model="step" → $data.step)
    const sModelProp = extractSModelPropAtPosition(line, position.line, charIndex);
    if (sModelProp) return sModelProp;

    // Framework APIs such as BaseElement.emit() are method references too.
    // Handle the explicit this.method() form before the generic property
    // matcher so go-to-definition is deterministic for inherited methods.
    const method = extractMethodCallAtPosition(line, position.line, charIndex);
    if (method) return method;

    // this.xxx without () — getter or class property (e.g. this.filteredTodos)
    const thisProp = extractThisPropAtPosition(line, position.line, charIndex);
    if (thisProp) return thisProp;

    const dataProp = extractDataPropAtPosition(line, position.line, charIndex);
    if (dataProp) return dataProp;

    const dataKw = extractDataKeywordAtPosition(line, position.line, charIndex);
    if (dataKw) return dataKw;

    const chained = extractChainedMethodAtPosition(line, position.line, charIndex);
    if (chained) return chained;

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
    // Match this.xxx that is NOT a method call (not followed by ()
    // Use \b word boundary after \w+ to prevent backtracking into the word
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
    const regex = /\bref\s*=\s*(["'])(\w+)\1/g;
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
    // Match s-model="..." or s-model='...' and extract bare property names (without $data. or this. prefix)
    const regex = /\bs-model\s*=\s*(["'])([^"']*)\1/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const quote = match[1];
        const valueStart = match.index + match[0].indexOf(quote) + 1;
        const value = match[2];

        // Calculate the offset of the bare name within the value.
        // Strip leading prefix ($data. / this.) and leading whitespace only;
        // trailing whitespace must NOT affect the offset (fixes position bug).
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
        // bareName: trailing whitespace stripped for validation only
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
                kind: 'chainedMethod',
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

export function findDefinitionInTsFile(tsPath: string, ref: TemplateReference): vscode.Location | null {
    if (!fs.existsSync(tsPath)) {
        return null;
    }

    // First try to find in the component's own TS file
    const localResult = findDefinitionLocally(tsPath, ref);
    if (localResult) return localResult;

    // Fallback: walk up the inheritance chain (extends A → A extends B → ...)
    if (ref.kind === 'method' || ref.kind === 'chainedMethod' || ref.kind === 'getter') {
        const ancestorPaths = findAncestorFiles(tsPath);
        for (const ancestorPath of ancestorPaths) {
            const result = findDefinitionLocally(ancestorPath, ref);
            if (result) return result;
        }
    }

    // Framework members may be accepted by the BaseElement fallback in
    // getComponentMembers even when the inheritance file cannot be walked by
    // the normal definition search. Resolve the immediate parent directly so
    // inherited APIs such as `this.emit()` still support go-to-definition.
    if ((ref.kind === 'method' || ref.kind === 'chainedMethod') && ref.name === 'emit') {
        const componentSource = fs.readFileSync(tsPath, 'utf-8');
        if (/\bclass\s+\w+\s+extends\s+BaseElement\b/.test(componentSource)) {
            const baseElementPath = findParentClassFile(tsPath) ?? findBaseElementDeclaration(tsPath);
            if (baseElementPath) {
                const result = findMethodInTsFile(baseElementPath, ref.name);
                if (result) return result;
            }
        }
    }

    // Fallback for chained method: try to find the method in the class of the first-level property
    // e.g. this.router.push() → find 'router' property type → search 'push' in that class
    if (ref.kind === 'method' && ref.fullExpression) {
        const chainedMatch = ref.fullExpression.match(/\bthis\.(\w+)\.\w+\s*\(/);
        if (chainedMatch) {
            const propClassPath = findPropertyClassFile(tsPath, chainedMatch[1]);
            if (propClassPath) {
                return findMethodInTsFile(propClassPath, ref.name);
            }
        }
    }

    return null;
}

/** Locate BaseElement directly inside the imported framework package. */
function findBaseElementDeclaration(tsPath: string): string | null {
    try {
        const componentSource = fs.readFileSync(tsPath, 'utf-8');
        const importMatch = componentSource.match(/from\s+['"]([^'".][^'"]*)['"]/);
        if (!importMatch || importMatch[1].startsWith('@')) return null;
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

function findDefinitionLocally(tsPath: string, ref: TemplateReference): vscode.Location | null {
    switch (ref.kind) {
        case 'method':
        case 'chainedMethod':
            return findMethodInTsFile(tsPath, ref.name);
        case 'getter':
            return findGetterInTsFile(tsPath, ref.name);
        case 'dataProp':
            return findPropInTsFile(tsPath, ref.name);
        case 'dataKeyword':
            return findDataDefinitionInTsFile(tsPath);
        case 'ref':
            return findRefInTsFile(tsPath, ref.name);
        default:
            return null;
    }
}

/**
 * Walk up the inheritance chain and return all ancestor class file paths in order.
 * e.g. MyComponent extends MyBaseComponent extends BaseElement → [MyBaseComponent.ts, base-element.ts]
 */
export function findAncestorFiles(tsPath: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    visited.add(tsPath);

    let currentPath = tsPath;
    while (currentPath) {
        const parentPath = findParentClassFile(currentPath);
        if (!parentPath || visited.has(parentPath)) break;
        visited.add(parentPath);
        result.push(parentPath);
        currentPath = parentPath;
    }

    return result;
}

/**
 * Find the file path of the parent class that the class in tsPath extends.
 * e.g. class MyComponent extends BaseElement → find BaseElement's source file
 */
function findParentClassFile(tsPath: string): string | null {
    const cached = baseElementCache.get(tsPath);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const dir = path.dirname(tsPath);

        // Find the extends clause: class Foo extends Bar
        const extendsMatch = content.match(/\bclass\s+\w+\s+extends\s+(\w+)/);
        if (!extendsMatch) {
            baseElementCache.set(tsPath, null);
            return null;
        }

        const parentClassName = extendsMatch[1];

        // Find import of the parent class
        const importPattern = new RegExp(
            `import\\s+\\{[^}]*\\b${escapeRegex(parentClassName)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
        );
        const importMatch = content.match(importPattern);
        if (!importMatch) {
            baseElementCache.set(tsPath, null);
            return null;
        }

        const importPath = importMatch[1];
        const resolvedPath = resolveImportPath(dir, importPath, parentClassName);
        baseElementCache.set(tsPath, resolvedPath);
        return resolvedPath;
    } catch {
        baseElementCache.set(tsPath, null);
        return null;
    }
}

/**
 * Resolve an import path to an actual .ts file, following re-exports.
 */
function resolveImportPath(fromDir: string, importPath: string, className: string): string | null {
    // Relative imports are resolved from the component directory. Bare module
    // imports (for example `import { BaseElement } from 'solely'`) must be
    // resolved like TypeScript/Node: walk up through node_modules and prefer
    // the package's declaration entry because the runtime file may not contain
    // any class/method source that can be inspected.
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

    // If it points to a directory, try any supported declaration/source index.
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        const indexPath = ['index.ts', 'index.tsx', 'index.d.ts']
            .map(name => path.join(resolvedPath, name))
            .find(candidate => fs.existsSync(candidate));
        if (!indexPath) return null;
        resolvedPath = indexPath;
    }

    // Add .ts extension if missing
    if (!/\.(?:ts|tsx|d\.ts)$/.test(resolvedPath)) {
        const candidates = [resolvedPath + '.ts', resolvedPath + '.tsx', resolvedPath + '.d.ts'];
        const candidate = candidates.find(p => fs.existsSync(p));
        if (!candidate) return null;
        resolvedPath = candidate;
    }

    if (!fs.existsSync(resolvedPath)) return null;

    // If the resolved path is an index.ts, try to find the actual class file via re-export
    if (/index\.(?:ts|tsx|d\.ts)$/.test(resolvedPath)) {
        const indexDir = path.dirname(resolvedPath);

        // Try kebab-case naming: BaseElement → base-element.ts
        const kebabName = className
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');
        const directPath = resolveSourceFile(path.join(indexDir, kebabName));
        if (directPath) return directPath;

        // Try reading the index to find the re-export
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

            // A declaration barrel may declare the class directly rather than
            // re-exporting it. Do not return an unrelated barrel just because
            // it exists; callers need the barrel that actually contains the
            // requested class/member.
            const declarationPattern = new RegExp(`(?:declare\\s+)?class\\s+${escapeRegex(className)}\\b`);
            if (declarationPattern.test(indexContent)) return resolvedPath;

            // Package declaration barrels commonly use `export * from './runtime'`.
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

    // Never treat an arbitrary module (for example compiler/ir/buildIR.d.ts)
    // as the requested parent. Only return a source file when it declares the
    // requested class; otherwise let an enclosing export-* traversal continue.
    const sourceContent = fs.readFileSync(resolvedPath, 'utf-8');
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

export function findPropertyClassFile(tsPath: string, propName: string): string | null {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const lines = content.split('\n');
        const dir = path.dirname(tsPath);
        const escaped = escapeRegex(propName);

        // Find property declaration: private router = createRouter(...) or router: Router = ...
        const propPattern = new RegExp(
            `^\\s*(?:(?:public|private|protected)\\s+)?(?:readonly\\s+)?${escaped}\\s*[=:]\\s*(?:new\\s+)?(\\w+)`,
        );
        for (const line of lines) {
            const match = propPattern.exec(line);
            if (match) {
                const className = match[1];
                // Find import of this class/function
                const importPattern = new RegExp(
                    `import\\s+\\{[^}]*\\b${escapeRegex(className)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
                );
                const importMatch = content.match(importPattern);
                if (importMatch) {
                    const importPath = importMatch[1];
                    let resolvedPath = path.resolve(dir, importPath);
                    if (!resolvedPath.endsWith('.ts') && !resolvedPath.endsWith('.tsx')) {
                        if (fs.existsSync(resolvedPath + '.ts')) resolvedPath += '.ts';
                        else if (fs.existsSync(resolvedPath + '.tsx')) resolvedPath += '.tsx';
                    }

                    // If it's an index file, try to find the actual class file
                    if (resolvedPath.endsWith('index.ts') || resolvedPath.endsWith('index.tsx')) {
                        const indexDir = path.dirname(resolvedPath);
                        // Try common naming patterns: class-name.ts
                        const kebabName = className
                            .replace(/([A-Z])/g, '-$1')
                            .toLowerCase()
                            .replace(/^-/, '');
                        const directPath = path.join(indexDir, kebabName + '.ts');
                        if (fs.existsSync(directPath)) return directPath;

                        // Try reading the index to find the re-export
                        try {
                            const indexContent = fs.readFileSync(resolvedPath, 'utf-8');
                            const reExportMatch = indexContent.match(
                                new RegExp(
                                    `export\\s+\\{[^}]*\\b${escapeRegex(className)}\\b` +
                                    `[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
                                ),
                            );
                            if (reExportMatch) {
                                const classPath = path.resolve(indexDir, reExportMatch[1]);
                                const finalPath = classPath.endsWith('.ts') ? classPath : classPath + '.ts';
                                if (fs.existsSync(finalPath)) return finalPath;
                            }
                        } catch {
                            /* ignore */
                        }
                    }

                    if (fs.existsSync(resolvedPath)) return resolvedPath;
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

function findMethodInTsFile(tsPath: string, methodName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    const escaped = escapeRegex(methodName);
    // Combined pattern: optional modifiers, then method name, then ( or = or :
    const pattern = new RegExp(
        `^\\s*(?:(?:public|private|protected)\\s+)?(?:static\\s+)?` +
        `(?:async\\s+)?(?:get\\s+|set\\s+)?${escaped}\\s*[\\(=:]`,
    );

    for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
            const methodIdx = lines[i].indexOf(methodName);
            const pos = new vscode.Position(i, methodIdx >= 0 ? methodIdx : 0);
            return new vscode.Location(vscode.Uri.file(tsPath), pos);
        }
    }

    return null;
}

function findPropInTsFile(tsPath: string, propName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const escaped = escapeRegex(propName);

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`name: '${propName}'`) || lines[i].includes(`name: "${propName}"`)) {
            const idx = lines[i].indexOf(`'${propName}'`);
            const finalIdx = idx >= 0 ? idx : lines[i].indexOf(`"${propName}"`);
            const pos = new vscode.Position(i, finalIdx >= 0 ? finalIdx + 1 : 0);
            return new vscode.Location(vscode.Uri.file(tsPath), pos);
        }
    }

    const interfacePropPattern = new RegExp(`\\b${escaped}\\s*[:?]\\s*`);
    for (let i = 0; i < lines.length; i++) {
        if (interfacePropPattern.test(lines[i]) && !lines[i].includes('(') && !lines[i].includes('function')) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`this.$data.${propName}`)) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    return null;
}

function findGetterInTsFile(tsPath: string, propName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const escaped = escapeRegex(propName);

    // Match: get propName() or get propName ():
    const getterPattern = new RegExp(`^\\s*(?:public\\s+)?get\\s+${escaped}\\s*\\(`);
    for (let i = 0; i < lines.length; i++) {
        if (getterPattern.test(lines[i])) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx >= 0 ? idx : 0));
        }
    }

    // Fallback: class property (not in super({}) or interface)
    const propPattern = new RegExp(`^\\s*(?:public\\s+)?(?:readonly\\s+)?${escaped}\\s*[=:]`);
    for (let i = 0; i < lines.length; i++) {
        // 排除 @CustomElement 的 name: 属性, 但属性名本身就是 name 时允许匹配
        const skipNameCheck = propName === 'name' ? false : lines[i].includes('name:');
        if (propPattern.test(lines[i]) && !skipNameCheck && !lines[i].includes('super(')) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx >= 0 ? idx : 0));
        }
    }

    return null;
}

function findDataDefinitionInTsFile(tsPath: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (/\binterface\s+\w*Data\b/.test(lines[i])) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('BaseElement<') && !lines[i].includes('import')) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('super({')) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    return null;
}

function findRefInTsFile(tsPath: string, refName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    const refPatterns = [`this.$refs.${refName}`, `$refs.${refName}`, `${refName}Ref`, `${refName}Refs`];

    for (let i = 0; i < lines.length; i++) {
        for (const pattern of refPatterns) {
            if (lines[i].includes(pattern)) {
                const idx = lines[i].indexOf(pattern);
                return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
            }
        }
    }

    const escaped = escapeRegex(refName);
    const typeAnnotationPattern = new RegExp(`\\b${escaped}\\s*:\\s*HTML\\w+Element`);
    for (let i = 0; i < lines.length; i++) {
        if (typeAnnotationPattern.test(lines[i])) {
            const idx = lines[i].indexOf(refName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    const genericRefPattern = new RegExp(`\\b${escaped}\\s*:\\s*`);
    for (let i = 0; i < lines.length; i++) {
        if (genericRefPattern.test(lines[i]) && !lines[i].includes('(') && !lines[i].includes('function')) {
            const idx = lines[i].indexOf(refName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    return null;
}

export function getMethodSignatures(tsPath: string): MethodSignature[] {
    if (!fs.existsSync(tsPath)) {
        return [];
    }

    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const signatures: MethodSignature[] = [];

    // 允许匹配带有泛型字符（如 Promise<void>）的各种返回类型文本
    const methodPattern =
        '^\\s*(?:(?:public|private|protected)\\s+)?' +
        '(?:static\\s+)?(?:async\\s+)?' +
        '(\\w+)\\s*\\(([^)]*)\\)\\s*' +
        '(?::\\s*([^;{\\n]+?))?\\s*(?:\\{|;)';
    const methodRegex = new RegExp(methodPattern);

    for (let i = 0; i < lines.length; i++) {
        const match = methodRegex.exec(lines[i]);
        if (match) {
            const name = match[1];
            if (name === 'constructor' || name === 'if' || name === 'for' || name === 'while') continue;

            const params = match[2] || '';
            const returnType = match[3] || 'void';
            const signature = `${name}(${params}): ${returnType}`;

            signatures.push({
                name,
                signature,
                range: new vscode.Range(i, 0, i, lines[i].length),
            });
        }
    }

    return signatures;
}

export function getPropTypeFromTsFile(tsPath: string, propName: string): string | null {
    if (!fs.existsSync(tsPath)) {
        return null;
    }

    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const escaped = escapeRegex(propName);

    // Try to find type in interface: propName: Type
    const interfacePattern = new RegExp(`\\b${escaped}\\s*[?:]\\s*(\\w+(?:<[^>]+>)?(?:\\[\\])?)`);
    for (const line of lines) {
        const match = interfacePattern.exec(line);
        if (match && !line.includes('(') && !line.includes('function')) {
            return match[1];
        }
    }

    // Try to find type in super({ propName: defaultValue as Type })
    const superPattern = new RegExp(`${escaped}\\s*:\\s*[^,}]+as\\s+(\\w+)`);
    for (const line of lines) {
        const match = superPattern.exec(line);
        if (match) {
            return match[1];
        }
    }

    // Try to find return type of getter: get propName(): Type
    const getterPattern = new RegExp(
        `^\\s*(?:public\\s+)?get\\s+${escaped}\\s*\\(\\s*\\)\\s*:\\s*(\\w+(?:<[^>]+>)?(?:\\[\\])?)`,
    );
    for (const line of lines) {
        const match = getterPattern.exec(line);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/** 获取组件所有有效成员名(方法 + getter + 数据属性),包含继承链 */
export function getComponentMembers(tsPath: string): {
    methods: Set<string>;
    getters: Set<string>;
    dataProps: Set<string>;
} {
    const methods = new Set<string>();
    const getters = new Set<string>();
    const dataProps = new Set<string>();

    const allPaths = [tsPath, ...findAncestorFiles(tsPath)];

    // BaseElement is the framework's public component contract. Keep these
    // members available even when the package is linked outside the current
    // workspace or its declaration entry cannot be resolved by the extension.
    // This prevents a valid inherited API from becoming a false diagnostic.
    try {
        const componentSource = fs.readFileSync(tsPath, 'utf-8');
        if (/\bclass\s+\w+\s+extends\s+BaseElement\b/.test(componentSource)) {
            methods.add('emit');
            methods.add('emitNative');
        }
    } catch {
        /* ignore */
    }

    for (const p of allPaths) {
        // 方法
        for (const sig of getMethodSignatures(p)) {
            methods.add(sig.name);
        }
        // getter
        for (const name of getGetterNames(p)) {
            getters.add(name);
        }
        // 数据属性(只在当前组件中,不在父类)
        if (p === tsPath) {
            for (const prop of extractDataPropsFromTs(p)) {
                dataProps.add(prop);
            }
        }
    }

    return { methods, getters, dataProps };
}

/** 从 TS 文件提取所有 getter 名称 */
function getGetterNames(tsPath: string): string[] {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const names: string[] = [];
        const getterRegex = /^\s*(?:public\s+)?get\s+(\w+)\s*\(/gm;
        let match: RegExpExecArray | null;
        while ((match = getterRegex.exec(content)) !== null) {
            if (!names.includes(match[1])) {
                names.push(match[1]);
            }
        }
        return names;
    } catch {
        return [];
    }
}

/**
 * 检查 HTML 模板中的引用是否在 TS 组件中存在
 * 保守策略: 只检查 this.method() 和 $data.prop, 跳过 $ 开头的框架内置成员
 */
export function validateReferences(document: vscode.TextDocument): TemplateDiagnostic[] {
    const diagnostics: TemplateDiagnostic[] = [];
    const tsPath = findCorrespondingTsFile(document.fileName);
    if (!tsPath) return diagnostics;

    const { methods, getters, dataProps } = getComponentMembers(tsPath);
    const text = document.getText();

    // 1. 检查 this.method() 调用
    const methodCallRegex = /\bthis\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = methodCallRegex.exec(text)) !== null) {
        const name = match[1];
        // 跳过 $ 开头的框架内置成员($emit, $nextTick 等)
        if (name.startsWith('$')) continue;
        // 检查是否存在(方法或 getter)
        if (!methods.has(name) && !getters.has(name)) {
            const offset = match.index + 5; // 'this.' 的长度
            const startPos = document.positionAt(offset);
            const endPos = document.positionAt(offset + name.length);
            diagnostics.push({
                range: new vscode.Range(startPos, endPos),
                message: `方法 '${name}' 在组件及其父类中未定义`,
                severity: vscode.DiagnosticSeverity.Error,
            });
        }
    }

    // 2. 检查 $data.prop 数据属性
    // 如果 dataProps 为空(无法解析 super/interface), 跳过检查避免误报
    if (dataProps.size > 0) {
        const dataPropRegex = /\$data\.(\w+)/g;
        while ((match = dataPropRegex.exec(text)) !== null) {
            const name = match[1];
            // 检查是否在数据属性或 getter 中
            if (!dataProps.has(name) && !getters.has(name)) {
                const offset = match.index + 6; // '$data.' 的长度
                const startPos = document.positionAt(offset);
                const endPos = document.positionAt(offset + name.length);
                diagnostics.push({
                    range: new vscode.Range(startPos, endPos),
                    message: `数据属性 '${name}' 在 super({}) 或 interface 中未定义`,
                    severity: vscode.DiagnosticSeverity.Error,
                });
            }
        }
    }

    return diagnostics;
}

export function validateTemplate(document: vscode.TextDocument): TemplateDiagnostic[] {
    const diagnostics: TemplateDiagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    validateControlFlowTags(text, lines, diagnostics);
    validateInterpolations(lines, diagnostics);
    validateAttributeSyntax(lines, diagnostics);

    return diagnostics;
}

function validateControlFlowTags(text: string, lines: string[], diagnostics: TemplateDiagnostic[]): void {
    const tagStack: { tag: string; line: number; col: number }[] = [];
    const tagRegex = /<\/?([A-Za-z][A-Za-z0-9\-]*)/g;
    let match: RegExpExecArray | null;

    // Track the last closed control tag at each nesting depth for ElseIf/Else validation
    // Key: nesting depth (tagStack.length at close time), Value: the tag that was closed
    const lastClosedAtDepth = new Map<number, string>();

    while ((match = tagRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullMatch.startsWith('</');
        const pos = getLineCol(lines, match.index);

        if (!SOLELY_CONTROL_TAGS.has(tagName)) continue;

        if (isClosing) {
            if (tagStack.length === 0) {
                diagnostics.push({
                    message: `意外的闭合标签 </${tagName}>，没有对应的开始标签`,
                    range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + fullMatch.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
            } else {
                const last = tagStack[tagStack.length - 1];
                if (tagName === last.tag) {
                    // Record what was closed at this depth before popping
                    lastClosedAtDepth.set(tagStack.length - 1, tagName);
                    tagStack.pop();
                } else {
                    diagnostics.push({
                        message: `标签不匹配: 期望 </${last.tag}>，但找到 </${tagName}>`,
                        range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + fullMatch.length),
                        severity: vscode.DiagnosticSeverity.Error,
                    });
                }
            }
        } else {
            // Opening tags
            // Validate ElseIf/Else: must follow If or ElseIf at the same nesting level
            if (tagName === 'elseif' || tagName === 'else') {
                const currentDepth = tagStack.length;
                const lastClosed = lastClosedAtDepth.get(currentDepth);
                if (lastClosed !== 'if' && lastClosed !== 'elseif') {
                    diagnostics.push({
                        message: `<${match[1]}> 必须在 <If> 或 <ElseIf> 之后`,
                        range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + fullMatch.length),
                        severity: vscode.DiagnosticSeverity.Error,
                    });
                }
                // Clear the record so a second Else at the same depth is flagged
                lastClosedAtDepth.delete(currentDepth);
            }
            tagStack.push({ tag: tagName, line: pos.line, col: pos.col });
        }
    }

    for (const unclosed of tagStack) {
        diagnostics.push({
            message: `未闭合的标签 <${unclosed.tag}>`,
            range: new vscode.Range(unclosed.line, unclosed.col, unclosed.line, unclosed.col + unclosed.tag.length + 1),
            severity: vscode.DiagnosticSeverity.Error,
        });
    }
}

function validateInterpolations(lines: string[], diagnostics: TemplateDiagnostic[]): void {
    const text = lines.join('\n');

    // Track matched {{ and }} positions to detect stray }}
    const matchedClosePositions = new Set<number>();

    // Find all {{ ... }} pairs (including multiline) and check for issues
    const openRegex = /\{\{/g;
    let openMatch: RegExpExecArray | null;

    while ((openMatch = openRegex.exec(text)) !== null) {
        const openPos = openMatch.index;
        const afterOpen = openPos + 2;

        // Find the matching }}
        const closeIdx = text.indexOf('}}', afterOpen);
        if (closeIdx === -1) {
            const startPos = getLineCol(lines, openPos);
            const endPos = getLineCol(lines, text.length - 1);
            diagnostics.push({
                message: '插值表达式未闭合，缺少 }}',
                range: new vscode.Range(startPos.line, startPos.col, endPos.line, lines[endPos.line].length),
                severity: vscode.DiagnosticSeverity.Error,
            });
            break;
        }

        // Mark this }} as matched
        matchedClosePositions.add(closeIdx);

        // Check if the content between {{ and }} is empty
        const content = text.substring(afterOpen, closeIdx).trim();
        if (content.length === 0) {
            const startPos = getLineCol(lines, openPos);
            const endPos = getLineCol(lines, closeIdx + 2);
            diagnostics.push({
                message: '插值表达式内容为空',
                range: new vscode.Range(startPos.line, startPos.col, endPos.line, endPos.col),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }

        // Skip past this closing }}
        openRegex.lastIndex = closeIdx + 2;
    }

    // Check for stray }} without matching {{
    const closeRegex = /\}\}/g;
    let closeMatch: RegExpExecArray | null;
    while ((closeMatch = closeRegex.exec(text)) !== null) {
        if (!matchedClosePositions.has(closeMatch.index)) {
            const pos = getLineCol(lines, closeMatch.index);
            diagnostics.push({
                message: '意外的 }} ，缺少 {{',
                range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + 2),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }
    }
}

function validateAttributeSyntax(lines: string[], diagnostics: TemplateDiagnostic[]): void {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for unquoted event binding values: @click=foo (should be @click="foo")
        const unquotedAt = /@(\w+(?:-\w+)*)\s*=\s*(?!"|')([^\s>]+)/g;
        let m: RegExpExecArray | null;
        while ((m = unquotedAt.exec(line)) !== null) {
            diagnostics.push({
                message: `事件绑定 @${m[1]} 的值建议使用引号包裹`,
                range: new vscode.Range(i, m.index, i, m.index + m[0].length),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }

        // Check for unquoted property binding values: :src=foo (should be :src="foo")
        const unquotedBind = /:(\w+(?:-\w+)*)\s*=\s*(?!"|')([^\s>]+)/g;
        while ((m = unquotedBind.exec(line)) !== null) {
            diagnostics.push({
                message: `属性绑定 :${m[1]} 的值建议使用引号包裹`,
                range: new vscode.Range(i, m.index, i, m.index + m[0].length),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }
    }
}

function getLineCol(lines: string[], charIndex: number): { line: number; col: number } {
    let currentIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1;
        if (currentIndex + lineLength > charIndex) {
            return { line: i, col: charIndex - currentIndex };
        }
        currentIndex += lineLength;
    }
    return { line: lines.length - 1, col: 0 };
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
