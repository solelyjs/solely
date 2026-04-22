/**
 * CoordinateInput 坐标输入组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './coordinate-input.html?raw';

interface DocsData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-coordinate-input',
    template,
})
export class DocsCoordinateInput extends BaseElement<DocsData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 添加事件日志
     */
    addEventLog(message: string): void {
        const logs = this.$data.eventLogs;
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.length > 5) logs.pop();
        this.$data.eventLogs = logs;
        if (this.$refs.eventLog) {
            this.$refs.eventLog.textContent = logs.join('\n');
        }
    }

    /**
     * 处理 input 事件（原生事件）
     */
    handleInputEvent(event: Event): void {
        const target = event.target as unknown as { value: { latitude: number; longitude: number } };
        const value = target?.value || { latitude: 0, longitude: 0 };
        this.addEventLog(`input: { latitude: ${value.latitude.toFixed(4)}, longitude: ${value.longitude.toFixed(4)} }`);
    }

    /**
     * 处理 change 事件（原生事件）
     */
    handleChangeEvent(event: Event): void {
        const target = event.target as unknown as { value: { latitude: number; longitude: number } };
        const value = target?.value || { latitude: 0, longitude: 0 };
        this.addEventLog(
            `change: { latitude: ${value.latitude.toFixed(4)}, longitude: ${value.longitude.toFixed(4)} }`,
        );
    }

    /**
     * 处理 focus 事件（原生事件）
     */
    handleFocusEvent(_event: FocusEvent): void {
        this.addEventLog('focus: 输入框获得焦点');
    }

    /**
     * 处理 blur 事件（原生事件）
     */
    handleBlurEvent(_event: FocusEvent): void {
        this.addEventLog('blur: 输入框失去焦点');
    }

    /**
     * 处理 keydown 事件（原生事件）
     */
    handleKeyDownEvent(event: KeyboardEvent): void {
        // 由于 Shadow DOM 事件委托机制，每个输入框的 keydown 都会冒泡到组件
        // 这里记录所有按键，不只是 Enter
        const target = event.target as unknown as { value: { latitude: number; longitude: number } };
        const value = target?.value || { latitude: 0, longitude: 0 };
        this.addEventLog(
            `keydown: ${event.key}, value: { latitude: ${value.latitude.toFixed(4)}, ` +
                `longitude: ${value.longitude.toFixed(4)} }`,
        );
    }

    /**
     * 处理 clear 事件
     */
    handleClearEvent(_event: Event): void {
        this.addEventLog('clear: 坐标已清空');
    }
}

export default DocsCoordinateInput;
