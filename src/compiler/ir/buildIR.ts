import { genFunction, GenType, IS_DEV } from '../../shared';
import {
    IRNode,
    IRAttr,
    SourceLocation,
    IRLocal,
    isLifecycleKind,
    ASTNode,
    ASTType,
    IRRoot,
    IRBranch,
} from '../../types';

// ==================== 全局常量与环境 ====================
const INTERPOLATION_RE = /\{\{[\s\S]*?\}\}/; // 移除 /g，使用 .test() 时无需重置 lastIndex，且更安全

// ==================== s-model 组件配置 ====================
/** 组件 s-model 配置：定义双向绑定的属性名和事件名 */
interface ComponentModelConfig {
    /** 要绑定的属性名 */
    prop: string;
    /** 监听的事件名 */
    event: string;
}

/**
 * 自定义组件 s-model 配置表
 * 键为标签名（小写），值为配置对象
 * 未配置的组件默认使用 { prop: 'value', event: 'change' }
 */
const COMPONENT_MODEL_MAP: Record<string, ComponentModelConfig> = {
    'solely-checkbox': { prop: 'checked', event: 'change' },
    'solely-switch': { prop: 'checked', event: 'change' },
    'solely-radio': { prop: 'checked', event: 'change' },
};

// ==================== 全局函数编译器 ====================
class GlobalFunctionCompiler {
    private compilers = new Map<string, FunctionCompiler>();

    get(filename: string = 'anonymous'): FunctionCompiler {
        let compiler = this.compilers.get(filename);
        if (!compiler) {
            compiler = new FunctionCompiler();
            this.compilers.set(filename, compiler);
        }
        return compiler;
    }

    clear(filename?: string) {
        if (filename) {
            this.compilers.get(filename)?.clear();
            this.compilers.delete(filename);
        } else {
            for (const c of this.compilers.values()) c.clear();
            this.compilers.clear();
        }
    }
}

const globalCompiler = new GlobalFunctionCompiler();

// ==================== 核心 FunctionCompiler ====================
class FunctionCompiler {
    private cache = new Map<string, number>();
    private functions: Function[] = [];

    // 缓存 key 生成优化：避免每次都重新分配数组
    private makeCacheKey(type: GenType, expr: string, locals: IRLocal[]): string {
        if (locals.length === 0) return `${type}:${expr}`;

        // 只有在有 locals 时才进行复杂的 key 生成
        // 假设 locals 顺序在 AST 遍历中是稳定的，可以简化处理
        // 如果需要严格唯一性，保持原来的 map+sort 逻辑
        const localKey = locals.map(l => Object.keys(l).sort().join(',')).join(';');
        return `${type}:${expr}:${localKey}`;
    }

    compile(type: GenType, expr: string, locals: IRLocal[]): number {
        const trimmed = expr?.trim();
        if (!trimmed) return 0;

        const cacheKey = this.makeCacheKey(type, trimmed, locals);
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) return cached;

        let fn: Function;
        try {
            fn = genFunction(trimmed, type, locals);
        } catch (e) {
            if (IS_DEV) {
                console.error(`[IR Compile Error] Type: ${type}, Expr: "${trimmed}"`, e);
            }
            fn = () => ''; // 安全回退
        }

        // 索引从 1 开始，0 保留给静态/空值
        const fid = this.functions.push(fn);
        this.cache.set(cacheKey, fid);
        return fid;
    }

    getFunctions(): Function[] {
        return this.functions; // 直接返回引用，如果外部不修改，比 [...this.functions] 更快
    }

    getStats() {
        return { total: this.functions.length, cached: this.cache.size };
    }

    clear() {
        this.cache.clear();
        this.functions = []; // 重新赋值清空
    }
}

