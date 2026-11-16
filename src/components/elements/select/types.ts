/**
 * Select 组件类型定义
 */

export type SelectSize = 'small' | 'medium' | 'large';

/**
 * Select 的值
 * 单选为字符串，多选为字符串数组
 */
export type SelectValue = string | string[];

/**
 * 选项图标
 * - string：CSS 类名（通过 options 属性的 JSON 传入时使用）。
 *   类名会被同时暴露为 `part`（如 `icon="icon-gear"` → `::part(icon-gear)`），
 *   便于外部通过 `::part()` 定位；若类名样式已注入组件 shadow（如项目把样式
 *   通过 `adoptedStyleSheets` 注入 shadowRoot），也可直接按类名命中。
 * - HTMLElement：任意 DOM 节点（推荐用于 SVG / 图片）
 * - 函数：根据选项返回上述两种形式
 */
export type SelectIcon = string | HTMLElement | ((option: SelectOption) => string | HTMLElement);

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
    /** 是否为分组标题 */
    isGroup?: boolean;
    /**
     * 选项图标。
     * 仅能通过 setOptions() / .options 以程序化方式传入 HTMLElement 或函数；
     * options 属性（JSON）中只能传 CSS 类名。
     */
    icon?: SelectIcon;
    /**
     * 完全自定义渲染，返回值会替代「图标 + 文本」。
     * 返回 string 时按纯文本渲染（不解析 HTML），返回 HTMLElement 时插入 DOM。
     */
    render?: (option: SelectOption) => string | HTMLElement;
}

/**
 * Select 组件属性
 */
export interface SelectProps {
    /** 选中的值（多选时为数组） */
    value?: SelectValue;
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
    /** 表单字段名，设置后参与表单提交 */
    name?: string;
    /** 是否必选；为空时提交会被拦截并提示 */
    required?: boolean;
    /** 重置时的默认值（多选用与 value 相同的字符串/数组语义） */
    defaultValue?: string;
    /** 自定义校验失败提示 */
    invalidMessage?: string;
}

/**
 * Select 组件方法接口
 */
export interface SelectMethods {
    /** 设置值（多选传数组） */
    setValue(value: SelectValue, silent?: boolean): void;
    /** 获取值（多选返回数组） */
    getValue(): SelectValue;
    /** 设置选项 */
    setOptions(options: SelectOption[]): void;
    /** 获取当前选项 */
    getOptions(): SelectOption[];
    /** 打开下拉菜单 */
    open(): void;
    /** 关闭下拉菜单 */
    close(): void;
    /** 清空选择 */
    clear(): void;
}
