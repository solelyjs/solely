import { ASTType, SourceLocation } from "./ast";

/** IR 属性 */
export interface IRAttr {
    key: string;
    value?: string;
    fid?: number;     // 函数ID
    dynamic: 0 | 1;   // 0=静态, 1=动态
    /**
     * 执行语义角色（Execution Role）
     *
     * - model:
     *   数据同步语义（如 s-model / v-model 展开）
     *   必须在同一事件中最先执行，
     *   以保证用户事件观察到的是最新数据状态
     *
     * - user:
     *   用户显式声明的事件处理逻辑（@click / @input 等）
     *   在 model 同步完成后执行
     */
    role?: 'model' | 'user';
}

/** 局部变量作用域 */
export interface IRLocal {
    item?: string;
    index?: string;
}

/** 核心 IR 节点 */
export interface IRNode {
    type: ASTType;          // ASTType (数字枚举)
    dynamic: 0 | 1;         // dynamic flag (0=静态, 1=动态) 不包含子节点状态

    // Element
    tag?: string;       // 标签名
    attrs?: IRAttr[];   // 属性数组

    // Text/Comment
    txt?: string;      // 静态文本内容

    // 控制流
    fid?: number;     // 条件/循环表达式函数ID
    item?: string;    // for item
    index?: string;   // for index

    branches?: {
        condFid: number | null;     // null 表示 else
        children: IRNode[];
        attrs?: IRAttr[];           // 支持 <if class="red" cond={...}>
        __meta?: any;
    }[];

    // 子节点
    children?: IRNode[];
}

/** 🎯 IR 根节点 - 核心数据结构 */
export interface IRRoot {
    type: 'root';
    version: string;           // IR 版本
    functions: Function[];     // 编译后的函数数组
    nodes: IRNode[];           // 根节点数组
    stats: {
        totalFunctions: number;    // 总函数数
        cachedFunctions: number;   // 缓存命中数
        dynamicNodes: number;      // 动态节点数
        totalNodes: number;        // 总节点数
    };
    metadata?: {
        compiledAt: string;        // 编译时间
        astSize: number;           // 原始AST大小
        source?: string;           // 源文件路径
        filename: string;          // 源文件名
    };
}

export interface Meta {
    expr: string;
    loc?: SourceLocation;
}