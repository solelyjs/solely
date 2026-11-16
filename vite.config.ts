import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import dtsPlugin from 'vite-plugin-dts';
import ts from 'typescript';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { solelyVitePlugin } from './src/plugins/solely-vite-plugin.ts';
import { writeBuildMeta } from './scripts/dist-freshness.mjs';
import pkg from './package.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 把主题变量 CSS 复制到 dist/components/theme/variables.css。
 *
 * 该文件是 package.json 导出的稳定路径（`solely/components/theme/variables.css`），
 * 同时被 `src/components/theme/auto-inject.ts` 以 `?inline` 内联注入。
 * 源文件放在 src 而不是 public，避免两份内容各自漂移；这里在构建结束时补齐产物。
 */
function copyThemeVariablesPlugin(outDir: string): Plugin {
    return {
        name: 'solely:copy-theme-variables',
        apply: 'build',
        closeBundle() {
            const source = path.resolve(__dirname, 'src/components/theme/variables.css');
            const target = path.join(outDir, 'components/theme/variables.css');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(source, target);
            console.log(`[solely:copy-theme-variables] 已复制 ${path.relative(__dirname, target)}`);
        },
    };
}

/**
 * F-8：构建结束时写入 dist/build-meta.json（源码内容指纹 + 版本 + git 信息）。
 * scripts/check-dist-fresh.mjs 依赖它判断产物是否落后于源码；放在 Vite 插件里而不是
 * npm postbuild，是为了让 `vite build`、watch 重建、CI 直调都能拿到指纹。
 */
function buildMetaPlugin(outDir: string): Plugin {
    return {
        name: 'solely:build-meta',
        apply: 'build',
        closeBundle() {
            const target = writeBuildMeta({ root: __dirname, outDir, version: pkg.version });
            console.log(`[solely:build-meta] 已写入 ${path.relative(__dirname, target)}`);
        },
    };
}

/**
 * B-2：`.d.ts` 的相对说明符必须带扩展名，否则 `moduleResolution: node16/nodenext`
 * 的消费端无法解析（TypeScript 在 Node ESM 语义下不会自动补全）。
 *
 * 这里在 dts 写盘前用 TypeScript AST 改写：
 *   - `./router` → `./router/index.js`（源码为 `<dir>/index.ts`）
 *   - `./button/types` → `./button/types.js`（源码为 `types.ts`）
 * 只改 import/export/import() 的模块说明符，注释与字符串内容不参与解析。
 *
 * 为什么同时兼容 `bundler`：TypeScript 在 node16、nodenext、bundler 三种
 * moduleResolution 下都会把 `.js` 说明符映射回 `.d.ts`，因此带扩展名的产物
 * 在三者下都能解析，不存在"修好 NodeNext 就打断 bundler"的问题。
 */
const SPECIFIER_WITH_EXTENSION = /\.(?:js|mjs|cjs|json|css|html)$/;

/** 把相对说明符映射到实际产物路径；无法定位时返回 null，保持原样。 */
function resolveDeclarationSpecifier(specifier: string, sourceFilePath: string): string | null {
    if (SPECIFIER_WITH_EXTENSION.test(specifier)) return specifier;

    const base = path.resolve(path.dirname(sourceFilePath), specifier);
    const candidates: Array<[string, string]> = [
        [`${base}.ts`, `${specifier}.js`],
        [`${base}.tsx`, `${specifier}.js`],
        [path.join(base, 'index.ts'), `${specifier}/index.js`],
        [path.join(base, 'index.tsx'), `${specifier}/index.js`],
        [`${base}.d.ts`, `${specifier}.js`],
        [path.join(base, 'index.d.ts'), `${specifier}/index.js`],
    ];

    for (const [candidate, rewritten] of candidates) {
        if (fs.existsSync(candidate)) return rewritten;
    }
    return null;
}

