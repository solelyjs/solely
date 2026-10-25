import type { Plugin } from 'vite';
import { IRRoot, IRNode, IRAttr } from '../types';
import { parseHtml, buildIR } from '../compiler';
import MagicString from 'magic-string';

export interface SolelyVitePluginOptions {
    /** 是否启用模板预编译，默认 true */
    precompile?: boolean;
    /**
     * @deprecated 当前版本不会生成有效映射（IR 序列化会清空原文再追加代码），
     * 开启后仅会打印一次告警并返回 `map: null`。保留该选项只为兼容旧配置。
     */
    sourceMap?: boolean;
    /** 是否压缩生成的代码，默认 false */
    minify?: boolean;
    /** 自定义文件匹配模式 */
    include?: string | RegExp | Array<string | RegExp>;
    /** 排除的文件模式 */
    exclude?: string | RegExp | Array<string | RegExp>;
    /** 调试模式 */
    debug?: boolean;
    /**
     * 是否在产物中保留模板源码（`ir.m.src`，仅用于运行时错误提示定位）
     * - 默认：开发模式 `true`，构建模式 `false`
     * - 构建模式保留会让每个模板在产物里多一份原始 HTML，增大体积并外泄模板注释
     */
    includeTemplateSource?: boolean;
}

/**
 * 默认配置
 */
const defaultOptions = {
    precompile: true,
    // 尚未实现有效映射，默认关闭（详见 SolelyVitePluginOptions.sourceMap）
    sourceMap: false,
    minify: false,
    include: [/\.html(?:\?|$)/], // 匹配 .html 或 .html?xxx
    exclude: /node_modules/,
    debug: false,
} satisfies Omit<Required<SolelyVitePluginOptions>, 'includeTemplateSource'>;

/**
 * 编译 HTML 模板为 IR（中间表示）
 * * @param html HTML 模板字符串
 * @param filename 文件名（用于错误报告）
 * @returns IR 根节点
 */
export function compileTemplate(html: string, filename: string = 'anonymous'): IRRoot {
    // 1. 解析 HTML 为 AST
    const ast = parseHtml(html);

    // 2. 构建 IR
    const irRoot = buildIR(ast, { filename, source: html });

    return irRoot;
}

/**
 * 检查文件路径是否匹配给定的模式
 */
function matchesPattern(id: string, patterns: string | RegExp | Array<string | RegExp>): boolean {
    const patternList = Array.isArray(patterns) ? patterns : [patterns];
    return patternList.some(pattern => {
        if (typeof pattern === 'string') {
            return id.includes(pattern);
        }
        return pattern.test(id);
    });
}

/**
 * 序列化 IR 为可执行的 JavaScript 代码
 *
 * 说明：当前不生成 SourceMap（原实现先清空原文再追加代码，产出的是空映射），
 * 因此这里只负责生成代码，避免每次构建做无用的映射计算。
 */
function serializeIR(
    irRoot: IRRoot,
    originalCode: string,
    minify: boolean,
    includeSource: boolean,
    debug: boolean,
): string {
    // 使用原始 HTML 初始化 MagicString
    const s = new MagicString(originalCode);

    // 清除原始 HTML 内容（因为我们要替换为 JS 代码，但保留了映射基准）
    s.remove(0, originalCode.length);

    // 仅在调试模式添加 Banner 注释（含时间戳，会破坏构建确定性）
    if (debug && !minify) {
        s.append(`\n// ============================================\n`);
        s.append(`// Solely Precompiled Template\n`);
        s.append(`// ============================================\n\n`);
    }

    s.append(`const __SOLELY_IR__ = {\n`);
    s.append(`  t: 'root',\n`);
    s.append(`  v: '${irRoot.v}',\n\n`);

    // --- 1. 处理 functions ---
    if (!minify) s.append(`  // 编译后的函数数组\n`);
    s.append(`  fns: [\n`);
    irRoot.fns.forEach((fn, index) => {
        const fnString = typeof fn === 'string' ? fn : fn.toString();
        const isLast = index === irRoot.fns.length - 1;

        if (!minify) s.append(`    // Function ${index + 1}\n`);
        s.append(`    ${fnString}${isLast ? '' : ','}\n`);
    });
    s.append(`  ],\n\n`);

    // --- 2. 处理 nodes ---
    const serializeNode = (node: IRNode): IRNode => {
        const serialized: IRNode = {
            t: node.t,
            d: node.d,
        };

        if (node.s !== undefined) serialized.s = node.s;
        if (node.g !== undefined) serialized.g = node.g;
        if (node.x !== undefined) serialized.x = node.x;
        if (node.f !== undefined) serialized.f = node.f;
        if (node.i !== undefined) serialized.i = node.i;
        if (node.n !== undefined) serialized.n = node.n;

        // 核心修改：minify 时移除 __meta 信息
        if (!minify && node.__m) {
            serialized.__m = { ...node.__m };
        }

        if (node.a) {
            serialized.a = node.a.map((attr: IRAttr) => ({
                k: attr.k,
                v: attr.v,
                f: attr.f,
                d: attr.d,
                r: attr.r,
                ...(!minify && attr.__m && { __m: { ...attr.__m } }),
            }));
        }

        if (node.c) {
            serialized.c = node.c.map(serializeNode);
        }

        if (node.b) {
            serialized.b = node.b.map(branch => ({
                f: branch.f,
                c: branch.c.map(serializeNode),
                a: branch.a?.map((attr: IRAttr) => ({
                    k: attr.k,
                    v: attr.v,
                    f: attr.f,
                    d: attr.d,
                    r: attr.r,
                })),
                ...(branch.ka !== undefined && { ka: branch.ka }),
                ...(!minify && branch.__m && { __m: { ...branch.__m } }),
            }));
        }

        return serialized;
    };

    const serializedNodes = irRoot.n.map(serializeNode);
    if (!minify) s.append(`  // IR 节点树\n`);
    // 核心修改：根据 minify 决定 JSON 是否缩进
    s.append(`  n: ${JSON.stringify(serializedNodes, null, minify ? 0 : 2)},\n\n`);

    // --- 3. 处理 stats 和 metadata ---
    if (!minify) s.append(`  // 编译统计\n`);
    s.append(`  s: ${JSON.stringify(irRoot.s)},\n\n`);
    if (!minify) {
        s.append(`  // 元数据\n`);
        // 构建模式默认剥离模板源码，避免产物中重复携带整份 HTML
        const meta = irRoot.m ? (includeSource ? irRoot.m : { ...irRoot.m, src: undefined }) : {};
        s.append(`  m: ${JSON.stringify(meta)}\n`);
    }
    s.append(`};\n\n`);

    if (!minify) s.append(`// 导出 IR 对象\n`);
    s.append(`export default __SOLELY_IR__;\n`);
    s.append(`export { __SOLELY_IR__ };\n\n`);
    if (!minify) s.append(`// 同时导出模板字符串（向后兼容）\n`);
    s.append(`export const __SOLELY_TEMPLATE__ = '';\n`);

    return s.toString();
}

