/**
 * Tabs 组件类型定义
 */

export type TabsType = 'line' | 'card';
export type TabsPosition = 'top' | 'right' | 'bottom' | 'left';
export type TabsSize = 'small' | 'medium' | 'large';

export interface TabItem {
    /** 标签页标题 */
    label: string;
    /** 标签页标识 */
    key: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 标题前方的图标（字符串，通常是图标字符或 SVG 片段） */
    icon?: string;
    /** 标题后方的徽标文本，例如未读数量 */
    badge?: string;
}

export interface TabsProps {
    /** 当前激活标签页的 key */
    activeKey: string;
    /** 标签页类型 */
    type: TabsType;
    /** 标签页位置 */
    position: TabsPosition;
    /** 标签页大小 */
    size: TabsSize;
    /** 标签页数据（JSON字符串） */
    items: string;
    /** 是否可关闭 */
    closable: boolean;
    /** 是否可新增 */
    addable: boolean;
    /** 标签栏是否居中 */
    centered: boolean;
    /** 是否懒渲染非激活面板（首次激活后才挂载面板插槽） */
    lazy: boolean;
    /** 标签栏的可访问名称（aria-label） */
    label: string;
}

/** close 事件 detail */
export interface TabsCloseEventDetail {
    key: string;
    label: string;
}

/** add 事件 detail */
export interface TabsAddEventDetail {
    key: string;
    label: string;
}
