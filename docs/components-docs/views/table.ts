/**
 * Table 表格组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './table.html?raw';

interface TableDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-table',
    template,
})
export class DocsTable extends BaseElement<TableDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 处理行点击事件
     */
    handleRowClick(event: CustomEvent<{ row: { name: string }; index: number }>): void {
        const { row, index } = event.detail ?? {};
        this.addEventLog(`row-click: 第 ${index + 1} 行 - ${row?.name ?? '未知'}`);
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

export default DocsTable;
