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
    /** 是否显示图标，默认 true；false 优先级最高，即使传了 icon 也不渲染 */
    showIcon?: boolean;
    /** 自定义图标；空字符串表示不要图标；未设置时使用内置 warning 线性 SVG 图标 */
    icon?: string | Element;
    /**
     * 确认回调。
     *
     * 返回 Promise 时：pending 期间浮层保持打开、按钮进入 loading 且不可重复触发；
     * resolve 后关闭；reject 时保持打开并展示失败信息。
     */
    onConfirm?: () => void | Promise<unknown>;
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
