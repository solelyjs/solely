/**
 * Tag 组件类型定义
 */

export type TagType = 'default' | 'primary' | 'success' | 'warning' | 'error';
export type TagSize = 'small' | 'medium' | 'large';

export interface TagProps {
    /** 标签类型 */
    type: TagType;
    /** 标签尺寸 */
    size: TagSize;
    /** 标签内容 */
    content: string;
    /** 是否可关闭 */
    closable: boolean;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否为圆角 */
    round: boolean;
    /** 边框颜色（自定义颜色时） */
    color: string;
}
