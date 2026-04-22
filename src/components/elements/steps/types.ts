export type StepsDirection = 'horizontal' | 'vertical';
export type StepsSize = 'default' | 'small' | 'large';
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
