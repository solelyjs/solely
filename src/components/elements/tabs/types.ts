/**
 * Tabs 组件类型定义
 */

export type TabsType = 'line' | 'card';
export type TabsPosition = 'top' | 'right' | 'bottom' | 'left';
export type TabsSize = 'small' | 'default' | 'large';

export interface TabItem {
    /** 标签页标题 */
    label: string;
    /** 标签页标识 */
    key: string;
    /** 是否禁用 */
    disabled?: boolean;
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
}
