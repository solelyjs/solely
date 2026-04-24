/**
 * Input 输入框组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './input.html?raw';

interface DocsData {
    eventLogs: string[];
    modelInput1: string;
    modelInput2: string;
    modelInput3: string;
}

@CustomElement({
    tagName: 'docs-input',
    template,
})
export class DocsInput extends BaseElement<DocsData> {
    constructor() {
        super({
            eventLogs: [],
            modelInput1: 'Hello Solely!',
            modelInput2: '',
            modelInput3: '多行文本示例\n第二行内容',
        });
    }

    /**
     * 添加事件日志
     */
    private addEventLog(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const log = `[${timestamp}] ${message}`;
        this.$data.eventLogs.unshift(log);
        // 只保留最近5条
        if (this.$data.eventLogs.length > 5) {
            this.$data.eventLogs.pop();
        }
        this.updateEventLogDisplay();
    }

    /**
     * 更新事件日志显示
     */
    private updateEventLogDisplay(): void {
        const logEl = this.$refs.eventLog as HTMLElement;
        if (logEl) {
            logEl.textContent = this.$data.eventLogs.join('\n') || '等待输入...';
        }
    }

    /**
     * 处理 input 事件
     */
    handleInputNative(event: InputEvent): void {
        // 通过 event.target.value 获取值
        const target = event.target as HTMLInputElement;
        const value = target?.value || '';
        this.addEventLog(`input: "${value}"`);
    }

    /**
     * 处理 change 事件
     */
    handleChangeNative(event: Event): void {
        // change 事件通过 Event 派发，外部通过 event.target.value 获取值
        const target = event.target as HTMLInputElement;
        const value = target?.value || '';
        this.addEventLog(`change: "${value}"`);
    }

    /**
     * 处理原生 focus 事件
     */
    handleFocusNative(_event: FocusEvent): void {
        this.addEventLog('focus: 输入框获得焦点');
    }

    /**
     * 处理原生 blur 事件
     */
    handleBlurNative(_event: FocusEvent): void {
        this.addEventLog('blur: 输入框失去焦点');
    }

    /**
     * 处理原生 keydown 事件
     */
    handleKeydownNative(event: KeyboardEvent): void {
        this.addEventLog(`keydown: ${event.key}`);
    }

    /**
     * 处理 clear 事件
     */
    handleClearEvent(_event: Event): void {
        this.addEventLog('clear: 内容已清空');
    }

    /**
     * 处理 search 自定义事件
     */
    handleSearchEvent(event: CustomEvent<{ value: string }>): void {
        const value = event.detail?.value || '';
        this.addEventLog(`search: "${value}"`);
    }

    /**
     * 处理 copy 自定义事件
     */
    handleCopyEvent(event: CustomEvent<{ value: string }>): void {
        const value = event.detail?.value || '';
        this.addEventLog(`copy: "${value}"`);
    }

    /**
     * 处理 copy-error 自定义事件
     */
    handleCopyErrorEvent(_event: CustomEvent<{ error: Error }>): void {
        this.addEventLog('copy-error: 复制失败');
    }

    /**
     * 清空所有输入
     */
    clearInputs(): void {
        this.$data.modelInput1 = '';
        this.$data.modelInput2 = '';
        this.$data.modelInput3 = '';
    }
}

export default DocsInput;
