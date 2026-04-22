/**
 * Checkbox 组件类型定义
 */

/** 复选框尺寸类型 */
export type CheckboxSize = 'small' | 'medium' | 'large';

/** 复选框颜色类型 */
export type CheckboxType = 'primary' | 'success' | 'warning' | 'error';

/** Checkbox 组件属性接口 */
export interface CheckboxProps {
    /** 是否选中 */
    checked: boolean;
    /** 是否半选中 */
    indeterminate: boolean;
    /** 是否禁用 */
    disabled: boolean;
    /** 复选框内容 */
    content: string;
    /** 颜色类型 */
    type: CheckboxType;
    /** 尺寸 */
    size: CheckboxSize;
    /** 是否块级显示 */
    block: boolean;
    /** 表单 name 属性 */
    name: string;
}

/** Checkbox 组件引用接口 */
export interface CheckboxRefs extends Record<string, Element> {
    checkboxRef: HTMLLabelElement;
}
