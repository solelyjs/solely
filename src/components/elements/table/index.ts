/**
 * Solely Table 组件
 * 表格组件，用于展示结构化数据
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TableProps, TableColumn } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-table',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'columns', type: 'string' },
        { name: 'dataSource', type: 'string' },
        { name: 'size', type: 'string' },
        { name: 'bordered', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'striped', type: 'boolean', default: false },
        { name: 'rowClickable', type: 'boolean', default: false },
        { name: 'rowKey', type: 'string' },
    ],
})
class SolelyTable extends BaseElement<
    TableProps & {
        parsedColumns: TableColumn[];
        parsedDataSource: Record<string, unknown>[];
    }
> {
    /**
     * 获取 table class 对象
     */
    getTableClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['table--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['table--lg'] = true;
        } else {
            classes['table--md'] = true;
        }
        classes['table--bordered'] = !!this.$data.bordered;
        classes['is-loading'] = !!this.$data.loading;
        classes['table--striped'] = !!this.$data.striped;
        classes['table--clickable'] = !!this.$data.rowClickable;
        return classes;
    }

    /**
     * 获取 th class 对象
     */
    getThClasses(col: TableColumn): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (col.fixed === 'left') {
            classes['fixed-left'] = true;
        }
        if (col.fixed === 'right') {
            classes['fixed-right'] = true;
        }
        classes[`align-${col.align || 'left'}`] = true;
        return classes;
    }

    /**
     * 获取 td class 对象
     */
    getTdClasses(col: TableColumn): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (col.fixed === 'left') {
            classes['fixed-left'] = true;
        }
        if (col.fixed === 'right') {
            classes['fixed-right'] = true;
        }
        classes[`align-${col.align || 'left'}`] = true;
        return classes;
    }

    mounted(): void {
        this.parseData();
    }

    /**
     * 解析数据
     */
    parseData(): void {
        this.$data.parsedColumns = safeJsonParse(this.$data.columns, []);
        this.$data.parsedDataSource = safeJsonParse(this.$data.dataSource, []);
    }

    /**
     * 获取单元格值
     */
    getCellValue(row: Record<string, unknown>, col: TableColumn): unknown {
        return row[col.dataIndex];
    }

    /**
     * 行点击事件
     */
    handleRowClick(row: Record<string, unknown>, index: number): void {
        if (!this.$data.rowClickable) return;

        // 派发 row-click 自定义事件
        this.emit('row-click', {
            row,
            index,
        });

        // 同时派发原生 click 事件
        this.dispatchEvent(
            new Event('click', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 设置列配置
     */
    public setColumns(columns: TableColumn[]): void {
        this.$data.columns = JSON.stringify(columns);
        this.parseData();
    }

    /**
     * 设置数据源
     */
    public setDataSource(dataSource: Record<string, unknown>[]): void {
        this.$data.dataSource = JSON.stringify(dataSource);
        this.parseData();
    }

    /**
     * 获取数据源
     */
    public getDataSource(): Record<string, unknown>[] {
        return this.$data.parsedDataSource;
    }
}

export default SolelyTable;
export { SolelyTable };
