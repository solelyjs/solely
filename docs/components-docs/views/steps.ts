/**
 * Steps 步骤条组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './steps.html?raw';

interface StepItem {
    title: string;
    description?: string;
}

interface StepsDocData {
    currentStep: number;
    eventLogs: string[];
    bindItems: StepItem[];
    bindCurrent: number;
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
            bindItems: [
                { title: '需求分析', description: '收集和分析需求' },
                { title: '设计阶段', description: 'UI/UX设计' },
                { title: '开发阶段', description: '前端后端开发' },
            ],
            bindCurrent: 0,
        });
    }

    /**
     * 获取绑定的步骤数据（用于 :items 绑定）
     */
    getBindItems(): StepItem[] {
        return this.$data.bindItems;
    }

    /**
     * 添加步骤
     */
    addBindStep(): void {
        const newIndex = this.$data.bindItems.length + 1;
        const newItem: StepItem = {
            title: `步骤 ${newIndex}`,
            description: `这是第 ${newIndex} 个步骤`,
        };
        this.$data.bindItems = [...this.$data.bindItems, newItem];
    }

    /**
     * 移除最后一个步骤
     */
    removeBindStep(): void {
        if (this.$data.bindItems.length > 1) {
            this.$data.bindItems = this.$data.bindItems.slice(0, -1);
        }
    }

    /**
     * 重置步骤数据
     */
    resetBindSteps(): void {
        this.$data.bindItems = [
            { title: '需求分析', description: '收集和分析需求' },
            { title: '设计阶段', description: 'UI/UX设计' },
            { title: '开发阶段', description: '前端后端开发' },
        ];
        this.$data.bindCurrent = 0;
    }

    /**
     * 处理绑定步骤的 change 事件
     */
    handleBindChange(event: CustomEvent<{ index: number; item: StepItem }>): void {
        this.$data.bindCurrent = event.detail.index;
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
