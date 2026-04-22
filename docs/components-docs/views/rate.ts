/**
 * Rate 评分组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './rate.html?raw';

interface RateDocData {
    rateValue: number;
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-rate',
    template,
})
export class DocsRate extends BaseElement<RateDocData> {
    constructor() {
        super({
            rateValue: 3,
            eventLogs: [],
        });
    }

    /**
     * 处理评分 change 事件
     */
    handleRateChange(event: Event): void {
        const target = event.target as unknown as { value: number };
        this.$data.rateValue = target?.value ?? 0;
        this.addEventLog(`change: ${this.$data.rateValue}`);
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
}

export default DocsRate;
