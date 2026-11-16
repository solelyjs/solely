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

/** 受控示例的列配置 */
const controlledColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '年龄', dataIndex: 'age', key: 'age', sortable: true, width: 100 },
    {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        filters: [
            { label: '活跃', value: 'active' },
            { label: '禁用', value: 'inactive' },
        ],
    },
];

/** 分页联动示例的数据与列 */
const pagedDataSource = [
    { id: 1, name: '张三', age: 28 },
    { id: 2, name: '李四', age: 32 },
    { id: 3, name: '王五', age: 24 },
    { id: 4, name: '赵六', age: 35 },
    { id: 5, name: '孙七', age: 30 },
    { id: 6, name: '周八', age: 26 },
];

const pageColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '年龄', dataIndex: 'age', key: 'age', width: 100 },
];

interface ControlledColumn {
    title: string;
    dataIndex: string;
    key: string;
    sortable?: boolean;
    width?: number;
    filters?: { label: string; value: string }[];
}

interface TableDocData {
    eventLogs: string[];
    demoColumns: { title: string; dataIndex: string; key: string }[];
    demoDataSource: Record<string, unknown>[];
    bindColumns: { title: string; dataIndex: string; key: string }[];
    bindDataSource: Record<string, unknown>[];
    controlledColumns: ControlledColumn[];
    controlledSort: { column: string; order: string } | null;
    controlledFilters: Record<string, string[]>;
    controlledFilterText: string;
    selectionSummary: string;
    expandSummary: string;
    pageColumns: { title: string; dataIndex: string; key: string; width?: number }[];
    pageData: Record<string, unknown>[];
    pageSummary: string;
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
            controlledColumns,
            controlledSort: null,
            controlledFilters: {},
            controlledFilterText: '无',
            selectionSummary: '未选择',
            expandSummary: '未展开',
            pageColumns,
            pageData: pagedDataSource.slice(0, 2),
            pageSummary: '当前第 1 页，每页 2 条',
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

    /** 筛选示例：仅看活跃 */
    filterActive(): void {
        const table = this.$refs.filterTable as unknown as {
            setFilter: (column: string, values: string) => void;
        };
        table?.setFilter('status', 'active');
    }

    /** 筛选示例：按年龄升序 */
    sortByAge(): void {
        const table = this.$refs.filterTable as unknown as {
            setSort: (column: string, order: 'asc' | 'desc') => void;
        };
        table?.setSort('age', 'asc');
    }

    /** 筛选示例：清除筛选 */
    clearTableFilter(): void {
        const table = this.$refs.filterTable as unknown as {
            clearFilters: () => void;
        };
        table?.clearFilters();
    }

    /** 受控排序：把事件给出的下一个状态回写到属性 */
    handleControlledSort(event: CustomEvent<{ sort: { column: string; order: string } | null }>): void {
        // 取消排序时保持一个「空状态对象」，以继续维持受控模式
        this.$data.controlledSort = event.detail?.sort ?? { column: '', order: '' };
    }

    /** 受控筛选：把事件给出的完整筛选值回写到属性 */
    handleControlledFilter(event: CustomEvent<{ filters: Record<string, string[]> }>): void {
        const filters = event.detail?.filters ?? {};
        this.$data.controlledFilters = filters;
        this.$data.controlledFilterText = this.describeFilters(filters);
    }

    /** 受控筛选示例：通过外部状态设置筛选 */
    setControlledFilter(value: string | null): void {
        const filters: Record<string, string[]> = value ? { status: [value] } : {};
        this.$data.controlledFilters = filters;
        this.$data.controlledFilterText = this.describeFilters(filters);
    }

    private describeFilters(filters: Record<string, string[]>): string {
        const entries = Object.entries(filters);
        if (entries.length === 0) return '无';
        return entries.map(([key, values]) => `${key}=${values.join('|')}`).join(', ');
    }

    /** 行选择示例 */
    handleSelectionChange(event: CustomEvent<{ selectedKeys: string[] }>): void {
        const keys = event.detail?.selectedKeys ?? [];
        this.$data.selectionSummary = keys.length > 0 ? `已选 ${keys.length} 行：${keys.join(', ')}` : '未选择';
    }

    /** 行选择示例：清空选择 */
    clearDemoSelection(): void {
        const table = this.$refs.selectTable as unknown as {
            clearSelection: () => void;
        };
        table?.clearSelection();
    }

    /** 展开行示例 */
    handleExpandChange(
        event: CustomEvent<{ expandedKeys: string[]; expanded?: boolean; row?: { name?: string } }>,
    ): void {
        const { expandedKeys, expanded, row } = event.detail ?? {};
        this.$data.expandSummary = expanded
            ? `展开了「${row?.name ?? ''}」，当前展开 ${expandedKeys?.length ?? 0} 行`
            : `收起了一行，当前展开 ${expandedKeys?.length ?? 0} 行`;
    }

    /** 分页联动示例：监听 pagination 的 change，切片数据并转出 table 事件 */
    handlePageChange(event: CustomEvent<{ current: number; pageSize: number }>): void {
        const { current, pageSize } = event.detail;
        const start = (current - 1) * pageSize;
        this.$data.pageData = pagedDataSource.slice(start, start + pageSize);

        const table = this.$refs.pageTable as unknown as {
            setDataSource: (rows: Record<string, unknown>[]) => void;
            handlePaginationChange: (detail: { current: number; pageSize: number }) => void;
        };
        table?.setDataSource(this.$data.pageData);
        table?.handlePaginationChange(event.detail);
        this.$data.pageSummary = `当前第 ${current} 页，每页 ${pageSize} 条`;
    }

    /** table 转出的 page-change 事件 */
    handleTablePageChange(event: CustomEvent<{ current: number; pageSize: number }>): void {
        const { current, pageSize } = event.detail ?? {};
        this.$data.pageSummary = `table 接收到 page-change：第 ${current} 页，每页 ${pageSize} 条`;
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
