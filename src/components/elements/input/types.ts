/**
 * Input 组件类型定义
 */

export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'textarea';
export type InputSize = 'small' | 'medium' | 'large';
export type InputStatus = 'error' | 'warning' | 'success' | '';

export interface InputProps {
    /** 输入框类型 */
    type: InputType;
    /** 无障碍名称（原生 input 没有关联 label 时使用） */
    ariaLabel?: string;
    /** 输入框尺寸 */
    size: InputSize;
    /** 表单字段名 */
    name: string;
    /** 输入框值 */
    value: string;
    /** 表单重置时写回的值 */
    defaultValue: string;
    /** 占位符 */
    placeholder: string;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否只读 */
    readonly: boolean;
    /** 是否必填 */
    required: boolean;
    /** 自定义校验消息 */
    invalidMessage: string;
    /** 最大长度 */
    maxlength: number;
    /** 最小长度 */
    minlength: number;
    /** 是否显示清除按钮 */
    clearable: boolean;
    /** 是否显示密码切换 */
    showPassword: boolean;
    /** @deprecated 旧属性名，请使用 showPassword（对应 show-password） */
    showpassword?: boolean;
    /** 前缀图标 */
    prefix: string;
    /** 后缀图标 */
    suffix: string;
    /** 状态 */
    status: InputStatus;
    /** 状态提示信息 */
    message: string;
    /** 是否显示字数统计 */
    showCount: boolean;
    /** @deprecated 旧属性名，请使用 showCount（对应 show-count） */
    showcount?: boolean;
    /** 文本域行数 */
    rows: number;
    /** 是否自动聚焦 */
    autofocus: boolean;
    /** 聚焦时是否全选 */
    selectAll: boolean;
    /** @deprecated 旧属性名，请使用 selectAll（对应 select-all） */
    selectall?: boolean;
    /** 是否显示复制按钮 */
    copyable: boolean;
    /** 输入格式化类型 */
    format: 'none' | 'phone' | 'bankcard' | 'idcard';
    /** 搜索建议数据源（设置后自动启用搜索建议） */
    suggestions: string[];
    /** 是否块级显示 */
    block: boolean;
    /** 输入框前置附加内容（与输入框合体的文本标签） */
    addonBefore: string;
    /** 输入框后置附加内容（与输入框合体的文本标签） */
    addonAfter: string;
    /** textarea 是否随内容自动增高 */
    autosize: boolean;
    /** autocomplete 透传（on / off / 具体 token） */
    autocomplete: string;
    /** inputmode 透传（none / text / numeric / decimal / tel / search / email / url） */
    inputmode: string;
    /** enterkeyhint 透传 */
    enterkeyhint: string;
    /** spellcheck 透传，字符串 'true' / 'false'（未设置时不输出该属性） */
    spellcheck: string;
    /** number 类型的最小值 */
    min: number;
    /** number 类型的最大值 */
    max: number;
    /** number 类型的步进 */
    step: number;
}

/**
 * Input 组件内部状态（不暴露为公共 attribute，仅用于渲染）
 */
export interface InputInternalState {
    /** 密码是否可见（内部状态） */
    passwordVisible: boolean;
    /** 是否聚焦（内部状态） */
    focused: boolean;
}

/**
 * Input 组件 Refs 接口
 */
export interface InputRefs {
    /** 输入框元素引用 */
    inputRef: HTMLInputElement | HTMLTextAreaElement;
    [key: string]: Element;
}
