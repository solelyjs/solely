/**
 * Slider 组件类型定义
 */

/** 单个刻度：文案 / 数字，或带 label、style 的配置对象 */
export type SliderMarkValue = string | number | { label?: string; style?: string };

/** 刻度数据映射：key 为刻度数值，value 为刻度展示配置 */
export type SliderMarksData = Record<string | number, SliderMarkValue>;

export interface SliderProps {
    /** 当前值（range 模式下为 [起始值, 结束值]） */
    value?: number | number[];
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
    /** 是否双滑块范围选择 */
    range?: boolean;
    /** 是否显示刻度标记 */
    marks?: boolean;
    /** 刻度标记数据（对象映射，值可为字符串 / 数字或 { label, style }） */
    marksData?: SliderMarksData;
    /** 是否垂直模式 */
    vertical?: boolean;
    /** 是否撑满父容器宽度 */
    block?: boolean;
    /** 无障碍名称（单滑块模式下挂在轨道上） */
    ariaLabel?: string;
}
