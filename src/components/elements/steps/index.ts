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
class SolelySteps extends BaseElement<
    StepsProps & {
        parsedItems: StepItem[];
        useSlot: boolean;
        slotItems: Array<{ step: string; title: string; description?: string; disabled?: boolean; iconHtml: string }>;
    }
> {
    // 预设颜色列表（与 CSS 修饰类对应）
    private static readonly PRESET_COLORS = ['blue', 'green', 'red', 'orange', 'gray'];
    slotObserver?: MutationObserver;

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
        classes['use-slot'] = this.$data.useSlot;
        return classes;
    }

    getStepClasses(item: StepItem | { disabled?: boolean }, index: number): Record<string, boolean> {
        const status = this.getStepStatus(index);
        return {
            'step--wait': status === 'wait',
            'step--process': status === 'process',
            'step--finish': status === 'finish',
            'step--error': status === 'error',
            'step--disabled': !!(item as any).disabled,
        };
    }

    /**
     * 获取插槽步骤的类名
     */
    getSlotStepClasses(slotItem: { disabled?: boolean }, index: number): Record<string, boolean> {
        const status = this.getSlotStepStatus(index);
        return {
            'step--wait': status === 'wait',
            'step--process': status === 'process',
            'step--finish': status === 'finish',
            'step--error': status === 'error',
            'step--disabled': !!slotItem.disabled,
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
            return '';
        }
        return `color: ${item.color}; background-color: ${item.color}15;`;
    }

    /**
     * 从插槽收集步骤
     */
    collectSlotItems(): void {
        const children = Array.from(this.children).filter(el => el.hasAttribute('data-step'));

        if (children.length === 0) {
            this.$data.useSlot = false;
            return;
        }

        this.$data.useSlot = true;
        this.$data.slotItems = children.map((el, index) => {
            const stepEl = el as HTMLElement;
            return {
                step: stepEl.getAttribute('data-step') || String(index + 1),
                title: stepEl.getAttribute('data-title') || stepEl.textContent?.trim() || '',
                description: stepEl.getAttribute('data-description') || undefined,
                disabled: stepEl.hasAttribute('disabled'),
                // 提前保存 innerHTML，避免 Shadow DOM 中访问 Light DOM 元素的权限问题
                iconHtml: stepEl.innerHTML,
            };
        });
    }

    mounted(): void {
        this.parseItems();
        this.setupSlotObserver();
    }

    /**
     * 设置插槽观察器
     */
    setupSlotObserver(): void {
        setTimeout(() => {
            this.collectSlotItems();
        }, 0);

        this.slotObserver = new MutationObserver(() => {
            this.collectSlotItems();
        });

        this.slotObserver.observe(this, {
            childList: true,
            subtree: false,
            attributes: true,
            attributeFilter: ['data-step', 'data-title', 'data-description', 'disabled'],
        });
    }

    unmounted(): void {
        if (this.slotObserver) {
            this.slotObserver.disconnect();
        }
    }

    parseItems(): void {
        this.$data.parsedItems = safeJsonParse(this.$data.items, []);
    }

    getStepStatus(index: number): StepStatus {
        const current = this.$data.current || 0;

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

    /**
     * 获取插槽步骤的状态
     */
    getSlotStepStatus(index: number): StepStatus {
        const current = this.$data.current || 0;

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

    /**
     * 处理插槽步骤点击
     */
    handleSlotStepClick(slotItem: { disabled?: boolean; iconHtml?: string }, index: number): void {
        if (slotItem.disabled) return;

        this.$data.current = index;

        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: {
                    index,
                    item: slotItem,
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
        const maxIndex = this.$data.useSlot ? this.$data.slotItems.length - 1 : this.$data.parsedItems.length - 1;
        if (this.$data.current < maxIndex) {
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
        this.$data.useSlot = false;
        this.parseItems();
    }
}

export default SolelySteps;
export { SolelySteps };
