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
    /** 是否允许点击/键盘切换步骤（默认 false，仅展示） */
    clickable: boolean;
}

/** 步骤项（插槽模式，从 Light DOM 收集） */
export interface StepsSlotItem {
    step: string;
    title: string;
    description?: string;
    disabled?: boolean;
    /** 图标 HTML；为空时回退到线性 SVG 状态图标或序号 */
    iconHtml: string;
    /** 图标配色，支持预设色（blue/green/red/orange/gray）或自定义颜色值 */
    color?: string;
}

/** change 事件 detail（所有触发路径统一为该形状） */
export interface StepsChangeEventDetail {
    /** 当前步骤下标（与 index 相同，保留 current 以贴合文档） */
    current: number;
    index: number;
    item: StepItem | StepsSlotItem | undefined;
}
