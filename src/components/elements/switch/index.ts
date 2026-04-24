import { BaseElement, CustomElement } from '../../../runtime/component';
import type { SwitchProps, SwitchRefs } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-switch',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'checkedChildren', type: 'string', default: '' },
        { name: 'unCheckedChildren', type: 'string', default: '' },
    ],
    model: { prop: 'checked', event: 'change' },
})
class SolelySwitch extends BaseElement<SwitchProps, SwitchRefs> {
    /**
     * 获取 Switch 的 CSS 类名
     */
    getSwitchClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        const size = this.$data.size || 'medium';
        const type = this.$data.type || 'primary';

        // 尺寸映射
        if (size === 'small') {
            classes['switch--sm'] = true;
        } else if (size === 'large') {
            classes['switch--lg'] = true;
        } else {
            classes['switch--md'] = true;
        }
        classes[`switch--${type}`] = true;
        classes['is-checked'] = !!this.$data.checked;
        classes['is-disabled'] = !!this.$data.disabled;
        classes['is-loading'] = !!this.$data.loading;

        return classes;
    }

    /**
     * 处理点击事件
     */
    handleClick(): void {
        if (this.$data.disabled || this.$data.loading) {
            return;
        }

        this.toggle();
    }

    /**
     * 处理键盘事件
     */
    handleKeyDown(event: KeyboardEvent): void {
        if (this.$data.disabled || this.$data.loading) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.toggle();
        }
    }

    /**
     * 切换开关状态
     * 用户交互时调用，会检查 disabled/loading 并派发事件
     */
    toggle(): void {
        if (this.$data.disabled || this.$data.loading) {
            return;
        }
        const newChecked = !this.$data.checked;
        this.setChecked(newChecked);
        this.dispatchChangeEvent();
    }

    /**
     * 派发 change 事件
     */
    private dispatchChangeEvent(): void {
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 设置开关状态（仅更新数据，不派发事件）
     * @param checked - 新的开关状态
     */
    setChecked(checked: boolean): void {
        this.$data.checked = checked;
    }

    /**
     * 获取当前开关状态
     * @returns 当前开关状态
     */
    getChecked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 getter
     * 允许通过 element.checked 访问状态
     */
    get checked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 setter
     * 允许通过 element.checked = true 设置状态
     */
    set checked(value: boolean) {
        this.setChecked(value);
    }

    /**
     * 聚焦到开关
     */
    focus(): void {
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.focus();
        }
    }

    /**
     * 从开关移除焦点
     */
    blur(): void {
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.blur();
        }
    }

    /**
     * 组件挂载后的生命周期钩子
     */
    mounted(): void {
        // 可以在这里添加额外的初始化逻辑
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
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.setAttribute('aria-checked', this.$data.checked ? 'true' : 'false');
            switchEl.setAttribute('aria-disabled', this.$data.disabled ? 'true' : 'false');
        }
    }
}

export { SolelySwitch };
export default SolelySwitch;
