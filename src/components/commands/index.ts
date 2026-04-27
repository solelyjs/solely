/**
 * Solely 组件库 - 命令式组件统一导出
 */

export { Message } from './message';
export { Modal } from './modal';
export { Tooltip } from './tooltip';
export { Drawer } from './drawer';
export { Popconfirm } from './popconfirm';

// 导出类型
export type { MessageOptions, MessageInstance, MessageConfig, MessageType, MessagePlacement } from './message/types';
export type { ModalOptions, ModalInstance, ModalConfig, ModalType, ModalButton } from './modal/types';
export type { TooltipOptions, TooltipInstance, TooltipConfig, TooltipPlacement, TooltipTrigger } from './tooltip/types';
export type { DrawerOptions, DrawerInstance, DrawerConfig, DrawerPlacement } from './drawer/types';
export type { PopconfirmOptions, PopconfirmInstance, PopconfirmConfig, PopconfirmPlacement } from './popconfirm/types';

// 导出共享工具函数和常量
export {
    generateId,
    injectStyle,
    removeStyle,
    createElement,
    calculatePosition,
    safeAsyncCallback,
    addClosingAnimation,
    ANIMATION_DURATION,
    Z_INDEX,
} from './utils';

export type { PositionResult, Placement } from './utils';