// ==================== 工具函数 ====================
function classifyAttribute(key: string): { isDynamic: boolean; type: GenType | null } {
    const char = key[0];
    if (char === ':') return { isDynamic: true, type: 'expression' };
    if (char === '@') return { isDynamic: true, type: 'handler' };
    if (isLifecycleKind(key)) return { isDynamic: true, type: 'lifecycle' };
    return { isDynamic: false, type: null };
}

function hasInterpolation(text: string | undefined): boolean {
    if (!text) return false;
    return INTERPOLATION_RE.test(text); // 无 /g，无副作用
}

// 统一的 Meta 添加工具
function attachMeta(target: IRNode | IRAttr, expr: string | undefined, loc?: SourceLocation | undefined) {
    // 始终生成元数据，由插件根据 minify 选项决定是否序列化
    target.__m = { expr: expr ?? '', loc: loc ?? undefined };
}

// ==================== 双向绑定 ====================
/**
 * 将 s-model 转换成 :value / @input / @change
 * 在 AST → IR 转换前调用
 * @param node AST 节点
 */
export function transformModel(node: ASTNode) {
    if (!node.attrs) return;

    const modelAttr = node.attrs.find(a => a.key === 's-model');
    if (!modelAttr) return;

    const model = '$data.' + modelAttr.value.replace('this.', '').replace('$data.', ''); // e.g. "foo"
    const loc = modelAttr.loc;

    const tag = (node.tag || '').toLowerCase();
    const typeAttr = node.attrs.find(a => a.key === 'type');
    const inputType = typeAttr?.value ?? 'text'; // 默认 text

    // 移除 s-model
    node.attrs = node.attrs.filter(a => a !== modelAttr);

    // 工具函数：添加属性
    const add = (key: string, value: string, role?: 'model' | 'user') => {
        node.attrs?.push({ key, value, role, loc });
    };

    // ------------------------------------------------
    // 1. input
    // ------------------------------------------------
    if (tag === 'input') {
        // checkbox
        if (inputType === 'checkbox') {
            const valueAttr = node.attrs.find(a => a.key === 'value');
            const value = valueAttr ? JSON.stringify(valueAttr.value) : '"on"'; // 默认 value
            // :checked 属性
            const checkedExpr = `Array.isArray(${model}) ? ${model}.includes(${value}) : ${model}`;
            add(':checked', checkedExpr);

            // @change 事件
            const changeExpr = `
                const _v = ${value};
                if(Array.isArray(${model})) {
                    const _i = ${model}.indexOf(_v);
                    if(checked && _i === -1) ${model}.push(_v);
                    else if(!checked && _i > -1) ${model}.splice(_i,1);
                } else {
                    ${model} = checked;
                }`;

            add('@change', changeExpr, 'model');

            return;
        }

        // radio
        if (inputType === 'radio') {
            const valueAttr = node.attrs.find(a => a.key === 'value');
            const radioValue = valueAttr?.value ?? 'null';

            // DOM 选中状态
            add(':checked', `${model} == ${JSON.stringify(radioValue)}`);

            // DOM → 数据
            add('@change', `if (checked) ${model} = ${JSON.stringify(radioValue)}`, 'model');

            return;
        }

        // 普通 input
        add(':value', model);
        add('@input', `${model} = value`, 'model');
        return;
    }

    // ------------------------------------------------
    // 2. textarea
    // ------------------------------------------------
    if (tag === 'textarea') {
        add(':value', model);
        add('@input', `${model} = value`, 'model');
        return;
    }

    // ------------------------------------------------
    // 3. select
    // ------------------------------------------------
    if (tag === 'select') {
        const isMultiple = node.attrs.some(a => a.key === 'multiple');

        if (isMultiple) {
            // 数据 → DOM
            // add(':value', model);
            // 这个地方需要所有选择的option设置selected 更新后设置
            add(
                'updated',
                `
                    const values = Array.isArray(${model}) ? ${model} : ${model} != null ? [${model}] : [];
                    for (const opt of el.options) {
                        opt.selected = values.includes(opt.value);
                    }`,
            );

            // DOM → 数据
            add('@change', `${model} = Array.from(event.target.selectedOptions).map(o => o.value)`, 'model');
        } else {
            // 单选
            add(':value', model);
            add('@change', `${model} = value`, 'model');
        }

        return;
    }

    // ------------------------------------------------
    // 4. 自定义组件（如 <solely-input>, <solely-checkbox> 等）
    // 根据组件的 model 配置绑定对应属性和事件
    // 默认：:value + @change
    // ------------------------------------------------
    const modelConfig = COMPONENT_MODEL_MAP[tag];
    const propName = modelConfig?.prop ?? 'value';
    const eventName = modelConfig?.event ?? 'change';

    add(`:${propName}`, model);
    // 根据 propName 生成取值表达式
    // value/checked 是常见场景，直接从解构变量获取
    // 其他属性动态从 event.target 获取，支持任意自定义 prop
    const valueExpr = propName === 'checked' ? 'checked' : propName === 'value' ? 'value' : `event.target.${propName}`;
    add(`@${eventName}`, `${model} = ${valueExpr}`, 'model');
}

