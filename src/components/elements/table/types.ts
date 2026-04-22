/**
 * Table 组件类型定义
 */

export type TableSize = 'small' | 'middle' | 'default' | 'large';

export interface TableColumn {
    /** 列标题 */
    title: string;
    /** 列数据字段 */
    dataIndex: string;
    /** 列标识 */
    key: string;
    /** 列宽度 */
    width?: number | string;
    /** 是否固定列 */
    fixed?: 'left' | 'right';
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';
    /** 自定义渲染（使用 slot 名称） */
    slot?: string;
}

export interface TableProps {
    /** 表格列配置（JSON字符串） */
    columns?: string;
    /** 表格数据（JSON字符串） */
    dataSource?: string;
    /** 表格尺寸 */
    size?: TableSize;
    /** 是否显示边框 */
    bordered?: boolean;
    /** 是否加载中 */
    loading?: boolean;
    /** 是否显示斑马纹 */
    striped?: boolean;
    /** 是否可点击行 */
    rowClickable?: boolean;
    /** 行数据的唯一标识字段名 */
    rowKey?: string;
}
