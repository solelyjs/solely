/**
 * Popconfirm 组件类型定义
 */

export type PopconfirmPlacement =
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'leftTop'
    | 'leftBottom'
    | 'rightTop'
    | 'rightBottom';

export interface PopconfirmOptions {
    /** 确认框标题 */
    title?: string | HTMLElement;
    /** 确认框描述 */
    description?: string | HTMLElement;
    /** 气泡框位置 */
    placement?: PopconfirmPlacement;
    /** 确认按钮文字 */
    okText?: string | HTMLElement;
    /** 确认按钮类型 */
    okType?: 'primary' | 'danger' | 'default';
    /** 取消按钮文字 */
    cancelText?: string | HTMLElement;
    /** 是否显示取消按钮 */
    showCancel?: boolean;
    /** 是否显示图标，默认 true */
    showIcon?: boolean;
    /** 确认回调 */
    onConfirm?: () => void;
    /** 取消回调 */
    onCancel?: () => void;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
    /** 是否克隆传入的 HTMLElement 内容（默认 true） */
    cloneElement?: boolean;
}

export interface PopconfirmInstance {
    /** 关闭确认框（与 Modal/Drawer 的 close 保持一致） */
    close: () => void;
    /** 销毁确认框 */
    destroy: () => void;
}

/**
 * show 方法的返回值类型。
 * 既是 PopconfirmInstance（支持同步使用），又是 PromiseLike<PopconfirmInstance>（兼容 await/.then）。
 * 这是为了向后兼容历史版本中 show 返回 Promise 的用法。
 */
export type PopconfirmResult = PopconfirmInstance & PromiseLike<PopconfirmInstance>;

export interface PopconfirmConfig {
    /** 默认确认按钮文字 */
    okText: string | HTMLElement;
    /** 默认取消按钮文字 */
    cancelText: string | HTMLElement;
    /** 默认确认按钮类型 */
    okType: 'primary' | 'danger' | 'default';
    /** 默认是否显示取消按钮 */
    showCancel: boolean;
    /** 默认气泡框位置 */
    placement: PopconfirmPlacement;
}
