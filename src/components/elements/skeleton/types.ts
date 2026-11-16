/**
 * Skeleton 组件类型定义
 */

export type SkeletonAvatarShape = 'circle' | 'square';
export type SkeletonAvatarPosition = 'left' | 'right';
/** 已实现的骨架元素种类；如需扩展需同步补齐模板与样式 */
export type SkeletonElement = 'avatar' | 'title' | 'paragraph';

export interface SkeletonProps {
    /** 是否显示动画效果 */
    active: boolean;
    /** 是否显示头像占位图 */
    avatar: boolean;
    /** 头像形状 */
    avatarShape: SkeletonAvatarShape;
    /** 头像大小 */
    avatarSize: number;
    /** 头像位置 */
    avatarPosition: SkeletonAvatarPosition;
    /** 是否显示标题占位图 */
    title: boolean;
    /** 标题宽度 */
    titleWidth: number | string;
    /** 段落行数 */
    paragraphRows: number;
    /** 是否显示加载结束后的内容 */
    loading: boolean;
}
