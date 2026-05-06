/**
 * Empty 空状态组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './empty.html?raw';

interface EmptyDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-empty',
    template,
})
export class DocsEmpty extends BaseElement<EmptyDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 获取 empty 元素
     */
    private getEmptyEl(): (unknown & { setDescription: (desc: string) => void }) | null {
        const el = this.querySelector('#empty-method-demo');
        return el as unknown as { setDescription: (desc: string) => void } | null;
    }

    /**
     * 设置描述1
     */
    handleSetDesc1(): void {
        const empty = this.getEmptyEl();
        if (empty && typeof empty.setDescription === 'function') {
            empty.setDescription('暂无搜索结果');
            this.addEventLog('setDescription: 暂无搜索结果');
        }
    }

    /**
     * 设置描述2
     */
    handleSetDesc2(): void {
        const empty = this.getEmptyEl();
        if (empty && typeof empty.setDescription === 'function') {
            empty.setDescription('数据加载失败，请重试');
            this.addEventLog('setDescription: 数据加载失败，请重试');
        }
    }

    /**
     * 清空描述
     */
    handleSetDesc3(): void {
        const empty = this.getEmptyEl();
        if (empty && typeof empty.setDescription === 'function') {
            empty.setDescription('');
            this.addEventLog('setDescription: 清空描述');
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

export default DocsEmpty;
