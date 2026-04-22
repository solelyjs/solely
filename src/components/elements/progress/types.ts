/**
 * Progress 组件类型定义
 */

export type ProgressType = 'line' | 'circle';
export type ProgressStatus = 'normal' | 'success' | 'exception' | 'active';

export interface ProgressProps {
    /** 类型 */
    type: ProgressType;
    /** 百分比 */
    percent: number;
    /** 状态 */
    status: ProgressStatus;
    /** 是否显示进度数值或状态图标 */
    showInfo: boolean;
    /** 进度条线的宽度 */
    strokeWidth: number;
    /** 进度条线的宽度（仅在 type="circle" 时有效） */
    width: number;
    /** 内容的模板函数（仅在 type="line" 时有效） */
    format: string;
}
