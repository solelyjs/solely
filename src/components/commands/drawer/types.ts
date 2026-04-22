/**
 * Drawer 组件类型定义
 */

export type DrawerPlacement = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerOptions {
    /** 标题 */
    title?: string;
    /** 内容 */
    content?: string;
    /** 抽屉方向 */
    placement?: DrawerPlacement;
    /** 宽度（placement为left或right时有效） */
    width?: number | string;
    /** 高度（placement为top或bottom时有效） */
    height?: number | string;
    /** 是否显示遮罩 */
    mask?: boolean;
    /** 是否可点击遮罩关闭 */
    maskClosable?: boolean;
    /** 是否显示关闭按钮 */
    closable?: boolean;
    /** 关闭后回调 */
    onClose?: () => void;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
    /** 抽屉内容的样式 */
    bodyStyle?: Partial<CSSStyleDeclaration>;
}

export interface DrawerInstance {
    /** 关闭抽屉 */
    close: () => void;
    /** 更新抽屉选项 */
    update: (options: Partial<DrawerOptions>) => void;
}

export interface DrawerConfig {
    /** 默认宽度 */
    width: number | string;
    /** 默认高度 */
    height: number | string;
    /** 默认是否显示遮罩 */
    mask: boolean;
    /** 默认是否可点击遮罩关闭 */
    maskClosable: boolean;
    /** 默认是否显示关闭按钮 */
    closable: boolean;
}
