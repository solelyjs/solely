import { ASTType, SourceLocation } from './ast';

/** IR 属性 */
export interface IRAttr {
    /** key 属性键名 */
    k: string;
    /** value 属性值 */
    v?: string;
    /** functionId 函数ID */
    f?: number;
    /** dynamicFlag 0=静态, 1=动态 */
    d: 0 | 1;
    /**
     * executionRole 执行语义角色（Execution Role）
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
    r?: 'model' | 'user';
    /** __meta 调试元信息 */
    __m?: Meta;
}

/** 局部变量作用域 */
export interface IRLocal {
    /** item variable name */
    i?: string;
    /** index variable name */
    x?: string;
}

/** 条件分支 */
export interface IRBranch {
    /** conditionFunctionId 条件函数 id，null 表示 else */
    f: number | null;
    /** children 子节点数组 */
    c: IRNode[];
    /** attributes 属性数组，支持 <if class="red" cond={...}> */
    a?: IRAttr[];
    /** __meta 调试元信息 */
    __m?: Meta;
}

/** 核心 IR 节点 */
export interface IRNode {
    /** type ASTType (数字枚举) */
    t: ASTType;
    /** dynamicFlag (0=静态, 1=动态) 不包含子节点状态 */
    d: 0 | 1;

    /** tagName 标签名（Element 使用） */
    g?: string;
    /** attributes 属性数组（Element 使用） */
    a?: IRAttr[];

    /** text 静态文本内容（Text/Comment 使用） */
    x?: string;

    /** functionId 条件/循环表达式函数ID */
    f?: number;
    /** forItemVariableName for 循环的 item 变量名 */
    i?: string;
    /** forIndexVariableName for 循环的 index 变量名 */
    n?: string;

    /** branches 条件分支数组 */
    b?: IRBranch[];

    /** children 子节点数组 */
    c?: IRNode[];

    /** __meta 调试元信息 */
    __m?: Meta;
}

/** 🎯 IR 根节点 - 核心数据结构 */
export interface IRRoot {
    /** type 固定为 root */
    t: 'root';
    /** version IR 版本 */
    v: string;
    /** functions 编译后的函数数组 */
    fns: Function[];
    /** nodes 根节点数组 */
    n: IRNode[];
    /** stats 统计信息 */
    s: {
        /** 总函数数 */
        tf: number;
        /** 缓存命中数 */
        cf: number;
        /** 动态节点数 */
        dn: number;
        /** 总节点数 */
        tn: number;
    };
    /** meta 编译元数据 */
    m?: {
        /** 编译时间 */
        t: string;
        /** 原始AST大小 */
        as: number;
        /** 源文件路径 */
        src?: string;
        /** 源文件名 */
        fn: string;
    };
}

/** 元数据（调试与源码映射用） */
export interface Meta {
    /** expr 原始表达式字符串 */
    expr?: string;
    /** sourceLocation 源码位置信息 */
    loc?: SourceLocation;
}
