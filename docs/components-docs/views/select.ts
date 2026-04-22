/**
 * Select 选择器组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './select.html?raw';

interface SelectDocData {
    selectedValue: string;
    selectedLabel: string;
}

@CustomElement({
    tagName: 'docs-select',
    template,
})
export class DocsSelect extends BaseElement<SelectDocData> {
    constructor() {
        super({
            selectedValue: '',
            selectedLabel: '',
        });
    }

    /**
     * 处理 select change 事件
     */
    handleSelectChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.$data.selectedValue = target.value;
        // 通过查找选项获取 label
        const selectEl = event.target as Element;
        const options = selectEl.getAttribute('options');
        if (options) {
            try {
                const parsedOptions = JSON.parse(options);
                const selectedOption = parsedOptions.find(
                    (opt: { value: string; label: string }) => opt.value === target.value,
                );
                this.$data.selectedLabel = selectedOption?.label || target.value;
            } catch {
                this.$data.selectedLabel = target.value;
            }
        } else {
            this.$data.selectedLabel = target.value;
        }
    }

    /**
     * 处理 clear 事件
     */
    handleClear(): void {
        this.$data.selectedValue = '';
        this.$data.selectedLabel = '';
    }
}

export default DocsSelect;
