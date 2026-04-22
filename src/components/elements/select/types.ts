/**
 * Select 组件类型定义
 */

export type SelectSize = 'small' | 'medium' | 'large';

export interface SelectOption {
    /** 选项标签 */
    label: string;
    /** 选项值 */
    value: string;
    /** 是否禁用 */
    disabled?: boolean;
}

export interface SelectProps {
    /** 选中的值 */
    value: string;
    /** 占位符 */
    placeholder: string;
    /** 是否禁用 */
    disabled: boolean;
    /** 尺寸 */
    size: SelectSize;
    /** 是否可清除 */
    clearable: boolean;
    /** 选项列表 */
    options: SelectOption[];
    /** 是否多选 */
    multiple: boolean;
    /** 是否块级显示 */
    block: boolean;
}
