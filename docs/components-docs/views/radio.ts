/**
 * Radio 单选框组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './radio.html?raw';

interface RadioDocData {
    selectedValue: string;
}

@CustomElement({
    tagName: 'docs-radio',
    template,
})
export class DocsRadio extends BaseElement<RadioDocData> {
    constructor() {
        super({
            selectedValue: 'apple',
        });
    }

    /**
     * 处理 radio change 事件
     */
    handleRadioChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.$data.selectedValue = target.value;
    }
}

export default DocsRadio;
