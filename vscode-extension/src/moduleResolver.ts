/**
 * 模块说明符 → 磁盘文件的统一解析。
 *
 * 之前「父类查找」和「$data 类型查找」各有一份近似实现，且都不支持
 * `./types.js` 这种 NodeNext / bundler 写法。这里收敛成一份：
 * 相对 / 绝对 / 包名 → 目录 index → 扩展名补全 → `.js` 映射回 `.ts`。
 */
import * as path from 'path';
import * as fs from 'fs';
import { escapeRegex } from './tsSource';
import { loadSource } from './tsLoader';

const TS_SOURCE_SUFFIX_RE = /\.tsx?$/;
const JS_SOURCE_SUFFIX_RE = /\.(?:mjs|cjs|jsx?|mts|cts)$/;
const INDEX_CANDIDATES = ['index.ts', 'index.tsx', 'index.d.ts'];

export function normalizePath(filePath: string): string {
    const normalized = path.normalize(filePath);
    // Windows 下大小写不敏感，比较前统一小写
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** 目录 / 文件探测包一层 try：无权限目录的 statSync 会抛 EPERM */
function isDirectory(target: string): boolean {
    try {
        return fs.statSync(target).isDirectory();
    } catch {
        return false;
    }
}

function isFile(target: string): boolean {
    try {
        return fs.statSync(target).isFile();
    } catch {
        return false;
    }
}

/**
 * 把模块说明符解析成磁盘上的源文件；找不到返回 null。
 *
 * - 相对 / 绝对路径：目录取 `index.ts`，缺扩展名依次补 `.ts` / `.tsx` / `.d.ts`
 * - `./x.js`：映射回 `./x.ts` / `./x.tsx`（NodeNext 下的标准写法）
 * - 包名：读 `node_modules`，走 `types` / `typings` / `main`
 */
export function resolveModuleFile(fromDir: string, importPath: string): string | null {
    const spec = importPath.split('?')[0];
    if (!spec) return null;

    if (!spec.startsWith('.') && !path.isAbsolute(spec)) {
        return resolvePackageImport(fromDir, spec);
    }

    const resolved = path.resolve(fromDir, spec);
    if (isDirectory(resolved)) {
        const index = INDEX_CANDIDATES.map(name => path.join(resolved, name)).find(isFile);
        return index ?? null;
    }

    const candidates: string[] = [];
    if (JS_SOURCE_SUFFIX_RE.test(resolved)) {
        const base = resolved.replace(JS_SOURCE_SUFFIX_RE, '');
        candidates.push(base + '.ts', base + '.tsx', base + '.d.ts');
    }
    if (!TS_SOURCE_SUFFIX_RE.test(resolved)) {
        candidates.push(resolved + '.ts', resolved + '.tsx', resolved + '.d.ts');
    }
    for (const candidate of candidates) {
        if (isFile(candidate)) return candidate;
    }

    return isFile(resolved) ? resolved : null;
}

function resolveSourceFile(basePath: string): string | null {
    if (isFile(basePath)) return basePath;
    for (const suffix of ['.ts', '.tsx', '.d.ts']) {
        if (isFile(basePath + suffix)) return basePath + suffix;
    }
    return null;
}

interface PackageEntry {
    file: string;
    packageDir: string;
    /** package.json 指纹：依赖版本 / 入口字段变化后失效 */
    stamp: string;
}

/** `fromDir|importPath` → 命中的入口文件（只缓存成功结果，未安装的包不钉死） */
const packageEntryCache = new Map<string, PackageEntry>();

/** 文件增删改名后与模板 / 类型缓存一起清空 */
export function clearModuleCache(): void {
    packageEntryCache.clear();
}

function packageJsonStamp(packageDir: string): string {
    try {
        const stat = fs.statSync(path.join(packageDir, 'package.json'));
        return `${stat.mtimeMs}:${stat.size}`;
    } catch {
        return '';
    }
}

export function resolvePackageImport(fromDir: string, importPath: string): string | null {
    const cacheKey = `${normalizePath(fromDir)}|${importPath}`;
    const cached = packageEntryCache.get(cacheKey);
    if (cached && packageJsonStamp(cached.packageDir) === cached.stamp) return cached.file;

    const resolved = resolvePackageImportFromDisk(fromDir, importPath);
    if (resolved) packageEntryCache.set(cacheKey, { ...resolved, stamp: packageJsonStamp(resolved.packageDir) });
    return resolved?.file ?? null;
}

function resolvePackageImportFromDisk(
    fromDir: string,
    importPath: string,
): { file: string; packageDir: string } | null {
    const parts = importPath.split('/');
    const packageName = importPath.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const subpath = importPath.slice(packageName.length).replace(/^\//, '');
    let dir = fromDir;
    let parent = path.dirname(dir);

    while (dir !== parent) {
        const packageDir = path.join(dir, 'node_modules', packageName);
        if (isDirectory(packageDir)) {
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
                    (isDirectory(candidate) ? resolveSourceFile(path.join(candidate, 'index')) : null);
                if (file) return { file, packageDir };
            }
        }
        dir = parent;
        parent = path.dirname(dir);
    }
    return null;
}

/**
 * 在**未掩码**原文上跑正则，但只接受落在代码区域的匹配。
 * 掩码文本与原文逐字符对齐，注释 / 字符串里的关键字早被替换成空格，
 * 因此不会把注释掉的 import / re-export 当真。
 */
export function codeMatches(text: string, masked: string, re: RegExp, keyword: string): RegExpExecArray[] {
    const matches: RegExpExecArray[] = [];
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (masked.startsWith(keyword, match.index)) matches.push(match);
        if (re.lastIndex === match.index) re.lastIndex++;
    }
    return matches;
}

