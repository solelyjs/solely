/**
 * Alert 组件类型定义
 */

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
    /** 警告提示类型 */
    type: AlertType;
    /** 警告提示内容 */
    message: string;
    /** 警告提示的辅助性文字介绍 */
    description: string;
    /** 是否显示关闭按钮 */
    closable: boolean;
    /** 是否显示辅助图标（默认 false，即默认不显示） */
    showIcon: boolean;
    /** 自定义图标；空字符串表示不要图标；未设置时按 type 使用内置图标 */
    icon: string | null;
    /** 是否块级显示 */
    block: boolean;
    /** 自动关闭延时（毫秒），0 表示不自动关闭 */
    autoClose: number;
}
