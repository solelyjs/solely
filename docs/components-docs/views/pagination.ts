/**
 * Pagination 分页组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './pagination.html?raw';

interface PaginationDocData {
    current: number;
    pageSize: number;
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-pagination',
    template,
})
export class DocsPagination extends BaseElement<PaginationDocData> {
    constructor() {
        super({
            current: 1,
            pageSize: 10,
            eventLogs: [],
        });
    }

    /**
     * 处理 change 事件
     */
    handleChange(event: CustomEvent<{ current: number; pageSize: number }>): void {
        const detail = event.detail;
        this.$data.current = detail.current;
        this.addEventLog(`change: 第 ${detail.current} 页, 每页 ${detail.pageSize} 条`);
    }

    /**
     * 处理 showSizeChange 事件
     */
    handleSizeChange(event: CustomEvent<{ current: number; pageSize: number }>): void {
        const detail = event.detail;
        this.$data.pageSize = detail.pageSize;
        this.$data.current = detail.current;
        this.addEventLog(`showSizeChange: 第 ${detail.current} 页, 每页 ${detail.pageSize} 条`);
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

export default DocsPagination;