/** 一条导入绑定：模块路径 + 该名字在源模块里的原名 */
export interface ImportBinding {
    spec: string;
    imported: string;
    /** 默认导入：目标类可能以 `export default class` 声明，名字与本地名不同 */
    isDefault?: boolean;
}

/**
 * 找到导入某个**本地名**的绑定，同时还原它在源模块里的**原名**。
 *
 * - `import { A as B }` + localName=B → `{ spec, imported: 'A' }`
 * - `import { A }` + localName=A → `imported` 仍为 A（保持原行为）
 * - `import A from` / `import B from` → `imported` 为本地名，但标记 `isDefault`，
 *   因为默认导出的类声明名可能与本地名不同
 * - `import { default as B }` + localName=B → 同上
 */
export function findImportBinding(text: string, masked: string, localName: string): ImportBinding | null {
    // 同时覆盖 `import { A }`、`import type { A }` 与 `import D, { A } from`；
    // 括号 / from 两侧允许零空白（`import{A}from'./x'` 也是合法写法）
    const named = new RegExp(
        `\\bimport\\s*(?:(?:type\\s*)?([A-Za-z_$][\\w$]*)\\s*,\\s*)?(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`,
        'g',
    );
    for (const match of codeMatches(text, masked, named, 'import')) {
        const defaultLocal = match[1];
        const spec = match[3];
        if (defaultLocal === localName) return { spec, imported: localName, isDefault: true };
        for (const clause of match[2].split(',')) {
            const parts = clause.trim().split(/\s+as\s+/);
            // 支持 `type A as B` / `A as B` / `A` / `type A`
            let imported = (parts[0] ?? '').trim().replace(/^type\s+/, '');
            const local = (parts.length > 1 ? parts[parts.length - 1] : imported).trim();
            if (local !== localName) continue;
            if (imported === 'default') return { spec, imported: localName, isDefault: true };
            return { spec, imported };
        }
    }

    const defaultImport = new RegExp(
        `\\bimport\\s+(?:type\\s+)?${escapeRegex(localName)}\\s*from\\s*['"]([^'"]+)['"]`,
        'g',
    );
    const defaultMatch = codeMatches(text, masked, defaultImport, 'import')[0];
    return defaultMatch ? { spec: defaultMatch[1], imported: localName, isDefault: true } : null;
}

export interface NamespaceImport {
    alias: string;
    spec: string;
}

/** `import * as ns from './x'` 的所有命名空间来源（含别名，便于按 `ns.Base` 精确匹配） */
export function findNamespaceImports(text: string, masked: string): NamespaceImport[] {
    const namespaceRe = /\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g;
    return codeMatches(text, masked, namespaceRe, 'import').map(match => ({ alias: match[1], spec: match[2] }));
}

export interface ImportDeclaration {
    path: string;
    /** 目标文件里声明的真实类名（别名再导出 / 默认导出时与本地名不同） */
    name: string;
}

/**
 * 解析 import 到「真正声明类的文件」，并返回声明处的类名。
 *
 * - 任意 barrel 文件（不限 `index.*`）都会跟随命名 / `*` 再导出；
 * - 别名再导出会把请求名换成原名，默认导出会取 `export default class Xxx` 的 Xxx。
 *
 * 继承链需要真实类名才能继续往上一层查找 —— 用本地别名查不到声明。
 */
