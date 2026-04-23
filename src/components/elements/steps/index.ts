import { BaseElement, CustomElement } from '../../../runtime/component';
import type { StepsProps, StepItem, StepStatus } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-steps',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'current', type: 'number', default: 0 },
        { name: 'direction', type: 'string', default: 'horizontal' },
        { name: 'size', type: 'string', default: 'default' },
        { name: 'items', type: 'string', default: '[]' },
        { name: 'progressDot', type: 'boolean', default: false },
    ],
})
class SolelySteps extends BaseElement<StepsProps & { parsedItems: StepItem[] }> {
    // 预设颜色列表（与 CSS 修饰类对应）
    private static readonly PRESET_COLORS = ['blue', 'green', 'red', 'orange', 'gray'];

    get current(): number {
        return this.$data.current;
    }

    set current(value: number) {
        this.$data.current = value;
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    getStepsClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.direction) {
            classes[`steps--${this.$data.direction}`] = true;
        }
        classes['steps--dot'] = !!this.$data.progressDot;
        if (this.$data.size === 'small') {
            classes['steps--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['steps--lg'] = true;
        }
        return classes;
    }

    getStepClasses(item: StepItem, index: number): Record<string, boolean> {
        const status = this.getStepStatus(index);
        return {
            'step--wait': status === 'wait',
            'step--process': status === 'process',
            'step--finish': status === 'finish',
            'step--error': status === 'error',
            'step--disabled': !!item.disabled,
            'step--has-icon': !!item.icon && !this.$data.progressDot,
        };
    }

    /**
     * 获取图标包裹器的类名（用于预设颜色）
     */
    getIconClasses(item: StepItem): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (item.icon && item.color && SolelySteps.PRESET_COLORS.includes(item.color)) {
            classes[`step__icon-wrapper--${item.color}`] = true;
        }
        return classes;
    }

    /**
     * 获取图标包裹器的内联样式（仅处理自定义颜色）
     */
    getIconStyle(item: StepItem): string {
        if (!item.icon || !item.color) return '';
        if (SolelySteps.PRESET_COLORS.includes(item.color)) {
            // 预设颜色由 CSS 类控制，不输出内联样式
            return '';
        }
        // 自定义颜色：文字色用 color，背景色用 8% 透明度
        return `color: ${item.color}; background-color: ${item.color}15;`;
    }

    mounted(): void {
        this.parseItems();
    }

    parseItems(): void {
        this.$data.parsedItems = safeJsonParse(this.$data.items, []);
    }

    getStepStatus(index: number): StepStatus {
        const current = this.$data.current || 0;

        // 边界检查
        if (!Array.isArray(this.$data.parsedItems) || index < 0 || index >= this.$data.parsedItems.length) {
            return 'wait';
        }

        const item = this.$data.parsedItems[index];

        if (item?.status) {
            return item.status;
        }

        if (index < current) {
            return 'finish';
        } else if (index === current) {
            return 'process';
        } else {
            return 'wait';
        }
    }

    getStepIcon(item: StepItem, index: number): string {
        if (item.icon) {
            return item.icon;
        }

        const status = this.getStepStatus(index);

        if (status === 'finish') {
            return '✓';
        } else if (status === 'error') {
            return '✕';
        } else {
            return String(index + 1);
        }
    }

    handleStepClick(item: StepItem, index: number): void {
        if (item.disabled) return;

        this.$data.current = index;

        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: {
                    index,
                    item,
                },
            }),
        );
    }

    public setCurrent(current: number): void {
        this.$data.current = current;
    }

    public getCurrent(): number {
        return this.$data.current;
    }

    public next(): void {
        if (this.$data.current < this.$data.parsedItems.length - 1) {
            this.$data.current++;
        }
    }

    public prev(): void {
        if (this.$data.current > 0) {
            this.$data.current--;
        }
    }

    public setItems(items: StepItem[]): void {
        this.$data.items = JSON.stringify(items);
        this.parseItems();
    }
}

export default SolelySteps;
export { SolelySteps };
