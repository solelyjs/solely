/**
 * FAB (Floating Action Button) 悬浮按钮类型定义
 */

/**
 * FAB 位置类型
 */
export type FabPosition =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'left-center'
    | 'center'
    | 'right-center'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

/**
 * FAB 尺寸类型
 */
export type FabSize = 'small' | 'medium' | 'large';

/**
 * FAB 形状类型
 */
export type FabShape = 'circle' | 'square' | 'rounded';

/**
 * FAB 组件属性接口
 */
export interface FabProps {
    /** 按钮类型 */
    type?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'default';
    /** 按钮尺寸 */
    size?: FabSize;
    /** 按钮形状 */
    shape?: FabShape;
    /** 悬浮位置 */
    position?: FabPosition;
    /** 水平偏移距离（像素） */
    offsetX?: number;
    /** 垂直偏移距离（像素） */
    offsetY?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 图标内容 */
    icon?: string;
    /** 是否可见 */
    visible?: boolean;
    /** 点击时是否隐藏 */
    hideOnClick?: boolean;
    /** 自定义 z-index */
    zIndex?: number;
    /** 是否在容器内使用（使用绝对定位代替 fixed） */
    absolute?: boolean;
}

/**
 * FAB 组件 Refs 接口
 */
export interface FabRefs {
    /** 按钮元素引用 */
    buttonRef: HTMLButtonElement;
    [key: string]: Element;
}
