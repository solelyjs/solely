/**
 * SelectOption 组件
 * Select 的子组件，用于定义选项
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import styles from './style.css?inline';

@CustomElement({
    tagName: 'solely-select-option',
    styles: styles,
    shadowDOM: { use: false }, // 不使用 Shadow DOM，以便插槽内容直接渲染
    props: [
        { name: 'value', type: 'string', default: '' },
        { name: 'label', type: 'string', default: '' },
        { name: 'disabled', type: 'boolean', default: false },
    ],
})
class SelectOption extends BaseElement<{
    value: string;
    label: string;
    disabled: boolean;
}> {
    /**
     * 获取选项值
     */
    getOptionData() {
        // 如果有 label 属性，使用 label；否则尝试从插槽获取文本
        const label = this.$data.label || this.textContent?.trim() || '';
        return {
            value: this.$data.value,
            label: label,
            disabled: this.$data.disabled,
            element: this,
        };
    }
}

export default SelectOption;
export { SelectOption };