// ==================== 属性处理 ====================
function processAttributes(
    node: ASTNode,
    locals: IRLocal[],
    compiler: FunctionCompiler,
    excludeKeys: Set<string> | null = null,
): IRAttr[] {
    if (!node.attrs || node.attrs.length === 0) return [];

    const result: IRAttr[] = [];

    for (const attr of node.attrs) {
        if (excludeKeys && excludeKeys.has(attr.key)) continue;

        const { key, value, role } = attr;
        const { isDynamic, type } = classifyAttribute(key);

        if (isDynamic && type) {
            const fid = compiler.compile(type, value ?? '', locals);
            const irAttr: IRAttr = { k: key, f: fid, d: 1, r: role };
            attachMeta(irAttr, value, attr.loc ?? node.loc);
            result.push(irAttr);
        } else {
            result.push({ k: key, v: value, d: 0, r: role });
        }
    }

    return result;
}

// ==================== 核心转换逻辑 (Unified) ====================

/**
 * 检查节点是否是静态的（本身及所有后代都是静态）
 */
function isStaticNode(ir: IRNode): boolean {
    // 如果节点本身是动态的，则不是静态节点
    if (ir.d === 1) return false;

    // 检查子节点
    if (ir.c && ir.c.length > 0) {
        for (const child of ir.c) {
            if (!isStaticNode(child)) return false;
        }
    }

    // 检查条件分支
    if (ir.b && ir.b.length > 0) {
        for (const branch of ir.b) {
            if (branch.c && branch.c.length > 0) {
                for (const child of branch.c) {
                    if (!isStaticNode(child)) return false;
                }
            }
        }
    }

    return true;
}

/**
 * 标记静态子树
 * 后序遍历：先处理子节点，再判断自身是否为静态子树
 */
function markStaticSubtrees(ir: IRNode): void {
    // 1. 先递归处理子节点
    if (ir.c && ir.c.length > 0) {
        for (const child of ir.c) {
            markStaticSubtrees(child);
        }
    }

    // 2. 处理条件分支
    if (ir.b && ir.b.length > 0) {
        for (const branch of ir.b) {
            if (branch.c && branch.c.length > 0) {
                for (const child of branch.c) {
                    markStaticSubtrees(child);
                }
            }
        }
    }

    // 3. 判断自身是否为完全静态子树
    // 只有 Element 和 Text 类型可以被标记为静态子树
    if (ir.t === ASTType.Element || ir.t === ASTType.Text) {
        if (ir.d === 0 && isStaticNode(ir)) {
            ir.s = 1;
        }
    }
}

/**
 * 处理单个非 Conditional 节点，或者 Conditional 的子节点
 */
