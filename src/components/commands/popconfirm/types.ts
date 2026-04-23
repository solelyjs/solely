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
    /** 确认回调 */
    onConfirm?: () => void;
    /** 取消回调 */
    onCancel?: () => void;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
}

export interface PopconfirmInstance {
    /** 销毁确认框 */
    destroy: () => void;
}

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
