/**
 * Solely Radio 组件
 * 单选框组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { RadioProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-radio',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'content', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'name', type: 'string', default: '' },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyRadio extends BaseElement<RadioProps> {
    /**
     * 获取 checked 属性（允许外部通过 event.target.checked 访问）
     */
    get checked(): boolean {
        return this.$data.checked;
    }

    /**
     * 设置 checked 属性
     */
    set checked(value: boolean) {
        this.setChecked(value);
    }

    /**
     * 获取 value 属性（允许外部通过 event.target.value 访问）
     */
    get value(): string {
        return this.$data.value;
    }

    /**
     * 设置 value 属性
     */
    set value(val: string) {
        this.$data.value = val;
    }

    /**
     * 获取 radio class 对象
     */
    getRadioClasses(): Record<string, boolean> {
        return {
            'is-checked': !!this.$data.checked,
            'is-disabled': !!this.$data.disabled,
            [`radio--${this.$data.type}`]: !!this.$data.type,
            'radio--block': !!this.$data.block,
        };
    }

    /**
     * 点击事件处理
     */
    handleClick(_event: Event): void {
        if (this.$data.disabled || this.$data.checked) return;

        // 取消同组其他单选框的选中状态
        if (this.$data.name) {
            this.uncheckSameNameRadios();
        }

        this.$data.checked = true;

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 取消同组其他单选框的选中状态
     */
    private uncheckSameNameRadios(): void {
        const name = this.$data.name;
        if (!name) return;

        // 获取当前 radio 所在的根节点（document 或 shadow root）
        const root = this.getRootNode() as Document | ShadowRoot;

        // 在当前根节点中查找所有同名的 radio
        const radios = root.querySelectorAll('solely-radio');

        radios.forEach(radio => {
            // 跳过自己
            if (radio === this) return;

            // 检查 name 属性是否相同
            const radioName = radio.getAttribute('name');
            if (radioName === name) {
                const radioEl = radio as unknown as { setChecked: (checked: boolean) => void };
                if (typeof radioEl?.setChecked === 'function') {
                    radioEl.setChecked(false);
                }
            }
        });
    }

    /**
     * 设置选中状态
     */
    public setChecked(checked: boolean): void {
        this.$data.checked = checked;
    }

    /**
     * 获取选中状态
     */
    public getChecked(): boolean {
        return this.$data.checked;
    }
}

export default SolelyRadio;
export { SolelyRadio };
