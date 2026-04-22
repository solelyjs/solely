/**
 * Button 组件类型定义
 */

export type ButtonType =
    | 'primary'
    | 'secondary' // 次按钮
    | 'default'
    | 'dashed'
    | 'text'
    | 'link'
    | 'success' // 成功按钮
    | 'warning' // 警告按钮
    | 'error'; // 错误按钮

export type ButtonSize = 'small' | 'medium' | 'large';
export type ButtonShape = 'default' | 'circle' | 'round' | 'pill'; // 新增 pill

export interface ButtonProps {
    /** 按钮类型 */
    type: ButtonType;
    /** 按钮尺寸 */
    size: ButtonSize;
    /** 按钮形状 */
    shape: ButtonShape;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否加载中 */
    loading: boolean;
    /** 是否为幽灵按钮 */
    ghost: boolean;
    /** 是否危险按钮（向后兼容） */
    danger: boolean;
    /** 是否块级按钮 */
    block: boolean;
    /** 按钮内容 */
    content: string;
    /** 左侧图标 */
    icon: string;
    /** 右侧图标 */
    iconRight: string;
    /** 仅图标按钮（无文字） */
    iconOnly: boolean;
    /** 链接地址（当 type='link' 时生效） */
    href: string;
    /** 链接打开方式 */
    target: '_blank' | '_self' | '_parent' | '_top';
    /** 自定义加载图标 */
    loadingIcon: string;
}

/** Button 组件 refs 定义 */
export interface ButtonRefs extends Record<string, Element> {
    buttonRef: HTMLButtonElement | HTMLAnchorElement;
}