/** 改写单个类型声明文件内容；`outputFilePath` 为 dist 内的目标路径。 */
function rewriteDeclarationSpecifiers(content: string, outputFilePath: string, outDir: string): string {
    const relative = path.relative(outDir, outputFilePath).replace(/\\/g, '/');
    const sourceFilePath = path.join(__dirname, 'src', relative);

    const sourceFile = ts.createSourceFile(outputFilePath, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const edits: Array<{ start: number; end: number; text: string }> = [];
    const collect = (node: ts.Node): void => {
        const literal = getModuleSpecifier(node);
        if (literal && literal.text.startsWith('.')) {
            const rewritten = resolveDeclarationSpecifier(literal.text, sourceFilePath);
            if (rewritten) {
                edits.push({
                    start: literal.getStart(sourceFile),
                    end: literal.getEnd(),
                    text: `'${rewritten}'`,
                });
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(sourceFile);

    let result = content;
    for (const edit of edits.reverse()) {
        result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
    }
    return result;
}

/** 取出 import/export/import() 的模块说明符字面量。 */
function getModuleSpecifier(node: ts.Node): ts.StringLiteral | undefined {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        return specifier && ts.isStringLiteral(specifier) ? specifier : undefined;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        const literal = node.argument.literal;
        return ts.isStringLiteral(literal) ? literal : undefined;
    }
    if (ts.isExternalModuleReference(node) && node.expression && ts.isStringLiteral(node.expression)) {
        return node.expression;
    }
    return undefined;
}

// 定义所有入口点 - 支持按需加载
const entries = {
    // 主入口
    index: path.resolve(__dirname, 'src/index.ts'),
    // Vite 插件入口
    plugin: path.resolve(__dirname, 'src/plugin.ts'),
    // 子路径入口 - 按需加载
    'compiler/index': path.resolve(__dirname, 'src/compiler/index.ts'),
    'runtime/index': path.resolve(__dirname, 'src/runtime/index.ts'),
    'router/index': path.resolve(__dirname, 'src/router/index.ts'),
    'shared/index': path.resolve(__dirname, 'src/shared/index.ts'),
    'types/index': path.resolve(__dirname, 'src/types/index.ts'),
    // 组件库入口
    'components/index': path.resolve(__dirname, 'src/components/index.ts'),
    'components/elements/index': path.resolve(__dirname, 'src/components/elements/index.ts'),
    'components/commands/index': path.resolve(__dirname, 'src/components/commands/index.ts'),
    'components/theme/index': path.resolve(__dirname, 'src/components/theme/index.ts'),
};

// 外部依赖 - 不打包进库
const external = [
    // 构建工具依赖
    'vite',
    'magic-string',
    'esbuild',
    // Node.js 内置模块
    /^node:/,
    /^path$/,
    /^fs$/,
    /^url$/,
    /^crypto$/,
];

export default defineConfig(({ command, mode }) => {
    const isDev = mode === 'development';
    const isExamples = mode === 'examples';

    // Examples 模式：构建示例项目
    if (isExamples) {
        return {
            root: process.cwd(),
            base: '',
            plugins: [
                // 示例使用运行时编译模式（?raw 导入），不需要预编译
                solelyVitePlugin({
                    precompile: true,
                    minify: !isDev,
                }),
            ],
            resolve: {
                alias: {
                    '@': path.resolve(__dirname, './src'),
                    solely: path.resolve(__dirname, './src/index.ts'),
                },
            },
            server: {
                port: 5173,
                open: '/examples/index.html',
            },
            build: {
                outDir: path.resolve(__dirname, 'dist-examples'),
                emptyOutDir: true,
                sourcemap: isDev,
                minify: 'terser',
                rollupOptions: {
                    input: {
                        main: path.resolve(__dirname, 'examples/index.html'),
                        'security-demo': path.resolve(__dirname, 'examples/security-demo/index.html'),
                        'csp-demo': path.resolve(__dirname, 'examples/csp-demo/index.html'),
                        regression: path.resolve(__dirname, 'examples/regression/index.html'),
                    },
                    output: {
                        entryFileNames: `assets/[name]-[hash].js`,
                        chunkFileNames: `assets/[name]-[hash].js`,
                        assetFileNames: `assets/[name]-[hash].[ext]`,
                    },
                },
            },
        };
    }

    // 库构建模式
    // SOLELY_BUILD_OUT_DIR 环境变量：将构建产物重定向到临时目录，
    // 用于验证构建（避免清理/覆盖正式 dist，也不触发清理逻辑）
    const outDir = process.env.SOLELY_BUILD_OUT_DIR
        ? path.resolve(__dirname, process.env.SOLELY_BUILD_OUT_DIR)
        : path.resolve(__dirname, 'dist');

    return {
        root: process.cwd(),
        base: '',

        define: {
            __SOLELY_VERSION__: JSON.stringify(pkg.version),
        },

        plugins: [
            solelyVitePlugin({
                precompile: true,
                minify: !isDev,
            }),
            // 类型声明生成 - 保持目录结构
            dtsPlugin({
                outDir,
                entryRoot: 'src',
                include: ['src/**/*.ts'],
                exclude: ['test/**', 'tests/**', 'examples/**', '**/*.test.ts', '**/*.spec.ts'],
                // 为每个入口生成对应的 .d.ts
                insertTypesEntry: false,
                // 保持原始目录结构
                copyDtsFiles: false,
                // 静态导入处理
                staticImport: true,
                // 不清理，保留所有类型文件
                cleanVueFileName: false,
                // 编译器选项
                compilerOptions: {
                    declaration: true,
                    declarationMap: false,
                    emitDeclarationOnly: true,
                },
                // 写盘前为相对说明符补扩展名（node16/nodenext 消费端可解析）
                beforeWriteFile: (filePath, content) => ({
                    filePath,
                    content: rewriteDeclarationSpecifiers(content, filePath, outDir),
                }),
            }),
            buildMetaPlugin(outDir),
            copyThemeVariablesPlugin(outDir),
        ],

        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                solely: path.resolve(__dirname, './src/index.ts'),
            },
        },

        server: {
            port: 5173,
            open: '/examples/index.html',
        },

        build: {
            // 库构建配置
            outDir,
            emptyOutDir: true,
            sourcemap: isDev,
            minify: isDev ? false : 'terser',

            terserOptions: isDev
                ? undefined
                : {
                      compress: {
                          drop_console: false, // 保留 console，让错误信息能显示
                          drop_debugger: true,
                          passes: 2,
                      },
                      mangle: {
                          // 只混淆局部变量名，不混淆对象属性名
                          properties: false,
                      },
                      format: { comments: false },
                  },

            // 关键：使用多入口 Rollup 配置，而不是 lib 模式
            rollupOptions: {
                // 多入口配置
                input: entries,
                // 外部依赖
                external,
                // 关键：设置 preserveEntrySignatures 以支持 preserveModules
                preserveEntrySignatures: 'strict',
                // 输出配置
                output: [
                    // ESM 输出 - 现代浏览器和 Node.js
                    {
                        format: 'es',
                        dir: outDir,
                        // 关键：保持模块结构
                        preserveModules: true,
                        preserveModulesRoot: 'src',
                        // 入口文件命名
                        entryFileNames: '[name].js',
                        // Chunk 文件命名
                        chunkFileNames: 'shared/[name]-[hash].js',
                        // 导出模式
                        exports: 'named',
                        // 生成 sourcemap
                        sourcemap: isDev,
                        // 确保路径正确
                        paths: {},
                    },
                    // CJS 输出 - Node.js 兼容
                    {
                        format: 'cjs',
                        dir: outDir,
                        preserveModules: true,
                        preserveModulesRoot: 'src',
                        entryFileNames: '[name].cjs',
                        chunkFileNames: 'shared/[name]-[hash].cjs',
                        exports: 'named',
                        sourcemap: isDev,
                        // CJS 互操作
                        interop: 'esModule',
                    },
                ],
            },

            // 禁用默认的 lib 模式行为
            lib: undefined as any,

            // 块大小警告限制
            chunkSizeWarningLimit: 50,
        },

        // 优化依赖预构建（开发模式）
        optimizeDeps: {
            exclude: ['solely'],
        },
    };
});
