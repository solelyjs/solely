import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { oneOf } from '../../../shared/enum';
import { STATUS_ICON_PATHS } from '../../../shared/icons';
import { parseBooleanAttribute } from '../../../shared/boolean';
import type { StepsProps, StepItem, StepStatus, StepsSlotItem, StepsChangeEventDetail, StepsSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-steps',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'current', type: 'number', default: 0 },
        { name: 'direction', type: 'string', default: 'horizontal' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'items', type: 'string', default: '[]' },
        { name: 'progressDot', type: 'boolean', default: false },
        { name: 'clickable', type: 'boolean', default: false },
    ],
})
class SolelySteps extends BaseElement<
    StepsProps & {
        useSlot: boolean;
        slotItems: StepsSlotItem[];
    }
> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): StepsSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    // 预设颜色列表（与 CSS 修饰类对应）
    private static readonly PRESET_COLORS = ['blue', 'green', 'red', 'orange', 'gray'];
    slotObserver?: MutationObserver;
    private slotInitTimer?: number;

    get current(): number {
        return this.$data.current;
    }

    set current(value: number) {
        if (value === this.$data.current) return;
        this.$data.current = value;
        // 框架初始化/attribute 同步/属性升级期间不派发业务事件
        if (this.isSyncingProps) return;
        this.emitChange(value);
    }

    /** 当前步骤方向（非法值回退 horizontal） */
    getDirection(): 'horizontal' | 'vertical' {
        return oneOf(this.$data.direction, ['horizontal', 'vertical'], 'horizontal');
    }

    /** 当前步骤对应的数据项（items / 插槽两种模式） */
    getStepItem(index: number): StepItem | StepsSlotItem | undefined {
        return this.$data.useSlot ? this.$data.slotItems[index] : this.getParsedItems()[index];
    }

    /**
     * 统一的 change 事件出口
     *
     * 点击、键盘、public API（next/prev/setCurrent）与属性赋值都走这里，
     * detail 固定为 `{ current, index, item }`，避免同一事件出现两种形状。
     */
    private emitChange(index: number): void {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: {
                    current: index,
                    index,
                    item: this.getStepItem(index),
                } as StepsChangeEventDetail,
            }),
        );
    }

    getStepsClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        classes[`steps--${this.getDirection()}`] = true;
        classes['steps--dot'] = !!this.$data.progressDot;
        if (this.$data.size === 'small') {
            classes['steps--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['steps--lg'] = true;
        } else {
            classes['steps--md'] = true;
        }
        classes['use-slot'] = this.$data.useSlot;
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
            'step--clickable': this.isStepClickable(item),
            'step--has-icon': this.hasVisibleIcon(item),
        };
    }

    /**
     * 获取插槽步骤的类名
     */
    getSlotStepClasses(slotItem: StepsSlotItem, index: number): Record<string, boolean> {
        const status = this.getSlotStepStatus(index);
        return {
            'step--wait': status === 'wait',
            'step--process': status === 'process',
            'step--finish': status === 'finish',
            'step--error': status === 'error',
            'step--disabled': !!slotItem.disabled,
            'step--clickable': this.isStepClickable(slotItem),
            'step--has-icon': this.hasVisibleIcon(slotItem),
        };
    }

    /**
     * 是否渲染了可见的图标
     *
     * items 模式看 item.icon，插槽模式看 iconHtml；点状模式下图标内容被隐藏，
     * 因此不输出 step--has-icon，避免图标包裹器样式覆盖点状样式。
     */
    private hasVisibleIcon(item: { icon?: string; iconHtml?: string }): boolean {
        if (this.$data.progressDot) return false;
        return !!(item.icon || item.iconHtml);
    }

    /**
     * 当前步骤是否可交互（clickable 开启且未禁用）
     */
    private isStepClickable(item: { disabled?: boolean }): boolean {
        return !!this.$data.clickable && !item.disabled;
    }

    /**
     * 步骤节点的语义角色：仅可交互时为 button，否则保持列表项语义
     */
    getStepRole(item: { disabled?: boolean }): string {
        return this.isStepClickable(item) ? 'button' : 'listitem';
    }

    /**
     * 步骤节点的 tabindex：仅可交互时可聚焦
     */
    getStepTabIndex(item: { disabled?: boolean }): string | undefined {
        return this.isStepClickable(item) ? '0' : undefined;
    }

    /**
     * 获取图标包裹器的类名（用于预设颜色）
     *
     * items 与插槽模式共用：只要渲染了可见图标且提供了 color 就生效。
     */
    getIconClasses(item: { icon?: string; iconHtml?: string; color?: string }): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.hasVisibleIcon(item) && item.color && SolelySteps.PRESET_COLORS.includes(item.color)) {
            classes[`step__icon-wrapper--${item.color}`] = true;
        }
        return classes;
    }

    /**
     * 获取图标包裹器的内联样式（仅处理自定义颜色）
     */
    getIconStyle(item: { icon?: string; iconHtml?: string; color?: string }): string {
        if (!this.hasVisibleIcon(item) || !item.color) return '';
        if (SolelySteps.PRESET_COLORS.includes(item.color)) {
            return '';
        }
        return `color: ${item.color}; background-color: ${item.color}15;`;
    }

    /**
     * 状态图标的 SVG path（finish → 勾，error → 叉；其余不返回图标）
     */
    getStatusIconPath(status: string): string {
        return status === 'error' ? STATUS_ICON_PATHS.close : STATUS_ICON_PATHS.check;
    }

    /**
     * 获取插槽步骤的图标回退内容
     *
     * 插槽元素没有提供图标内容时，与 items 模式一致：已完成 / 出错改由线性 SVG 承载，
     * 其余显示序号，避免渲染出空圆圈。
     */
    getSlotStepIcon(index: number): string {
        const status = this.getSlotStepStatus(index);
        if (status === 'finish' || status === 'error') return '';
        return String(index + 1);
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
            // 纯空白内容视为没有提供图标，交由 getSlotStepIcon 回退
            const iconHtml = stepEl.innerHTML.trim() ? stepEl.innerHTML : '';
            return {
                step: stepEl.getAttribute('data-step') || String(index + 1),
                title: stepEl.getAttribute('data-title') || stepEl.textContent?.trim() || '',
                description: stepEl.getAttribute('data-description') || undefined,
                disabled: parseBooleanAttribute(stepEl.getAttribute('disabled')),
                // 提前保存 innerHTML，避免 Shadow DOM 中访问 Light DOM 元素的权限问题
                // 安全说明：此处不做 sanitizeSvg 消毒——内容来自开发者自己编写的
                // light DOM 插槽标记（与组件模板同等信任级），且 sanitizeSvg 是 SVG
                // 元素白名单，套用到任意 HTML 上会把 <img>/<span> 等合法内容一并删除。
                // 若将来支持接收不可信的插槽内容，需要引入独立的 HTML 消毒策略。
                iconHtml,
                color: stepEl.getAttribute('data-color') || undefined,
            };
        });
    }

    mounted(): void {
        this.refresh();
        this.setupSlotObserver();
    }

    /**
     * 获取解析后的步骤项
     */
    getParsedItems(): StepItem[] {
        const value = this.$data.items;
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string' && value) {
            return safeJsonParse(value, []);
        }
        return [];
    }

    /**
     * 设置插槽观察器
     */
    setupSlotObserver(): void {
        this.slotInitTimer = setTimeout(() => {
            this.collectSlotItems();
            this.slotInitTimer = undefined;
        }, 0) as unknown as number;

        this.slotObserver = new MutationObserver(() => {
            this.collectSlotItems();
        });

        this.slotObserver.observe(this, {
            childList: true,
            subtree: false,
            attributes: true,
            attributeFilter: ['data-step', 'data-title', 'data-description', 'data-color', 'disabled'],
        });
    }

    unmounted(): void {
        if (this.slotObserver) {
            this.slotObserver.disconnect();
        }
        if (this.slotInitTimer) {
            clearTimeout(this.slotInitTimer);
            this.slotInitTimer = undefined;
        }
    }

    getStepStatus(index: number): StepStatus {
        const current = this.$data.current || 0;
        const parsedItems = this.getParsedItems();

        if (!Array.isArray(parsedItems) || index < 0 || index >= parsedItems.length) {
            return 'wait';
        }

        const item = parsedItems[index];

        const explicitStatus = oneOf(item?.status, ['wait', 'process', 'finish', 'error'], 'wait');
        if (item?.status && explicitStatus === item.status) {
            return explicitStatus;
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

        if (status === 'finish' || status === 'error') {
            return '';
        } else {
            return String(index + 1);
        }
    }

    handleStepClick(item: StepItem, index: number): void {
        if (!this.isStepClickable(item)) return;

        // 点击/键盘即使落在当前步骤也给出反馈，因此这里不经过 current 的“值未变化”短路
        this.$data.current = index;
        this.emitChange(index);
    }

    /**
     * 处理插槽步骤点击
     */
    handleSlotStepClick(item: StepsSlotItem, index: number): void {
        if (!this.isStepClickable(item)) return;

        this.$data.current = index;
        this.emitChange(index);
    }

    /**
     * 步骤节点键盘事件（Enter / Space 等价于点击）
     */
    handleStepKeydown(item: StepItem, index: number, event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleStepClick(item, index);
        }
    }

    /**
     * 插槽步骤节点键盘事件（Enter / Space 等价于点击）
     */
    handleSlotStepKeydown(slotItem: StepsSlotItem, index: number, event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleSlotStepClick(slotItem, index);
        }
    }

    public setCurrent(current: number): void {
        this.current = current;
    }

    public getCurrent(): number {
        return this.$data.current;
    }

    public next(): void {
        const maxIndex = this.$data.useSlot ? this.$data.slotItems.length - 1 : this.getParsedItems().length - 1;
        if (this.$data.current < maxIndex) {
            this.current = this.$data.current + 1;
        }
    }

    public prev(): void {
        if (this.$data.current > 0) {
            this.current = this.$data.current - 1;
        }
    }

    public setItems(items: StepItem[]): void {
        this.$data.items = JSON.stringify(items);
        this.$data.useSlot = false;
        this.refresh();
    }
}

export default SolelySteps;
export { SolelySteps };
