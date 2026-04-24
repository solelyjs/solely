/**
 * Radio 单选框组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './radio.html?raw';

interface RadioDocData {
    selectedValue: string;
    modelRadio1: boolean;
}

@CustomElement({
    tagName: 'docs-radio',
    template,
})
export class DocsRadio extends BaseElement<RadioDocData> {
    constructor() {
        super({
            selectedValue: 'apple',
            modelRadio1: false,
        });
    }

    /**
     * 处理 radio change 事件
     */
    handleRadioChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.$data.selectedValue = target.value;
    }

    /**
     * 设置单选框选中状态
     */
    setRadio1(checked: boolean): void {
        this.$data.modelRadio1 = checked;
    }

    /**
     * 切换单选框状态
     */
    toggleRadio1(): void {
        this.$data.modelRadio1 = !this.$data.modelRadio1;
    }
}

export default DocsRadio;
