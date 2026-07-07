export type StepsDirection = 'horizontal' | 'vertical';
export type StepsSize = 'small' | 'medium' | 'large';
export type StepStatus = 'wait' | 'process' | 'finish' | 'error';

export interface StepItem {
    title: string;
    description?: string;
    icon?: string;
    status?: StepStatus;
    disabled?: boolean;
    color?: string;
}

export interface StepsProps {
    current: number;
    direction: StepsDirection;
    size: StepsSize;
    items: string;
    progressDot: boolean;
}

/** 步骤项（插槽模式，从 Light DOM 收集） */
export interface StepsSlotItem {
    step: string;
    title: string;
    description?: string;
    disabled?: boolean;
    iconHtml: string;
}

/** change 事件 detail */
export interface StepsChangeEventDetail {
    index: number;
    item: StepItem | StepsSlotItem;
}