/**
 * 生成简化版的模板导出（用于非预编译模式）
 */
function generateTemplateCode(html: string): string {
    const s = new MagicString(html);

    const escapedHtml = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    s.overwrite(
        0,
        html.length,
        `
const __SOLELY_TEMPLATE__ = \`${escapedHtml}\`;

export default __SOLELY_TEMPLATE__;
export { __SOLELY_TEMPLATE__ };
`,
    );

    return s.toString();
}

/**
 * Solely Vite 插件
 */
export function solelyVitePlugin(options: SolelyVitePluginOptions = {}): Plugin {
    const opts = { ...defaultOptions, ...options };
    let isBuild = false;
    let warnedSourceMap = false;

    return {
        name: 'solely-vite-plugin',
        enforce: 'pre',

        configResolved(resolvedConfig) {
            isBuild = resolvedConfig.command === 'build';
            if (opts.debug) {
                console.info('[Solely] Plugin initialized with options:', opts, '| build:', isBuild);
            }
        },

        /**
         * 转换 HTML 文件
         */
        transform(code: string, id: string) {
            // 检查是否应该处理此文件
            if (!matchesPattern(id, opts.include) || matchesPattern(id, opts.exclude)) {
                return null;
            }

            // 只处理 .html?solely 文件
            if (!id.includes('.html?solely')) {
                return null;
            }

            // sourceMap 目前尚未生成有效映射（serializeIR 会清空原文再追加代码），
            // 显式告警而不是静默返回一个空映射
            if (opts.sourceMap && !warnedSourceMap) {
                warnedSourceMap = true;
                console.warn(
                    '[Solely] `sourceMap: true` 当前不会生成有效映射（已忽略）。' +
                        '如需调试模板，请保留 includeTemplateSource（开发模式默认开启）。',
                );
            }

            try {
                if (opts.debug) {
                    console.info(`[Solely] Processing: ${id}`);
                }

                if (opts.precompile) {
                    // 预编译：HTML -> AST -> IR
                    const irRoot = compileTemplate(code, id);

                    // 构建模式默认剥离模板源码，开发模式保留（用于错误定位）
                    const includeSource = opts.includeTemplateSource ?? !isBuild;

                    // 序列化 IR 为可执行代码
                    const generated = serializeIR(irRoot, code, !!opts.minify, includeSource, !!opts.debug);

                    if (opts.debug) {
                        console.info(`[Solely] Compiled IR for: ${id}`);
                        console.info(`[Solely] Stats:`, irRoot.s);
                    }

                    return {
                        code: generated,
                        map: null,
                    };
                } else {
                    // 非预编译模式：直接导出模板字符串
                    return {
                        code: generateTemplateCode(code),
                        map: null,
                    };
                }
            } catch (error) {
                const errorMessage = `[Solely] Error processing ${id}: ${
                    error instanceof Error ? error.message : String(error)
                }`;
                console.error(errorMessage);

                // 编译失败时回退到原始模板
                console.warn(`[Solely] Falling back to raw template for: ${id}`);
                return {
                    code: generateTemplateCode(code),
                    map: null,
                };
            }
        },

        /**
         * 处理热更新
         */
        handleHotUpdate({ file, server, modules }) {
            if (matchesPattern(file, opts.include) && !matchesPattern(file, opts.exclude)) {
                if (opts.debug) {
                    console.info(`[Solely] HMR triggered for: ${file}`);
                }

                // 通知客户端刷新
                server.ws.send({
                    type: 'full-reload',
                    path: '*',
                });

                return modules;
            }
        },
    };
}

// 默认导出
export default solelyVitePlugin;

// 防 tree-shake
if (typeof window !== 'undefined') {
    window.__SOLELY_VITE_PLUGIN__ = solelyVitePlugin;
}
