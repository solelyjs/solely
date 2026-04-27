export type MessageType = 'info' | 'success' | 'warning' | 'error' | 'loading';
export type MessagePlacement =
    | 'top'
    | 'topLeft'
    | 'topRight'
    | 'bottom'
    | 'bottomLeft'
    | 'bottomRight'
    | 'left'
    | 'right';

export interface MessageOptions {
    /** 消息内容 */
    content?: string | HTMLElement;
    /** 消息类型，默认 'info' */
    type?: MessageType;
    /** 自动关闭延时（毫秒），设为 0 则不自动关闭，默认 3000 */
    duration?: number;
    /** 是否显示关闭按钮 */
    closable?: boolean;
    /** 是否显示图标，默认 true */
    showIcon?: boolean;
    /** 自定义图标（字符串或 DOM 元素） */
    icon?: string | HTMLElement;
    /** 辅助描述文本 */
    description?: string | HTMLElement;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: Partial<CSSStyleDeclaration>;
    /** 关闭时的回调 */
    onClose?: () => void;
    /** 消息位置，默认 'top' */
    placement?: MessagePlacement;
}

export interface MessageInstance {
    /** 手动关闭当前消息 */
    close: () => void;
    /** 更新消息内容或描述 */
    update: (content: string | HTMLElement | Partial<Pick<MessageOptions, 'content' | 'description'>>) => void;
}

export interface MessageConfig {
    /** 默认自动关闭延时 */
    duration: number;
    /** 最大显示数量 */
    maxCount: number;
    /** 消息之间的垂直间距 */
    gap: number;
    /** 距离顶部的偏移量 */
    top: number;
    /** 距离底部的偏移量 */
    bottom: number;
    /** 距离左侧的偏移量 */
    left: number;
    /** 距离右侧的偏移量 */
    right: number;
    /** 默认位置 */
    placement: MessagePlacement;
}
