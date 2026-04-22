/**
 * Badge 组件类型定义
 */

export type BadgeStatus = 'success' | 'processing' | 'default' | 'error' | 'warning';

export interface BadgeProps {
    /** 显示的数字，大于 overflowCount 时显示为 ${overflowCount}+ */
    count: number;
    /** 不展示数字，只有一个小红点 */
    dot: boolean;
    /** 展示封顶的数字值 */
    overflowCount: number;
    /** 设置状态点的颜色 */
    status: BadgeStatus;
    /** 在设置了 status 的前提下有效，设置状态点的文本 */
    text: string;
    /** 自定义标题，当鼠标悬停时显示 */
    title: string;
    /** 内容的偏移量，格式为 [x, y] */
    offset: string;
    /** 背景颜色 */
    color: string;
}