function transformNode(node: ASTNode, locals: IRLocal[], compiler: FunctionCompiler): IRNode {
    const ir: IRNode = { t: node.type, d: 0 };

    // 1. 动态性预判
    let isDynamic = false;
    if (node.type === ASTType.Text) {
        if (hasInterpolation(node.content)) isDynamic = true;
    } else {
        // Element, For, etc.
        // 只要有一个属性是动态的，节点就是动态的
        if (node.attrs?.some(a => a.key === 's-model' || classifyAttribute(a.key).isDynamic)) {
            isDynamic = true;
        }
        // 特殊节点类型天生是动态的
        if (node.type === ASTType.For) isDynamic = true;
    }
    ir.d = isDynamic ? 1 : 0;

    // 2. 根据类型处理
    switch (node.type) {
        case ASTType.Text: {
            const content = node.content ?? '';
            if (isDynamic) {
                ir.f = compiler.compile('template', content, locals);
                attachMeta(ir, content, node.loc);
            } else {
                ir.x = content;
            }
            break;
        }

        case ASTType.Element: {
            ir.g = node.tag;
            // 双向绑定语法展开
            transformModel(node);
            ir.a = processAttributes(node, locals, compiler);
            if (node.children) {
                ir.c = transformList(node.children, locals, compiler);
            }
            break;
        }

        case ASTType.For: {
            // 提取关键属性
            const eachAttr = node.attrs?.find(a => a.key === 'each');
            const expr = eachAttr?.value ?? '';

            ir.f = compiler.compile('expression', expr, locals);
            ir.i = node.attrs?.find(a => a.key === 'item')?.value ?? 'item';
            ir.n = node.attrs?.find(a => a.key === 'index')?.value ?? 'index';

            attachMeta(ir, expr, eachAttr?.loc ?? node.loc);

            // 处理其他属性 (排除 each, item, index)
            const exclude = new Set(['each', 'item', 'index']);
            ir.a = processAttributes(node, locals, compiler, exclude);

            // 构造新的作用域
            const nextLocals = [...locals, { i: ir.i, x: ir.n }];

            if (node.children) {
                ir.c = transformList(node.children, nextLocals, compiler);
            }
            break;
        }

        // ASTType.If/ElseIf/Else 不应直接进入 transformNode，它们应由 transformList 处理
        // 但如果 AST 结构异常（如单独的 Else），这里作为 Fallback 处理为普通节点
        case ASTType.If:
        case ASTType.ElseIf:
        case ASTType.Else: {
            if (IS_DEV) console.warn(`[IR] Orphaned conditional node found: ${ASTType[node.type]}`);
            ir.a = processAttributes(node, locals, compiler);
            if (node.children) {
                ir.c = transformList(node.children, locals, compiler);
            }
            break;
        }

        case ASTType.Comment: {
            ir.x = node.content ?? '';
            break;
        }
    }

    return ir;
}

/**
 * 遍历节点列表，自动合并 If/ElseIf/Else 分支
 */
