/**
 * Select 组件类型定义
 */

export type SelectSize = 'small' | 'medium' | 'large';

/**
 * 选项数据
 * 用于 options 属性方式
 */
export interface SelectOption {
    /** 选项标签 */
    label: string;
    /** 选项值 */
    value: string;
    /** 是否禁用 */
    disabled?: boolean;
}

/**
 * Select 组件属性
 */
export interface SelectProps {
    /** 选中的值 */
    value?: string;
    /** 占位符文本 */
    placeholder?: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 尺寸 */
    size?: SelectSize;
    /** 是否可清空 */
    clearable?: boolean;
    /** 选项数据 */
    options?: SelectOption[];
    /** 是否多选 */
    multiple?: boolean;
    /** 是否块级显示 */
    block?: boolean;
}

/**
 * Select 组件方法接口
 */
export interface SelectMethods {
    /** 设置值 */
    setValue(value: string, silent?: boolean): void;
    /** 获取值 */
    getValue(): string;
    /** 设置选项 */
    setOptions(options: SelectOption[]): void;
    /** 打开下拉菜单 */
    open(): void;
    /** 关闭下拉菜单 */
    close(): void;
    /** 清空选择 */
    clear(): void;
}
