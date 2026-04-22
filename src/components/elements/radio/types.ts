/**
 * Radio 组件类型定义
 */

/** 单选框颜色类型 */
export type RadioType = 'primary' | 'success' | 'warning' | 'error';

export interface RadioProps {
    /** 是否选中 */
    checked: boolean;
    /** 是否禁用 */
    disabled: boolean;
    /** 单选框内容 */
    content: string;
    /** 单选框的值 */
    value: string;
    /** 颜色类型 */
    type: RadioType;
    /** 单选框名称，用于分组 */
    name: string;
    /** 是否块级元素，占满父容器宽度 */
    block: boolean;
}

export interface RadioGroupProps {
    /** 选中的值 */
    value: string;
    /** 是否禁用整个组 */
    disabled: boolean;
    /** 排列方向 */
    direction: 'horizontal' | 'vertical';
}
