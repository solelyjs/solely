/**
 * Slider 组件类型定义
 */

export interface SliderProps {
    /** 当前值 */
    value?: number;
    /** 最小值 */
    min?: number;
    /** 最大值 */
    max?: number;
    /** 步长 */
    step?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示 Tooltip */
    tooltipVisible?: boolean;
    /** 是否显示刻度标记 */
    marks?: boolean;
    /** 刻度标记数据（JSON字符串） */
    marksData?: string;
    /** 是否垂直模式 */
    vertical?: boolean;
    /** 是否撑满父容器宽度 */
    block?: boolean;
}
