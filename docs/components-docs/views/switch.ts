/**
 * Switch 开关组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './switch.html?raw';

interface SwitchDocData {
    switchStatus: string;
    eventLogs: string[];
    modelSwitch1: boolean;
    modelSwitch2: boolean;
    modelSwitch3: boolean;
}

@CustomElement({
    tagName: 'docs-switch',
    template,
})
export class DocsSwitch extends BaseElement<SwitchDocData> {
    constructor() {
        super({
            switchStatus: '关闭',
            eventLogs: [],
            modelSwitch1: false,
            modelSwitch2: true,
            modelSwitch3: true,
        });
    }

    /**
     * 处理开关 change 事件
     */
    handleSwitchChange(event: Event): void {
        const target = event.target as unknown as { checked: boolean };
        const checked = target?.checked ?? false;
        this.$data.switchStatus = checked ? '开启' : '关闭';
    }

    /**
     * 处理 toggle 按钮点击
     */
    handleToggleClick(): void {
        const switchEl = this.$refs.eventSwitch as unknown as { toggle: () => void };
        if (typeof switchEl?.toggle === 'function') {
            switchEl.toggle();
        }
    }

    /**
     * 处理事件演示
     */
    handleEventDemo(event: Event): void {
        const target = event.target as unknown as { checked: boolean };
        const checked = target?.checked ?? false;
        this.addEventLog(`change: ${checked}`);
    }

    /**
     * 添加事件日志
     */
    addEventLog(message: string): void {
        const logs = this.$data.eventLogs || [];
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.length > 5) logs.pop();
        this.$data.eventLogs = logs;
        if (this.$refs.eventLog) {
            this.$refs.eventLog.textContent = logs.join('\n');
        }
    }

    /**
     * 全部切换
     */
    toggleAllSwitches(): void {
        const allOn = this.$data.modelSwitch1 && this.$data.modelSwitch2 && this.$data.modelSwitch3;
        this.$data.modelSwitch1 = !allOn;
        this.$data.modelSwitch2 = !allOn;
        this.$data.modelSwitch3 = !allOn;
    }
}

export default DocsSwitch;
