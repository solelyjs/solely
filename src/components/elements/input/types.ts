/**
 * Input 组件类型定义
 */

export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'textarea';
export type InputSize = 'small' | 'medium' | 'large';
export type InputStatus = 'error' | 'warning' | 'success' | '';

export interface InputProps {
    /** 输入框类型 */
    type: InputType;
    /** 输入框尺寸 */
    size: InputSize;
    /** 输入框值 */
    value: string;
    /** 占位符 */
    placeholder: string;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否只读 */
    readonly: boolean;
    /** 是否必填 */
    required: boolean;
    /** 最大长度 */
    maxlength: number;
    /** 最小长度 */
    minlength: number;
    /** 是否显示清除按钮 */
    clearable: boolean;
    /** 是否显示密码切换 */
    showpassword: boolean;
    /** 密码是否可见（内部状态） */
    passwordVisible: boolean;
    /** 是否聚焦 */
    focused: boolean;
    /** 前缀图标 */
    prefix: string;
    /** 后缀图标 */
    suffix: string;
    /** 状态 */
    status: InputStatus;
    /** 状态提示信息 */
    message: string;
    /** 是否显示字数统计 */
    showcount: boolean;
    /** 文本域行数 */
    rows: number;
    /** 是否自动聚焦 */
    autofocus: boolean;
    /** 聚焦时是否全选 */
    selectall: boolean;
    /** 是否显示复制按钮 */
    copyable: boolean;
    /** 输入格式化类型 */
    format: 'none' | 'phone' | 'bankcard' | 'idcard';
    /** 搜索建议数据源（设置后自动启用搜索建议） */
    suggestions: string[];
    /** 是否块级显示 */
    block: boolean;
}

/**
 * Input 组件 Refs 接口
 */
export interface InputRefs {
    /** 输入框元素引用 */
    inputRef: HTMLInputElement | HTMLTextAreaElement;
    [key: string]: Element;
}
