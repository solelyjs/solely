/**
 * Tooltip 共享类型定义
 * 供 elements 和 commands 模块复用
 */

export type TooltipPlacement =
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'leftTop'
    | 'leftBottom'
    | 'rightTop'
    | 'rightBottom';

export type TooltipTrigger = 'hover' | 'click' | 'focus' | 'manual';
