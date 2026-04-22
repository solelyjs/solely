import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TimelineProps, TimelineItem } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-timeline',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'mode', type: 'string', default: 'left' },
        { name: 'items', type: 'string', default: '[]' },
        { name: 'pending', type: 'boolean', default: false },
        { name: 'pendingContent', type: 'string', default: '待定' },
        { name: 'reverse', type: 'boolean', default: false },
        { name: 'variant', type: 'string', default: 'outlined' },
    ],
})
class SolelyTimeline extends BaseElement<TimelineProps & { parsedItems: TimelineItem[] }> {
    isHorizontal(): boolean {
        return this.$data.mode?.startsWith('horizontal-') ?? false;
    }

    isAlternate(): boolean {
        return this.$data.mode === 'alternate' || this.$data.mode === 'horizontal-alternate';
    }

    getTimelineClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.mode) {
            classes[`timeline--${this.$data.mode}`] = true;
        }
        if (this.$data.variant === 'filled') {
            classes['timeline--filled'] = true;
        }
        return classes;
    }

    getItemClasses(item: TimelineItem, index: number): Record<string, boolean> {
        const isVerticalAlternate = this.$data.mode === 'alternate';
        const isHorizontalAlternate = this.$data.mode === 'horizontal-alternate';
        let isLeft = false;
        let isRight = false;
        let isTop = false;
        let isBottom = false;

        if (isVerticalAlternate) {
            if (item.position === 'left') {
                isLeft = true;
            } else if (item.position === 'right') {
                isRight = true;
            } else {
                isLeft = index % 2 === 0;
                isRight = index % 2 === 1;
            }
        } else if (isHorizontalAlternate) {
            if (item.verticalPosition === 'top') {
                isTop = true;
            } else if (item.verticalPosition === 'bottom') {
                isBottom = true;
            } else {
                isTop = index % 2 === 0;
                isBottom = index % 2 === 1;
            }
        }

        return {
            'timeline__item--left': isLeft,
            'timeline__item--right': isRight,
            'timeline__item--top': isTop,
            'timeline__item--bottom': isBottom,
            'timeline__item--loading': !!item.loading,
        };
    }

    getDotClasses(item: TimelineItem): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        const presetColors = ['blue', 'green', 'red', 'orange', 'gray'];
        if (item.color && presetColors.includes(item.color)) {
            classes[`timeline__dot--${item.color}`] = true;
        }
        return classes;
    }

    // 预设颜色列表（与 CSS 修饰类对应）
    private static readonly PRESET_COLORS = ['blue', 'green', 'red', 'orange', 'gray'];

    /**
     * 获取点的内联样式（仅处理自定义颜色）
     */
    getDotStyle(item: TimelineItem): string {
        const color = item.color;
        if (!color || SolelyTimeline.PRESET_COLORS.includes(color)) {
            return '';
        }

        if (this.$data.variant === 'filled') {
            // Filled 变体：背景色使用自定义颜色
            return `background-color: ${color};`;
        }
        // Outlined 变体：边框色使用自定义颜色
        return `border-color: ${color};`;
    }

    /**
     * 获取图标的内联样式（仅处理自定义颜色）
     */
    getIconStyle(item: TimelineItem): string {
        const color = item.color;
        if (!color || SolelyTimeline.PRESET_COLORS.includes(color)) {
            return '';
        }

        // 图标文字颜色使用自定义色，背景使用 8% 透明度（约 15 十六进制）
        const bgColor = `${color}15`; // 等同于 rgba 8% 不透明度
        return `color: ${color}; background-color: ${bgColor};`;
    }

    mounted(): void {
        this.parseItems();
    }

    parseItems(): void {
        try {
            let items = JSON.parse(this.$data.items || '[]');
            if (this.$data.reverse) {
                items = items.reverse();
            }
            this.$data.parsedItems = items;
        } catch {
            this.$data.parsedItems = [];
        }
    }

    public setItems(items: TimelineItem[]): void {
        this.$data.items = JSON.stringify(items);
        this.parseItems();
    }
}

export default SolelyTimeline;
export { SolelyTimeline };