function transformList(nodes: ASTNode[], locals: IRLocal[], compiler: FunctionCompiler): IRNode[] {
    const result: IRNode[] = [];
    let i = 0;

    while (i < nodes.length) {
        const node = nodes[i];

        // 遇到 If 块，开始吞噬后续兄弟节点
        if (node.type === ASTType.If) {
            const branches: IRBranch[] = [];
            let currentIdx = i;

            // 循环收集 If -> ElseIf -> Else 链
            while (currentIdx < nodes.length) {
                const currentNode = nodes[currentIdx];
                const type = currentNode.type;

                // 如果当前不是条件节点，跳出
                if (type !== ASTType.If && type !== ASTType.ElseIf && type !== ASTType.Else) {
                    break;
                }

                // 如果当前是 If，但它不是这一组的"领头羊"（即 branches 已经有东西了）
                // 说明遇到了下一个独立的 If 块，必须跳出，留给外层循环处理
                if (type === ASTType.If && branches.length > 0) {
                    break;
                }

                // 计算条件 (Else 没有条件)
                let condFid: number | null = null;
                let expr = '';
                let loc: SourceLocation | undefined = undefined;
                if (type !== ASTType.Else) {
                    const testAttr = currentNode.attrs?.find(a => a.key === 'test' || a.key === 'condition');
                    expr = testAttr?.value ?? 'false';
                    condFid = compiler.compile('expression', expr, locals);
                    loc = testAttr?.loc ?? currentNode.loc;
                }

                // 处理子节点
                // 注意：If 节点本身也是容器，需要递归转换其 children
                // 这里 locals 传递当前的 locals，因为 If 本身不改变作用域（For 才会）
                // 除非 If 上同时有 For (AST 层面通常已拆分，若未拆分需注意优先级)
                const children = currentNode.children ? transformList(currentNode.children, locals, compiler) : [];

                // 处理属性 (排除 test、condition)
                const exclude = new Set(['test', 'condition']);
                const attrs = processAttributes(currentNode, locals, compiler, exclude);

                branches.push({
                    f: condFid,
                    c: children,
                    a: attrs.length > 0 ? attrs : undefined,
                    __m: { expr, loc },
                });

                currentIdx++;

                // 如果是 Else，链条结束
                if (type === ASTType.Else) break;
            }

            // 生成 Conditional 节点

            result.push({
                t: ASTType.Conditional,
                d: 1,
                b: branches,
                __m: { loc: node.loc },
            });

            // 跳过已处理的节点
            i = currentIdx;
        } else {
            // 普通节点
            result.push(transformNode(node, locals, compiler));
            i++;
        }
    }

    return result;
}

// ==================== 导出接口 ====================
/** 构建 IR 的选项 */
export interface BuildIROptions {
    /** 源代码字符串 */
    source?: string;
    /** 文件名 */
    filename?: string;
}

/**
 * 构建 IR（中间表示）
 * @param ast AST 节点数组
 * @param options 构建选项
 * @returns IR 根节点
 */
export function buildIR(ast: ASTNode[], options: BuildIROptions = {}): IRRoot {
    const { filename = 'anonymous', source } = options;
    const compiler = globalCompiler.get(filename);

    // 每次 build 清除当前文件旧的编译缓存，防止内存泄漏或 HMR 滞后
    // 如果需要跨 build 缓存，可以移除这行，但这通常用于 HMR 场景
    compiler.clear();

    const start = performance.now();

    // 入口：直接调用 transformList 处理根节点列表
    const irNodes = transformList(ast, [], compiler);

    // 标记静态子树 - 后序遍历所有节点
    for (const node of irNodes) {
        markStaticSubtrees(node);
    }

    const end = performance.now();
    const stats = compiler.getStats();

    // 计算统计信息
    const dynamicNodeCount = irNodes.filter(n => n.d === 1).length;
    const staticSubtreeCount = irNodes.filter(n => n.s === 1).length;

    const root: IRRoot = {
        t: 'root',
        v: '1.2.0', // Bump version - static hoisting support
        fns: compiler.getFunctions(),
        n: irNodes,
        s: {
            tf: stats.total,
            cf: stats.cached,
            dn: dynamicNodeCount,
            tn: irNodes.length,
            sn: staticSubtreeCount, // 静态子树数量
        },
        m: {
            t: new Date().toISOString(),
            as: ast.length,
            fn: filename,
            ...(source && { src: source }),
        },
    };

    if (IS_DEV) {
        console.info(
            `[Solely] Compiled <${filename}> in ${(end - start).toFixed(2)}ms | ` +
                `Nodes: ${irNodes.length} | Fns: ${stats.total} | StaticSubtrees: ${staticSubtreeCount}`,
        );
    }

    return root;
}

/**
 * 清除 IR 编译缓存
 * @param filename 指定文件名，不传则清除所有缓存
 */
export function clearIRCache(filename?: string) {
    globalCompiler.clear(filename);
}
