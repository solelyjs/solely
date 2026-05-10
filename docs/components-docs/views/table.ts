/**
 * Table 表格组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './table.html?raw';

const demoColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '年龄', dataIndex: 'age', key: 'age' },
    { title: '地址', dataIndex: 'address', key: 'address' },
];

const demoDataSource = [
    { name: '张三', age: 28, address: '北京市' },
    { name: '李四', age: 32, address: '上海市' },
    { name: '王五', age: 24, address: '广州市' },
];

interface TableDocData {
    eventLogs: string[];
    demoColumns: { title: string; dataIndex: string; key: string }[];
    demoDataSource: Record<string, unknown>[];
    bindColumns: { title: string; dataIndex: string; key: string }[];
    bindDataSource: Record<string, unknown>[];
}

@CustomElement({
    tagName: 'docs-table',
    template,
})
export class DocsTable extends BaseElement<TableDocData> {
    constructor() {
        super({
            eventLogs: [],
            demoColumns,
            demoDataSource,
            bindColumns: [],
            bindDataSource: [],
        });
    }

    /**
     * 加载绑定数据（属性绑定演示）
     */
    loadBindData(): void {
        this.$data.bindColumns = demoColumns;
        this.$data.bindDataSource = demoDataSource;
    }

    /**
     * 清空绑定数据（属性绑定演示）
     */
    clearBindData(): void {
        this.$data.bindColumns = [];
        this.$data.bindDataSource = [];
    }

    /**
     * 加载表格数据（JS API 演示）
     */
    loadTableData(): void {
        const table = this.$refs.jsApiTable as unknown as {
            setColumns: (cols: typeof demoColumns) => void;
            setDataSource: (data: typeof demoDataSource) => void;
        };
        table?.setColumns(demoColumns);
        table?.setDataSource(demoDataSource);
    }

    /**
     * 清空表格数据（JS API 演示）
     */
    clearTableData(): void {
        const table = this.$refs.jsApiTable as unknown as {
            setColumns: (cols: typeof demoColumns) => void;
            setDataSource: (data: typeof demoDataSource) => void;
        };
        table?.setColumns([]);
        table?.setDataSource([]);
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
