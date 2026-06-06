/**
 * Tooltip 组件类型定义
 */

import type { TooltipPlacement, TooltipTrigger } from '../../tooltip-types';
export type { TooltipPlacement, TooltipTrigger };

export interface TooltipProps {
    /** 提示内容 */
    content: string;
    /** 气泡框位置 */
    placement: TooltipPlacement;
    /** 触发方式 */
    trigger: TooltipTrigger;
    /** 是否显示 */
    visible: boolean;
    /** 背景颜色 */
    color: string;
    /** 最大宽度 */
    maxWidth: number;
}

export interface TooltipRefs extends Record<string, Element> {
    tooltipRef: HTMLElement;
    arrowRef: HTMLElement;
}