export function resolveImportDeclaration(
    fromDir: string,
    importPath: string,
    localName: string,
    isDefault = false,
    visited: Set<string> = new Set(),
): ImportDeclaration | null {
    const resolvedPath = resolveModuleFile(fromDir, importPath);
    if (!resolvedPath) return null;

    const visitKey = normalizePath(resolvedPath);
    if (visited.has(visitKey)) return null;
    visited.add(visitKey);

    const source = loadSource(resolvedPath);
    if (!source) return null;

    const { text, masked } = source;

    // 1. 命名再导出：`export { X as localName } from './y'`
    //    默认消费时请求名是本地名（如 MyBase），barrel 里对应的是 `... as default`。
    const namedRe = new RegExp(`\\bexport\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`, 'g');
    for (const match of codeMatches(text, masked, namedRe, 'export')) {
        for (const clause of match[1].split(',')) {
            const parts = clause.trim().split(/\s+as\s+/);
            const imported = (parts[0] ?? '').trim().replace(/^type\s+/, '');
            const local = (parts.length > 1 ? parts[parts.length - 1] : imported).trim();
            if (!imported) continue;

            // 精确匹配，或默认导入时命中导出的 `default` 出口
            const hit = local === localName || (isDefault && local === 'default');
            if (!hit) continue;

            // `export { default } from`：目标按默认导出解析；
            // `export { X as default } from`：按原名 X 解析；其余按 imported 原名解析。
            const nextIsDefault = imported === 'default';
            const nextName = nextIsDefault ? localName : imported;
            const target = resolveImportDeclaration(
                path.dirname(resolvedPath),
                match[2],
                nextName,
                nextIsDefault,
                visited,
            );
            if (target) return target;
        }
    }

    // 2. `export * from './y'`（ES 语义下 * 不含 default，故不传 isDefault）
    const starRe = /\bexport\s*(?:type\s*)?\*\s*from\s*['"]([^'"]+)['"]/g;
    for (const match of codeMatches(text, masked, starRe, 'export')) {
        const target = resolveImportDeclaration(path.dirname(resolvedPath), match[1], localName, false, visited);
        if (target) return target;
    }

    // 3. 无 `from` 的本地再导出：`import { X } from './y'; export { X as Alias };`
    //    export 出口的 X 是同文件的本地绑定名，回看 import 拿到真实来源与原名；
    //    若 X 是本文件声明的类则直接返回本文件。
    //    注意：不能只用 `(?!from\b)` —— `\s*` 回溯为 0 时 lookahead 看到空格，
    //    带 from 的 re-export 也会被匹配，可能回退到无关文件。这里显式检查下一个 token。
    const localExportRe = /\bexport\s*(?:type\s*)?\{([^}]*)\}/g;
    for (const match of codeMatches(text, masked, localExportRe, 'export')) {
        // 跳过 `}` 后的空白，若紧跟 `from` 则是带来源的 re-export，分支 1 已处理
        let after = match.index + match[0].length;
        while (after < masked.length && /\s/.test(masked[after])) after++;
        if (/^from\b/.test(masked.slice(after, after + 4))) continue;

        for (const clause of match[1].split(',')) {
            const parts = clause.trim().split(/\s+as\s+/);
            const exportedLocal = (parts[0] ?? '').trim().replace(/^type\s+/, '');
            const local = (parts.length > 1 ? parts[parts.length - 1] : exportedLocal).trim();
            if (!exportedLocal) continue;

            const hit = local === localName || (isDefault && local === 'default');
            if (!hit) continue;

            const binding = findImportBinding(text, masked, exportedLocal);
            if (binding) {
                const target = resolveImportDeclaration(
                    path.dirname(resolvedPath),
                    binding.spec,
                    binding.imported,
                    binding.isDefault,
                    visited,
                );
                if (target) return target;
                continue;
            }

            // 本文件声明的类（barrel 自己声明再别名导出）
            const localClass = new RegExp(`(?:declare\\s+)?(?:export\\s+)?class\\s+${escapeRegex(exportedLocal)}\\b`);
            if (localClass.test(masked)) return { path: resolvedPath, name: exportedLocal };
        }
    }

    // 4. 文件直接声明了请求名
    const classRe = new RegExp(`(?:declare\\s+)?(?:export\\s+)?class\\s+${escapeRegex(localName)}\\b`);
    if (classRe.test(masked)) return { path: resolvedPath, name: localName };

    // 5. 默认导出：声明名可能与本地名不同
    if (isDefault) {
        // `export default class Actual {}`
        const defaultRe = /(?:declare\s+)?(?:export\s+)?default\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
        const defaultMatch = defaultRe.exec(masked);
        if (defaultMatch) return { path: resolvedPath, name: defaultMatch[1] };

        // `class Late {} ... export default Late;`（先声明后导出）
        // 分号可省略（ASI）：`export default Late` 后可能是换行或文件结尾。
        const namedExportRe = /(?:export\s+)?default\s+([A-Za-z_$][\w$]*)\s*(?:;|$|\n)/m;
        const namedExport = namedExportRe.exec(masked);
        if (namedExport) {
            const declared = namedExport[1];
            const localClass = new RegExp(`(?:declare\\s+)?(?:export\\s+)?class\\s+${escapeRegex(declared)}\\b`);
            if (localClass.test(masked)) return { path: resolvedPath, name: declared };
        }
    }

    return null;
}
