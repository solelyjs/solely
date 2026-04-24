/**
 * Solely Select 组件
 * 下拉选择器组件，支持 options 属性和插槽两种方式
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { SelectProps, SelectOption as SelectOptionType } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-select',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'string', default: '' },
        { name: 'placeholder', type: 'string', default: '请选择' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'clearable', type: 'boolean', default: false },
        { name: 'options', type: 'array', default: [] },
        { name: 'multiple', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelySelect extends BaseElement<
    SelectProps & {
        focused: boolean;
        isOpen: boolean;
        closing: boolean;
        selectedLabel: string;
        parsedOptions: SelectOptionType[];
        dropdownPlacement: 'top' | 'bottom';
        useSlot: boolean; // 是否使用插槽
        slotOptions: Array<{ value: string; label: string; disabled: boolean; element: Element }>;
    }
> {
    clickOutsideHandler?: (event: MouseEvent) => void;
    slotObserver?: MutationObserver;

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问
     */
    get value(): string {
        return this.$data.value || '';
    }

    set value(newValue: string) {
        if (this.$data.disabled) return;
        this.setValue(newValue);
    }

    /**
     * 获取 select class 对象
     */
    getSelectClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['select--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['select--lg'] = true;
        } else {
            classes['select--md'] = true;
        }
        classes['is-disabled'] = !!this.$data.disabled;
        classes['is-focused'] = !!this.$data.focused;
        classes['is-open'] = !!this.$data.isOpen;
        classes['use-slot'] = this.$data.useSlot;
        return classes;
    }

    /**
     * 获取 dropdown class 对象
     */
    getDropdownClasses(): Record<string, boolean> {
        return {
            'select__dropdown--closing': !!this.$data.closing,
            'select__dropdown--top': this.$data.dropdownPlacement === 'top',
            'select__dropdown--bottom': this.$data.dropdownPlacement === 'bottom',
        };
    }

    /**
     * 获取 option class 对象
     */
    getOptionClasses(option: SelectOptionType | { value: string; disabled?: boolean }): Record<string, boolean> {
        return {
            'select__option--selected': option.value === this.$data.value,
            'select__option--disabled': !!option.disabled,
        };
    }

    /**
     * 计算下拉框位置
     * 根据视口空间自动决定向上或向下展开
     */
    calculateDropdownPlacement(): void {
        const rect = this.getBoundingClientRect();
        const dropdownHeight = 256; // max-height
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // 如果下方空间不足且上方空间充足，则向上展开
        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            this.$data.dropdownPlacement = 'top';
        } else {
            this.$data.dropdownPlacement = 'bottom';
        }
    }

    /**
     * 从插槽收集选项
     */
    collectSlotOptions(): void {
        // 获取直接子元素（排除 shadow root 的内部元素）
        const children = Array.from(this.children).filter(el => el.hasAttribute('data-value'));

        if (children.length === 0) {
            this.$data.useSlot = false;
            return;
        }

        this.$data.useSlot = true;
        this.$data.slotOptions = children.map(el => {
            const optionEl = el as HTMLElement;
            return {
                value: optionEl.getAttribute('data-value') || '',
                label: optionEl.getAttribute('data-label') || optionEl.textContent?.trim() || '',
                disabled: optionEl.hasAttribute('disabled'),
                element: el,
            };
        });

        // 更新选中的标签
        this.updateSelectedLabelFromSlot();
    }

    /**
     * 从插槽更新选中的标签
     */
    updateSelectedLabelFromSlot(): void {
        if (!this.$data.slotOptions.length) return;
        const selectedOption = this.$data.slotOptions.find(opt => opt.value === this.$data.value);
        this.$data.selectedLabel = selectedOption?.label || '';
    }

    mounted(): void {
        this.parseOptions();

        // 监听插槽变化
        this.setupSlotObserver();

        // 点击外部关闭下拉菜单
        this.clickOutsideHandler = (event: MouseEvent) => {
            const path = event.composedPath();
            const isInside = path.some(el => el === this);
            if (!isInside) {
                this.closeDropdown();
            }
        };
        document.addEventListener('click', this.clickOutsideHandler);
    }

    /**
     * 设置插槽观察器
     */
    setupSlotObserver(): void {
        // 延迟收集插槽选项，确保子元素已渲染
        setTimeout(() => {
            this.collectSlotOptions();
        }, 0);

        // 监听子元素变化
        this.slotObserver = new MutationObserver(() => {
            this.collectSlotOptions();
        });

        this.slotObserver.observe(this, {
            childList: true,
            subtree: false,
            attributes: true,
            attributeFilter: ['data-value', 'data-label', 'disabled'],
        });
    }

    unmounted(): void {
        if (this.clickOutsideHandler) {
            document.removeEventListener('click', this.clickOutsideHandler);
        }
        if (this.slotObserver) {
            this.slotObserver.disconnect();
        }
    }

    /**
     * 数据更新后同步显示标签
     * 当 s-model 等外部方式修改 value 时，需要更新 selectedLabel
     */
    updated(): void {
        const currentLabel = this.$data.selectedLabel;
        const expectedLabel = this.getCurrentLabel();

        if (currentLabel !== expectedLabel) {
            this.$data.selectedLabel = expectedLabel;
        }
    }

    /**
     * 获取当前选中值对应的标签
     */
    private getCurrentLabel(): string {
        if (this.$data.useSlot) {
            const slotOption = this.$data.slotOptions.find(opt => opt.value === this.$data.value);
            return slotOption?.label || '';
        } else {
            const option = this.$data.parsedOptions.find((opt: SelectOptionType) => opt.value === this.$data.value);
            return option?.label || '';
        }
    }

    /**
     * 解析选项
     */
    parseOptions(): void {
        this.$data.parsedOptions = Array.isArray(this.$data.options) ? this.$data.options : [];
        if (!this.$data.useSlot) {
            this.updateSelectedLabel();
        }
    }

    /**
     * 更新选中的标签
     */
    updateSelectedLabel(): void {
        if (!this.$data.parsedOptions.length) return;
        const option = this.$data.parsedOptions.find((opt: SelectOptionType) => opt.value === this.$data.value);
        this.$data.selectedLabel = option?.label || '';
    }

    /**
     * 点击事件处理
     */
    handleClick(): void {
        if (this.$data.disabled) return;

        const willOpen = !this.$data.isOpen;
        this.$data.isOpen = willOpen;
        this.$data.focused = willOpen;

        // 打开时计算下拉框位置
        if (willOpen) {
            this.calculateDropdownPlacement();
        }
    }

    /**
     * 选择选项（来自 options 属性）
     */
    handleSelect(option: SelectOptionType, _event: Event): void {
        if (option.disabled) return;

        this.$data.value = option.value;
        this.updateSelectedLabel();
        this.closeDropdown();

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 处理插槽选项点击
     */
    handleSlotClick(event: Event): void {
        const target = event.target as HTMLElement;
        const optionEl = target.closest('[data-value]') as HTMLElement;

        if (!optionEl) return;

        const value = optionEl.getAttribute('data-value') || '';
        const label = optionEl.getAttribute('data-label') || optionEl.textContent?.trim() || '';
        const disabled = optionEl.hasAttribute('disabled');

        if (disabled) return;

        this.$data.value = value;
        this.$data.selectedLabel = label;
        this.closeDropdown();

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 清除选择
     */
    handleClear(event: MouseEvent): void {
        event.stopPropagation();

        this.$data.value = '';
        this.$data.selectedLabel = '';

        // 派发原生 clear 和 change 事件
        this.dispatchEvent(
            new Event('clear', {
                bubbles: true,
                composed: true,
            }),
        );
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 关闭下拉菜单
     */
    closeDropdown(): void {
        if (!this.$data.isOpen) return;

        this.$data.closing = true;
        setTimeout(() => {
            this.$data.isOpen = false;
            this.$data.closing = false;
            this.$data.focused = false;
        }, 200);
    }

    /**
     * 设置值
     */
    public setValue(value: string, silent = false): void {
        this.$data.value = value;

        if (this.$data.useSlot) {
            this.updateSelectedLabelFromSlot();
        } else {
            this.updateSelectedLabel();
        }

        // 非静默模式下派发 change 事件
        if (!silent) {
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    /**
     * 获取值
     */
    public getValue(): string {
        return this.$data.value || '';
    }

    /**
     * 设置选项
     */
    public setOptions(options: SelectOptionType[]): void {
        this.$data.options = options;
        this.$data.useSlot = false;
        this.parseOptions();
    }
}

export default SolelySelect;
export { SolelySelect };
