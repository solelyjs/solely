/**
 * Checkbox 复选框组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './checkbox.html?raw';

interface CheckboxDocData {
    checkedStatus: string;
    indeterminateStatus: string;
}

@CustomElement({
    tagName: 'docs-checkbox',
    template,
})
export class DocsCheckbox extends BaseElement<CheckboxDocData> {
    constructor() {
        super({
            checkedStatus: '未选中',
            indeterminateStatus: '半选',
        });
    }

    /**
     * 处理复选框 change 事件
     */
    handleCheckboxChange(_event: Event): void {
        const checkboxEl = this.$refs.eventCheckbox as unknown as { checked: boolean };
        const checked = checkboxEl?.checked ?? false;
        this.$data.checkedStatus = checked ? '选中' : '未选中';
    }

    /**
     * 处理半选状态复选框 change 事件
     */
    handleIndeterminateChange(_event: Event): void {
        const checkboxEl = this.$refs.indeterminateCheckbox as unknown as { checked: boolean };
        const checked = checkboxEl?.checked ?? false;
        this.$data.indeterminateStatus = checked ? '选中' : '未选中';
    }

    /**
     * 调用 toggle 方法
     */
    handleToggleClick(): void {
        const checkboxEl = this.$refs.eventCheckbox as unknown as { toggle: () => void };
        if (typeof checkboxEl?.toggle === 'function') {
            checkboxEl.toggle();
        }
    }
}

export default DocsCheckbox;
