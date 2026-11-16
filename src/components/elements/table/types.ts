/**
 * Table 组件类型定义
 */

/**
 * 表格尺寸。
 * middle / default 为历史兼容别名，运行时统一归一为 medium，不再作为独立档位。
 */
export type TableSize = 'small' | 'medium' | 'large' | 'middle' | 'default';

/** 排序方向，空字符串表示不排序 */
export type TableSortOrder = 'asc' | 'desc' | '';

/** 受控排序状态（按单列排序） */
export interface TableSortState {
    /** 参与排序的列标识（列的 key） */
    column: string;
    /** 排序方向 */
    order: 'asc' | 'desc';
}

/** 列级筛选选项；声明后表头会渲染内置筛选行，也可通过 API 设置筛选值 */
export interface TableFilterOption {
    /** 展示文案 */
    label: string;
    /** 实际筛选值 */
    value: string | number | boolean;
}

/** 单列筛选值，支持单值与多值；空数组/空字符串表示该列不过滤 */
export type TableFilterValue = Array<string | number | boolean> | string | number | boolean | null | undefined;

/** 全部列的筛选值：列 key -> 选中值 */
export type TableFilterValues = Record<string, TableFilterValue>;

export interface TableColumn {
    /** 列标题 */
    title: string;
    /**
     * 列数据字段。支持点号路径与数组下标，例如 `user.name`、`items[0].name`、`items.0.name`。
     * 若行数据上存在同名字面字段（如 `{'user.name': 'x'}`），优先取字面字段。
     */
    dataIndex: string;
    /** 列标识 */
    key: string;
    /** 列宽度 */
    width?: number | string;
    /** 是否固定列 */
    fixed?: 'left' | 'right';
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';
    /**
     * 列级自定义渲染函数。返回 Node 直接挂载，返回字符串按纯文本插入（防 XSS）。
     * 优先级：`render` > `slot` > `col-{key}-{rowIndex}` slot > 字段值。
     * 无法通过 attribute 传入函数，请使用 property / setColumns 传入。
     */
    render?: (row: Record<string, unknown>, index: number) => string | Node | null | undefined;
    /**
     * 列级具名插槽。所有行共用同一个插槽内容（模板引擎不提供作用域插槽，拿不到行数据），
     * 需要按行动态渲染请使用 `render`。
     */
    slot?: string;
    /** 是否允许点击表头排序（默认关闭） */
    sortable?: boolean;
    /**
     * 自定义比较函数，仅在本地排序开启时使用。
     * 通过属性 JSON 无法传入函数，请使用 property / setColumns 传入。
     */
    sorter?: (a: Record<string, unknown>, b: Record<string, unknown>) => number;
    /** 列可选筛选值；声明后表头渲染内置筛选行，并参与默认的本地筛选 */
    filters?: TableFilterOption[];
}

/** 行选择模式 */
export type TableSelectionMode = 'multiple' | 'single';

/** 分页联动 detail（由 pagination 的 change 事件透传） */
export interface TablePaginationDetail {
    /** 当前页码 */
    current: number;
    /** 每页条数 */
    pageSize: number;
}

/** 排序变化事件 detail */
export interface TableSortChangeDetail {
    /** 列标识；clearSort 时为 null */
    column: string | null;
    /** 排序方向，空字符串表示取消排序 */
    order: TableSortOrder;
    /** 归一化后的排序状态，取消排序时为 null */
    sort: TableSortState | null;
}

/** 筛选变化事件 detail */
export interface TableFilterChangeDetail {
    /** 变化后的完整筛选值 */
    filters: Record<string, string[]>;
    /** 触发变化的列标识；批量设置/清空时为 null */
    column: string | null;
    /** 该列变化后的值；批量设置/清空时为 null */
    values: string[] | null;
}

/** 选择变化事件 detail */
export interface TableSelectionChangeDetail {
    /** 当前全部选中行的 key（可能包含当前数据中已不存在的 key） */
    selectedKeys: string[];
    /** 当前数据中仍存在且被选中的行 */
    selectedRows: Record<string, unknown>[];
    /** 触发本次变化的行；表头全选时为 undefined */
    row?: Record<string, unknown>;
    /** 该行变化后的选中状态；表头全选时为 undefined */
    selected?: boolean;
}

/** 展开变化事件 detail */
export interface TableExpandChangeDetail {
    /** 是否处于展开状态；程序化设置时为 undefined */
    expanded?: boolean;
    /** 触发展开的行；程序化设置时为 undefined */
    row?: Record<string, unknown>;
    /** 该行在当前展示数据中的索引；程序化设置时为 undefined */
    index?: number;
    /** 当前全部展开行的 key */
    expandedKeys: string[];
}

/** 数据变化事件 detail（数据源被替换时派发） */
export interface TableDataChangeDetail {
    /** 当前数据源 */
    dataSource: Record<string, unknown>[];
    /** 数据总条数（未经过本地筛选/排序） */
    total: number;
}

export interface TableProps {
    /** 表格列配置（attribute 传 JSON 字符串；property 也可直接传数组以保留 render/sorter 函数） */
    columns?: TableColumn[] | string;
    /** 表格数据（attribute 传 JSON 字符串；property 也可直接传数组） */
    dataSource?: Record<string, unknown>[] | string;
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
    /**
     * 行数据的唯一标识字段名；选择/展开状态以及行级单元格插槽 `col-{key}-{rowKey}` 定位都按此字段保留。
     * 未配置时组件按行对象引用生成稳定 id（同一行对象在排序/筛选后身份不变），
     * 并会在开发环境给出一次提示；数据源整体替换为新对象后身份仍会变化，推荐始终配置稳定字段。
     */
    rowKey?: string;
    /** 是否显示选择列 */
    selectable?: boolean;
    /** 选择模式：多选（默认）或单选 */
    selectionMode?: TableSelectionMode;
    /**
     * 受控选中 key 列表。设置后组件只派发 selection-change，不修改内部状态，
     * 需由使用方回写。未设置时为非受控。
     */
    selectedKeys?: string[] | string;
    /** 是否显示展开列 */
    expandable?: boolean;
    /**
     * 受控展开 key 列表。设置后组件只派发 expand-change，不修改内部状态，
     * 需由使用方回写。未设置时为非受控。
     */
    expandedKeys?: string[] | string;
    /**
     * 展开内容渲染函数；返回 Node 直接挂载，返回字符串按纯文本插入。
     * 无法通过 attribute 传入，请使用 property 赋值。slot 优先于渲染函数。
     */
    expandRender?: (row: Record<string, unknown>, index: number) => string | Node | null | undefined;
    /**
     * 受控排序状态。设置后点击表头只派发 sort-change，不修改内部状态，
     * 需由使用方回写。未设置时为非受控。
     */
    sort?: TableSortState | string;
    /**
     * 受控筛选值。设置后 API 调整筛选只派发 filter-change，不修改内部状态，
     * 需由使用方回写。未设置时为非受控。
     */
    filterValues?: TableFilterValues | string;
    /** 是否在组件内部对展示数据执行排序（默认开启；设置 remote 可关闭） */
    localSort?: boolean;
    /** 是否在组件内部对展示数据执行筛选（默认开启；设置 remote 可关闭） */
    localFilter?: boolean;
    /**
     * 远端模式：排序/筛选只管理状态并派发事件，不在组件内变换数据。
     * 同时关闭 localSort / localFilter 的本地计算。
     */
    remote?: boolean;
}
