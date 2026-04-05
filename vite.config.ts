import { defineConfig } from 'vite';
import dtsPlugin from 'vite-plugin-dts';
import path from 'path';
import { fileURLToPath } from 'url';
import { solelyVitePlugin } from './src/plugins/solely-vite-plugin.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
                    sourceMap: isDev,
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
    return {
        root: process.cwd(),
        base: '',

        plugins: [
            solelyVitePlugin({
                precompile: true,
                sourceMap: isDev,
                minify: !isDev,
            }),
            // 类型声明生成 - 保持目录结构
            dtsPlugin({
                outDir: 'dist',
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
                // 类型生成前的钩子 - 用于调试
                beforeWriteFile: (filePath, content) => {
                    // 确保类型文件路径正确
                    return { filePath, content };
                },
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
            // 库构建配置
            outDir: path.resolve(__dirname, 'dist'),
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
                          properties: { regex: /^_/ },
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
                        dir: 'dist',
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
                        dir: 'dist',
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
