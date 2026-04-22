/**
 * Solely Select 组件
 * 下拉选择器组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { SelectProps, SelectOption } from './types';
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
        parsedOptions: SelectOption[];
    }
> {
    clickOutsideHandler?: (event: MouseEvent) => void;

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问
     */
    get value(): string {
        return this.$data.value;
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
        return classes;
    }

    /**
     * 获取 dropdown class 对象
     */
    getDropdownClasses(): Record<string, boolean> {
        return {
            'select__dropdown--closing': !!this.$data.closing,
        };
    }

    /**
     * 获取 option class 对象
     */
    getOptionClasses(option: SelectOption): Record<string, boolean> {
        return {
            'select__option--selected': option.value === this.$data.value,
            'select__option--disabled': !!option.disabled,
        };
    }

    mounted(): void {
        this.parseOptions();
        this.updateSelectedLabel();

        // 点击外部关闭下拉菜单
        this.clickOutsideHandler = (event: MouseEvent) => {
            // 使用 composedPath 检查点击是否在组件内部
            const path = event.composedPath();
            const isInside = path.some(el => el === this);
            if (!isInside) {
                this.closeDropdown();
            }
        };
        // 在 document 上监听，因为 Shadow DOM 事件会冒泡出来
        document.addEventListener('click', this.clickOutsideHandler);
    }

    unmounted(): void {
        if (this.clickOutsideHandler) {
            document.removeEventListener('click', this.clickOutsideHandler);
        }
    }

    /**
     * 解析选项
     */
    parseOptions(): void {
        this.$data.parsedOptions = Array.isArray(this.$data.options) ? this.$data.options : [];
    }

    /**
     * 更新选中的标签
     */
    updateSelectedLabel(): void {
        const option = this.$data.parsedOptions.find((opt: SelectOption) => opt.value === this.$data.value);
        this.$data.selectedLabel = option?.label || '';
    }

    /**
     * 点击事件处理
     */
    handleClick(): void {
        if (this.$data.disabled) return;

        this.$data.isOpen = !this.$data.isOpen;
        this.$data.focused = this.$data.isOpen;
    }

    /**
     * 选择选项
     */
    handleSelect(option: SelectOption, _event: Event): void {
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
        this.updateSelectedLabel();

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
        return this.$data.value;
    }

    /**
     * 设置选项
     */
    public setOptions(options: SelectOption[]): void {
        this.$data.options = options;
        this.parseOptions();
        this.updateSelectedLabel();
    }
}

export default SolelySelect;
export { SolelySelect };
