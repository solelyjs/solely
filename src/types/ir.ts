import { ASTType, SourceLocation } from "./ast";

/** IR 属性 */
export interface IRAttr {
    /** 属性键名 */
    key: string;
    /** 属性值 */
    value?: string;
    /** 函数ID */
    fid?: number;
    /** 0=静态, 1=动态 */
    dynamic: 0 | 1;
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
    /** ASTType (数字枚举) */
    type: ASTType;
    /** dynamic flag (0=静态, 1=动态) 不包含子节点状态 */
    dynamic: 0 | 1;

    /** 标签名（Element 使用） */
    tag?: string;
    /** 属性数组（Element 使用） */
    attrs?: IRAttr[];

    /** 静态文本内容（Text/Comment 使用） */
    txt?: string;

    /** 条件/循环表达式函数ID */
    fid?: number;
    /** for 循环的 item 变量名 */
    item?: string;
    /** for 循环的 index 变量名 */
    index?: string;

    /** 条件分支数组 */
    branches?: {
        /** 条件函数ID，null 表示 else */
        condFid: number | null;
        /** 子节点数组 */
        children: IRNode[];
        /** 属性数组，支持 <if class="red" cond={...}> */
        attrs?: IRAttr[];
        __meta?: any;
    }[];

    /** 子节点数组 */
    children?: IRNode[];
}

/** 🎯 IR 根节点 - 核心数据结构 */
export interface IRRoot {
    /** 节点类型 */
    type: 'root';
    /** IR 版本 */
    version: string;
    /** 编译后的函数数组 */
    functions: Function[];
    /** 根节点数组 */
    nodes: IRNode[];
    /** 统计信息 */
    stats: {
        /** 总函数数 */
        totalFunctions: number;
        /** 缓存命中数 */
        cachedFunctions: number;
        /** 动态节点数 */
        dynamicNodes: number;
        /** 总节点数 */
        totalNodes: number;
    };
    /** 元数据 */
    metadata?: {
        /** 编译时间 */
        compiledAt: string;
        /** 原始AST大小 */
        astSize: number;
        /** 源文件路径 */
        source?: string;
        /** 源文件名 */
        filename: string;
    };
}

export interface Meta {
    expr: string;
    loc?: SourceLocation;
}