export type TimelineMode =
    | 'left'
    | 'right'
    | 'alternate'
    | 'horizontal-top'
    | 'horizontal-bottom'
    | 'horizontal-alternate';
export type TimelineItemPosition = 'left' | 'right';
export type TimelineItemVerticalPosition = 'top' | 'bottom';
export type TimelineVariant = 'filled' | 'outlined';

export interface TimelineItem {
    title: string;
    content?: string;
    time?: string;
    label?: string;
    color?: string;
    position?: TimelineItemPosition;
    verticalPosition?: TimelineItemVerticalPosition;
    icon?: string;
    loading?: boolean;
}

export interface TimelineProps {
    mode?: TimelineMode;
    items?: string;
    pending?: boolean;
    pendingContent?: string;
    reverse?: boolean;
    variant?: TimelineVariant;
}
