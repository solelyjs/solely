/**
 * Solely Checkbox 组件
 * 复选框组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { CheckboxProps, CheckboxRefs } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-checkbox',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'indeterminate', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'content', type: 'string', default: '' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'block', type: 'boolean', default: false },
        { name: 'name', type: 'string', default: '' },
    ],
})
class SolelyCheckbox extends BaseElement<CheckboxProps, CheckboxRefs> {
    /**
     * 获取 checkbox class 对象
     */
    getCheckboxClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        const size = this.$data.size || 'medium';
        const type = this.$data.type || 'primary';

        // 尺寸映射
        if (size === 'small') {
            classes['checkbox--sm'] = true;
        } else if (size === 'large') {
            classes['checkbox--lg'] = true;
        } else {
            classes['checkbox--md'] = true;
        }
        classes[`checkbox--${type}`] = true;
        classes['is-checked'] = !!this.$data.checked;
        classes['is-indeterminate'] = !!this.$data.indeterminate;
        classes['is-disabled'] = !!this.$data.disabled;
        classes['checkbox--block'] = !!this.$data.block;

        return classes;
    }

    /**
     * 点击事件处理
     */
    handleClick(_event: Event): void {
        if (this.$data.disabled) {
            return;
        }

        this.toggle();

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 键盘事件处理
     */
    handleKeyDown(event: KeyboardEvent): void {
        if (this.$data.disabled) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleClick(event);
        }
    }

    /**
     * 切换选中状态
     */
    toggle(): void {
        if (this.$data.disabled) {
            return;
        }

        const newChecked = !this.$data.checked;
        this.$data.checked = newChecked;

        // 清除半选状态
        if (this.$data.indeterminate) {
            this.$data.indeterminate = false;
        }

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 设置选中状态
     */
    setChecked(checked: boolean): void {
        this.$data.checked = checked;
        this.$data.indeterminate = false;
    }

    /**
     * 获取选中状态
     */
    getChecked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 getter
     */
    get checked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 setter
     */
    set checked(value: boolean) {
        this.setChecked(value);
    }

    /**
     * 设置半选状态
     */
    setIndeterminate(indeterminate: boolean): void {
        this.$data.indeterminate = indeterminate;
    }

    /**
     * 聚焦到复选框
     */
    focus(): void {
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            checkboxEl.focus();
        }
    }

    /**
     * 从复选框移除焦点
     */
    blur(): void {
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            checkboxEl.blur();
        }
    }

    /**
     * 组件挂载后的生命周期钩子
     */
    mounted(): void {
        this.updateAriaAttributes();
    }

    /**
     * 组件更新后的生命周期钩子
     */
    updated(): void {
        this.updateAriaAttributes();
    }

    /**
     * 更新 ARIA 属性
     */
    private updateAriaAttributes(): void {
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            checkboxEl.setAttribute('aria-checked', this.$data.checked ? 'true' : 'false');
            checkboxEl.setAttribute('aria-disabled', this.$data.disabled ? 'true' : 'false');
        }
    }
}

export default SolelyCheckbox;
export { SolelyCheckbox };
