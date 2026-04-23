/**
 * Modal 组件类型定义
 */

export type ModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface ModalButton {
    /** 按钮文字 */
    text: string | HTMLElement;
    /** 按钮类型 */
    type?: 'primary' | 'default' | 'danger';
    /** 按钮样式 */
    style?: Partial<CSSStyleDeclaration>;
    /** 点击回调 */
    onClick: () => void | Promise<void>;
}

export interface ModalOptions {
    /** 标题 */
    title?: string | HTMLElement;
    /** 内容 */
    content?: string | HTMLElement;
    /** 类型 */
    type?: ModalType;
    /** 宽度 */
    width?: number | string;
    /** 是否显示遮罩 */
    mask?: boolean;
    /** 是否可点击遮罩关闭 */
    maskClosable?: boolean;
    /** 是否显示关闭按钮 */
    closable?: boolean;
    /** 是否显示图标，默认 true */
    showIcon?: boolean;
    /** 确定按钮文字 */
    okText?: string | HTMLElement;
    /** 取消按钮文字 */
    cancelText?: string | HTMLElement;
    /** 确定按钮类型 */
    okType?: 'primary' | 'default' | 'danger';
    /** 是否显示取消按钮 */
    showCancel?: boolean;
    /** 自定义按钮数组（如果提供，将忽略 okText/cancelText/showCancel） */
    buttons?: ModalButton[];
    /** 确定按钮回调 */
    onOk?: () => void | Promise<void>;
    /** 取消按钮回调 */
    onCancel?: () => void;
    /** 关闭后回调 */
    onClose?: () => void;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
}

export interface ModalInstance {
    /** 关闭弹窗 */
    close: () => void;
    /** 更新内容 */
    update: (options: Partial<ModalOptions>) => void;
}

export interface ModalConfig {
    /** 默认宽度 */
    width: number | string;
    /** 默认是否显示遮罩 */
    mask: boolean;
    /** 默认是否可点击遮罩关闭 */
    maskClosable: boolean;
    /** 默认确定按钮文字 */
    okText: string | HTMLElement;
    /** 默认取消按钮文字 */
    cancelText: string | HTMLElement;
}
