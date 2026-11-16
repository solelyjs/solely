/**
 * SelectOption 组件
 * Select 的声明式子组件：<solely-select-option value="user">用户</solely-select-option>
 *
 * 标签协议（与父组件 collectSlotOptions 对齐）：
 * - value：选项值；缺省为空字符串。
 * - label：选中后展示的标签；缺省回退到元素文本内容（trim）。
 * - disabled：禁用该选项。
 *
 * 自身不注入任何样式：外观完全由父组件的 `::slotted(solely-select-option)` 提供，
 * 避免无 Shadow DOM 的组件把整份 select 样式重复注入 document.head。
 */

import { BaseElement, CustomElement } from '../../../runtime/component';

@CustomElement({
    tagName: 'solely-select-option',
    shadowDOM: { use: false }, // 不使用 Shadow DOM，以便子内容原样投影到父组件插槽
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
    getOptionData(): { value: string; label: string; disabled: boolean; element: SelectOption } {
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
export { SelectOption, SelectOption as SolelySelectOption };
