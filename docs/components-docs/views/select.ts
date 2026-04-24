/**
 * Select 组件文档页面
 */

import { BaseElement, CustomElement } from '../../../src/runtime/component';
import type { SelectOption } from '../../../src/components/elements/select/types';
import template from './select.html?raw';

@CustomElement({
    tagName: 'docs-select',
    template: template,
})
class DocsSelect extends BaseElement<{
    options: SelectOption[];
    value: string;
    selectedValue: string;
    selectedLabel: string;
    modelSelect1: string;
    modelSelect2: string;
}> {
    constructor() {
        super();
        this.$data.options = [];
        this.$data.value = '';
        this.$data.selectedValue = '';
        this.$data.selectedLabel = '';
        this.$data.modelSelect1 = '';
        this.$data.modelSelect2 = '';
    }

    /**
     * 组件挂载后初始化示例数据
     */
    mounted(): void {
        this.initBasicExamples();
    }

    /**
     * 初始化基础示例
     */
    private initBasicExamples(): void {
        // 基础用法示例
        this.$data.options = [
            { label: '选项一', value: '1' },
            { label: '选项二', value: '2' },
            { label: '选项三', value: '3' },
        ];
    }

    /**
     * 设置预设值
     */
    setSelectValues(): void {
        this.$data.modelSelect1 = 'shanghai';
        this.$data.modelSelect2 = 'b';
    }
}

export default DocsSelect;
