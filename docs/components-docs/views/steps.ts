/**
 * Steps 步骤条组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './steps.html?raw';

interface StepsDocData {
    currentStep: number;
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-steps',
    template,
})
export class DocsSteps extends BaseElement<StepsDocData> {
    constructor() {
        super({
            currentStep: 1,
            eventLogs: [],
        });
    }

    /**
     * 处理 change 事件
     */
    handleChange(event: CustomEvent<{ index: number; item: { title: string } }>): void {
        const detail = event.detail;
        this.$data.currentStep = detail.index;
        this.addEventLog(`change: 步骤 ${detail.index + 1} - ${detail.item.title}`);
    }

    /**
     * 处理步骤切换事件（用于步骤切换演示）
     */
    handleStepChange(event: CustomEvent<{ index: number; item: { title: string } }>): void {
        this.$data.currentStep = event.detail.index;
    }

    /**
     * 下一步
     */
    handleNext(): void {
        const stepsEl = this.$refs.stepsDemo as unknown as { next: () => void; current: number };
        if (stepsEl?.next) {
            stepsEl.next();
            this.$data.currentStep = stepsEl.current;
        }
    }

    /**
     * 上一步
     */
    handlePrev(): void {
        const stepsEl = this.$refs.stepsDemo as unknown as { prev: () => void; current: number };
        if (stepsEl?.prev) {
            stepsEl.prev();
            this.$data.currentStep = stepsEl.current;
        }
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

export default DocsSteps;
