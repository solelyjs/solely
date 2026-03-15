/**
 * 表示一次对象或数组的变更信息
 */
export interface ChangeItem {
    /** 变更的路径，从根对象开始 */
    path: (string | symbol)[];
    /** 新值 */
    newValue: any;
    /** 旧值 */
    oldValue: any;
}

/**
 * observe 函数的可选配置项
 */
export interface ObserveOptions {
    /**
     * 节流时间（毫秒），用于批量回调
     */
    throttle?: number;

    /**
     * 仅监听匹配的路径，可为字符串或字符串数组
     * 支持通配符：
     * - `*` 单层匹配
     * - `**` 任意层级匹配
     * - `[*]` 数组元素匹配
     */
    filter?: string | string[];

    /**
     * 是否进行深度比较，避免浅比较导致重复触发
     */
    deepCompare?: boolean;

    /**
     * 批量变化时的回调
     */
    onBatch?: (changes: ChangeItem[]) => void;

    /**
     * 是否在初始化时立即触发一次回调
     */
    immediate?: boolean;
}

/**
 * observe 返回值对象
 */
export interface ObserveReturn<T> {
    /** 代理对象 */
    proxy: T;
    /** 停止监听 */
    unobserve: () => void;
    /** 恢复监听 */
    resume: () => void;
}