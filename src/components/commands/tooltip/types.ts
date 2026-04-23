/**
 * Tooltip 组件类型定义
 */

export type TooltipPlacement =
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
export type TooltipTrigger = 'hover' | 'click' | 'focus' | 'manual';

export interface TooltipOptions {
    /** 提示内容 */
    content?: string | HTMLElement;
    /** 气泡框位置 */
    placement?: TooltipPlacement;
    /** 触发方式 */
    trigger?: TooltipTrigger;
    /** 默认是否显隐 */
    defaultVisible?: boolean;
    /** 用于手动控制浮层显隐 */
    visible?: boolean;
    /** 显示隐藏的回调 */
    onVisibleChange?: (visible: boolean) => void;
    /** 背景颜色 */
    color?: string;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
    /** 浮层渲染节点 */
    getPopupContainer?: () => HTMLElement;
}

export interface TooltipInstance {
    /** 显示提示 */
    show: () => void;
    /** 隐藏提示 */
    hide: () => void;
    /** 销毁提示 */
    destroy: () => void;
}

export interface TooltipConfig {
    /** 默认位置 */
    placement: TooltipPlacement;
    /** 默认触发方式 */
    trigger: TooltipTrigger;
    /** 默认显示时长（show 方法使用） */
    duration: number;
}
