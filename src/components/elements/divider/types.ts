/**
 * Divider 组件类型定义
 */

export type DividerType = 'horizontal' | 'vertical';
export type DividerOrientation = 'left' | 'right' | 'center';

export interface DividerProps {
    /** 水平还是垂直类型 */
    type: DividerType;
    /** 分割线标题的位置 */
    orientation: DividerOrientation;
    /** 是否虚线 */
    dashed: boolean;
    /** 标题文字 */
    content: string;
}
