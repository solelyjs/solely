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
    /** 内容的模板字符串（支持 {percent}）或格式化函数（line 与 circle 均有效） */
    format: string | ((percent: number) => string);
    /** 进度条的可访问名称（aria-label） */
    label: string;
}
