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
    /** 是否显示辅助图标 */
    showIcon: boolean;
    /** 是否块级显示 */
    block: boolean;
}
