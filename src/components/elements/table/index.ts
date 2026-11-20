/**
 * Solely Table 组件
 * 表格组件，用于展示结构化数据
 *
 * 能力概览：
 * - 排序：列级 sortable，点击表头按 asc → desc → 无 切换；支持受控/非受控
 * - 筛选：列级 filters 会在表头渲染内置筛选行；默认在组件内过滤
 * - 行选择：selectable，支持单选/多选、全选/半选，按 rowKey 保留选择
 * - 展开行：expandable，内容通过 slot 或 expandRender 提供
 * - 列级渲染：render(row, index) 返回 Node 或字符串；也支持列级/按行 slot
 * - 空态：复用 solely-empty，可通过 slot="empty" 自定义
 * - 分页联动：不做分页逻辑，通过 handlePaginationChange 把分页事件转出为 page-change
 *
 * 默认开启本地排序 / 筛选（传了 sortable / filters 即生效）。
 * 需要远端排序/筛选时设置 remote，组件只管理状态并派发事件。
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { oneOf } from '../../../shared/enum';
import type {
    TableProps,
    TableSize,
    TableColumn,
    TableSortState,
    TableSortOrder,
    TableFilterValues,
    TableFilterOption,
    TablePaginationDetail,
    TableSelectionMode,
} from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
import { safeJsonParse } from '../utils/helpers';

// 空态复用 solely-empty（side-effect 注册 <solely-empty>）
import '../empty';

const SORT_ORDER_ASC: TableSortOrder = 'asc';
const SORT_ORDER_DESC: TableSortOrder = 'desc';
const SORT_ORDER_NONE: TableSortOrder = '';

/** 选择列 / 展开列的默认宽度（与 style.css 保持一致，用于固定列偏移计算） */
const SELECTION_COLUMN_WIDTH = 48;
const EXPAND_COLUMN_WIDTH = 44;

@CustomElement({
    tagName: 'solely-table',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'columns', type: 'string', default: [] },
        { name: 'dataSource', type: 'string', default: [] },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'bordered', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'striped', type: 'boolean', default: false },
        { name: 'rowClickable', type: 'boolean', default: false },
        { name: 'rowKey', type: 'string' },
        { name: 'selectable', type: 'boolean', default: false },
        { name: 'selectionMode', type: 'string', default: 'multiple' },
        { name: 'selectedKeys', type: 'array' },
        { name: 'expandable', type: 'boolean', default: false },
        { name: 'expandedKeys', type: 'array' },
        { name: 'expandRender', type: 'object' },
        { name: 'sort', type: 'object' },
        { name: 'filterValues', type: 'object' },
        { name: 'localSort', type: 'boolean', default: true },
        { name: 'localFilter', type: 'boolean', default: true },
        { name: 'remote', type: 'boolean', default: false },
    ],
})
class SolelyTable extends BaseElement<TableProps> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): TableSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 非受控排序状态 */
    #sortState: TableSortState | null = null;

    /** 非受控筛选状态：列 key -> 选中值（字符串形式） */
    #filterValues: Record<string, string[]> = {};

    /** 非受控选中行 key */
    #selectedKeys = new Set<string>();

    /** 非受控展开行 key */
    #expandedKeys = new Set<string>();

    /** 未配置 rowKey 时，按行对象引用分配稳定 id（排序/筛选后不变） */
    #rowIdentity = new WeakMap<object, string>();
    #rowIdentitySeq = 0;

    /** 行身份相关警告只提示一次，避免每次刷新刷屏 */
    #warnedMissingRowKey = false;
    #warnedMissingRowKeyFields = new Set<string>();
    #warnedLocalComputation = false;

    /** 解析缓存：attribute 传入的 JSON 只解析一次，保证同一份数据得到相同的行对象引用 */
    #parsedColumnsCache: { raw: string; value: TableColumn[] } | null = null;
    #parsedDataSourceCache: { raw: string; value: Record<string, unknown>[] } | null = null;

    /**
     * 展示数据缓存：一次刷新内 getDisplayedDataSource 会被多处置求值（空态、行渲染、
     * 列级 render、展开渲染），按输入引用判断是否可复用，避免重复 filter/sort。
     * 所有会影响结果的输入（列、数据源、受控/非受控筛选与排序）都参与命中判断。
     */
    #displayedDataSourceCache: {
        columns: TableColumn[];
        dataSourceRaw: unknown;
        localFilter: boolean;
        localSort: boolean;
        remote: boolean;
        filterSource: unknown;
        sortSource: unknown;
        value: Record<string, unknown>[];
    } | null = null;

    /** 受控选中键缓存：同一份 selectedKeys 只归一化一次，供 Set.has 使用 */
    #controlledSelectionCache: { raw: unknown; set: Set<string>; array: string[] } | null = null;

    /** 非受控选中键数组缓存：Set 引用不变时复用 Array.from 结果 */
    #uncontrolledSelectionArrayCache: { source: Set<string>; array: string[] } | null = null;

    /** 是否已向 DOM 写入过固定列偏移（无固定列时用于判断能否直接跳过） */
    #fixedOffsetsApplied = false;

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
        classes['table--selectable'] = !!this.$data.selectable;
        classes['table--expandable'] = !!this.$data.expandable;
        return classes;
    }

    /**
     * 获取解析后的列配置
     */
    getParsedColumns(): TableColumn[] {
        const value = this.$data.columns;
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string' && value) {
            if (this.#parsedColumnsCache && this.#parsedColumnsCache.raw === value) {
                return this.#parsedColumnsCache.value;
            }
            const parsed = safeJsonParse<TableColumn[]>(value, []);
            this.#parsedColumnsCache = { raw: value, value: parsed };
            return parsed;
        }
        return [];
    }

    /**
     * dataSource 发生变化（含数组原地 push/splice）时清空展示缓存。
     *
     * 基座会为任何响应式变更调度重渲染，但缓存只按引用判断会继续返回旧结果；
     * 这里在渲染前失效缓存，保证通过代理数组的原地修改也能生效。
     */
    #handleReactiveDataChange = (event: Event): void => {
        const path = (event as CustomEvent).detail?.path as unknown;
        if (Array.isArray(path) && path[0] === 'dataSource') {
            this.#displayedDataSourceCache = null;
        }
    };

    created(): void {
        this.addEventListener('dataChange', this.#handleReactiveDataChange);
    }

    unmounted(): void {
        this.removeEventListener('dataChange', this.#handleReactiveDataChange);
    }

    /**
     * 刷新前丢弃展示数据缓存。
     *
     * 数据源可能被原地修改（响应式代理的 push/splice，或调用方持有原始数组后手动
     * refresh）：缓存只按引用判断会把修改前的结果继续返回，表现为“数据变了但表格不动”。
     */
    public refresh(): void {
        this.#displayedDataSourceCache = null;
        super.refresh();
    }

    /**
     * 获取解析后的数据源（未经过本地筛选/排序）
     */
    getParsedDataSource(): Record<string, unknown>[] {
        const value = this.$data.dataSource;
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string' && value) {
            if (this.#parsedDataSourceCache && this.#parsedDataSourceCache.raw === value) {
                return this.#parsedDataSourceCache.value;
            }
            const parsed = safeJsonParse<Record<string, unknown>[]>(value, []);
            this.#parsedDataSourceCache = { raw: value, value: parsed };
            return parsed;
        }
        return [];
    }

    /** 是否在组件内做本地排序（默认开启；remote 优先关闭） */
    private isLocalSortEnabled(): boolean {
        return !this.$data.remote && !!this.$data.localSort;
    }

    /** 是否在组件内做本地筛选（默认开启；remote 优先关闭） */
    private isLocalFilterEnabled(): boolean {
        return !this.$data.remote && !!this.$data.localFilter;
    }

    /**
     * 按 dataIndex 取值。
     * 支持 `user.name`、`items[0].name`、`items.0.name`；
     * 行对象上存在同名字面字段时优先取字面字段，兼容拍平数据。
     */
    private getValueByPath(row: Record<string, unknown>, path: string): unknown {
        if (!path) return undefined;
        if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];

        const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current: unknown = row;
        for (const segment of segments) {
            if (current == null || typeof current !== 'object') return undefined;
            current = (current as Record<string, unknown>)[segment];
        }
        return current;
    }

    /** 该列是否配置了列级 render 函数 */
    hasColumnRender(col: TableColumn): boolean {
        return typeof col.render === 'function';
    }

    /**
     * 单元格插槽名。
     * 规则：列级 `slot` > 稳定插槽 `col-{key}-{rowKey}` > 旧版按索引插槽 `col-{key}-{rowIndex}` > 字段值。
     * 稳定插槽与旧版插槽同时存在时稳定插槽优先；旧版插槽仅在稳定插槽不存在时作为兼容回退。
     */
    getCellSlotName(col: TableColumn, row: Record<string, unknown>, rowIndex: number): string {
        if (col.slot) return col.slot;

        const stableName = `col-${this.getColumnKey(col)}-${this.getRowKey(row, rowIndex)}`;
        if (this.hasSlotInLightDom(stableName)) return stableName;

        const legacyName = `col-${this.getColumnKey(col)}-${rowIndex}`;
        if (this.hasSlotInLightDom(legacyName)) return legacyName;

        // 都没有时仍渲染稳定名：用户按文档写稳定插槽即可生效
        return stableName;
    }

    /** 轻 DOM 中是否存在指定 name 的插槽内容（用于稳定插槽/旧版插槽的优先级判断） */
    private hasSlotInLightDom(name: string): boolean {
        return Array.from(this.children).some(child => child.getAttribute('slot') === name);
    }

    /**
     * 获取最终用于渲染的数据。
     * 默认（非 remote）在组件内执行筛选/排序；remote 时原样返回数据源。
     */
    public getDisplayedDataSource(): Record<string, unknown>[] {
        const columns = this.getParsedColumns();
        const dataSourceRaw = this.$data.dataSource;
        const localFilter = this.isLocalFilterEnabled();
        const localSort = this.isLocalSortEnabled();
        const remote = !!this.$data.remote;
        const filterSource = localFilter
            ? this.isFilterControlled()
                ? this.$data.filterValues
                : this.#filterValues
            : null;
        const sortSource = localSort ? (this.isSortControlled() ? this.$data.sort : this.#sortState) : null;

        const cached = this.#displayedDataSourceCache;
        if (
            cached &&
            cached.columns === columns &&
            cached.dataSourceRaw === dataSourceRaw &&
            cached.localFilter === localFilter &&
            cached.localSort === localSort &&
            cached.remote === remote &&
            cached.filterSource === filterSource &&
            cached.sortSource === sortSource
        ) {
            return cached.value;
        }

        let rows = this.getParsedDataSource();

        if (localFilter) {
            const filters = this.getEffectiveFilterValues();
            rows = rows.filter(row =>
                columns.every(col => {
                    const selected = filters[this.getColumnKey(col)] || [];
                    if (selected.length === 0) return true;
                    const cell = this.getCellValue(row, col);
                    return selected.some(value => String(value) === String(cell));
                }),
            );
        }

        if (localSort) {
            const sort = this.getSortState();
            if (sort) {
                const column = columns.find(col => this.getColumnKey(col) === sort.column);
                if (column) {
                    const direction = sort.order === 'desc' ? -1 : 1;
                    // slice 避免直接改动数据源
                    rows = rows.slice().sort((a, b) => this.compareRows(a, b, column) * direction);
                }
            }
        }

        this.#displayedDataSourceCache = {
            columns,
            dataSourceRaw,
            localFilter,
            localSort,
            remote,
            filterSource,
            sortSource,
            value: rows,
        };
        return rows;
    }

    /** 是否无数据可展示（用于空态） */
    isEmpty(): boolean {
        return !this.$data.loading && this.getDisplayedDataSource().length === 0;
    }

    /** 当前实际列数（含选择列与展开列），用于展开行的 colspan */
    getColumnCount(): number {
        return this.getParsedColumns().length + (this.$data.selectable ? 1 : 0) + (this.$data.expandable ? 1 : 0);
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
        classes[`align-${oneOf(col.align, ['left', 'center', 'right'], 'left')}`] = true;
        if (col.sortable) {
            classes['table__sortable'] = true;
        }
        if (this.getSortOrder(col)) {
            classes['is-sorted'] = true;
        }
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
        classes[`align-${oneOf(col.align, ['left', 'center', 'right'], 'left')}`] = true;
        return classes;
    }

    /** 当前选择模式（非法值回退多选） */
    getSelectionMode(): TableSelectionMode {
        return oneOf(this.$data.selectionMode, ['multiple', 'single'], 'multiple');
    }

    /** 是否存在左固定列（决定选择列是否一起固定） */
    hasFixedLeftColumns(): boolean {
        return this.getParsedColumns().some(col => col.fixed === 'left');
    }

    /** 是否存在右固定列（决定展开列是否一起固定） */
    hasFixedRightColumns(): boolean {
        return this.getParsedColumns().some(col => col.fixed === 'right');
    }

    /** 选择列 class（有左固定列时一起固定，避免被遮挡） */
    getSelectionCellClasses(): Record<string, boolean> {
        return { 'fixed-left': this.hasFixedLeftColumns() };
    }

    /** 展开列 class（有右固定列时一起固定） */
    getExpandCellClasses(): Record<string, boolean> {
        return { 'fixed-right': this.hasFixedRightColumns() };
    }

    /** 列宽转像素；无法从配置解析时返回 null，交给运行时实测补足 */
    private getColumnWidthPx(col: TableColumn): number | null {
        const width = col.width;
        if (typeof width === 'number' && Number.isFinite(width)) return width;
        if (typeof width === 'string') {
            const trimmed = width.trim();
            if (/^[0-9.]+(?:px)?$/i.test(trimmed)) {
                const value = parseFloat(trimmed);
                return Number.isFinite(value) ? value : null;
            }
        }
        return null;
    }

    /**
     * 计算并写入固定列偏移。
     * 多个左固定列按列宽累加 left，多个右固定列按列宽累加 right；
     * 选择列贴左、展开列贴右，一并纳入计算。
     */
    private syncFixedOffsets(): void {
        const root = this.shadowRoot;
        if (!root) return;

        const hasLeft = this.hasFixedLeftColumns();
        const hasRight = this.hasFixedRightColumns();

        // 无固定列是常态（默认配置）：从未写过偏移时直接跳过全表 DOM 查询；
        // 只有之前写过时才需要清一次残留（列配置从固定列改回普通列的场景）。
        if (!hasLeft && !hasRight) {
            if (!this.#fixedOffsetsApplied) return;
            this.#fixedOffsetsApplied = false;
            this.clearFixedOffsets(root);
            return;
        }
        this.#fixedOffsetsApplied = true;

        const headRow = root.querySelector('thead tr[part="head-row"]');
        if (!headRow) return;

        const columns = this.getParsedColumns();
        const columnsByKey = new Map(columns.map(col => [this.getColumnKey(col), col]));
        const headCells = Array.from(headRow.children) as HTMLElement[];

        // 优先用实测宽度（兼容百分比/auto），拿不到时回退到配置宽度
        const measurements = new Map<string, number>();
        let selectionWidth = SELECTION_COLUMN_WIDTH;
        let expandWidth = EXPAND_COLUMN_WIDTH;
        for (const cell of headCells) {
            const rectWidth = cell.getBoundingClientRect ? cell.getBoundingClientRect().width : 0;
            if (cell.classList.contains('table__selection-cell') && rectWidth > 0) {
                selectionWidth = rectWidth;
            }
            if (cell.classList.contains('table__expand-cell') && rectWidth > 0) {
                expandWidth = rectWidth;
            }
            const key = cell.dataset.colKey;
            if (!key) continue;
            if (rectWidth > 0) {
                measurements.set(key, rectWidth);
            } else {
                const col = columnsByKey.get(key);
                const configured = col ? this.getColumnWidthPx(col) : null;
                measurements.set(key, configured ?? 0);
            }
        }

        const selectable = !!this.$data.selectable;
        const expandable = !!this.$data.expandable;

        const leftOffsets = new Map<string, number>();
        if (hasLeft) {
            let offset = selectable ? selectionWidth : 0;
            for (const col of columns) {
                if (col.fixed !== 'left') continue;
                const key = this.getColumnKey(col);
                leftOffsets.set(key, offset);
                offset += measurements.get(key) ?? this.getColumnWidthPx(col) ?? 0;
            }
        }

        const rightOffsets = new Map<string, number>();
        if (hasRight) {
            let offset = expandable ? expandWidth : 0;
            for (let index = columns.length - 1; index >= 0; index--) {
                const col = columns[index];
                if (col.fixed !== 'right') continue;
                const key = this.getColumnKey(col);
                rightOffsets.set(key, offset);
                offset += measurements.get(key) ?? this.getColumnWidthPx(col) ?? 0;
            }
        }

        const applyOffset = (node: Element, prop: 'left' | 'right', value: number | null) => {
            const el = node as HTMLElement;
            if (!el.style) return;
            if (value == null) {
                el.style.removeProperty(prop);
            } else if (el.style.getPropertyValue(prop) !== `${value}px`) {
                el.style.setProperty(prop, `${value}px`);
            }
        };

        root.querySelectorAll('th.table__selection-cell, td.table__selection-cell').forEach(node => {
            applyOffset(node, 'left', hasLeft ? 0 : null);
        });
        root.querySelectorAll('th.table__expand-cell, td.table__expand-cell').forEach(node => {
            applyOffset(node, 'right', hasRight ? 0 : null);
        });

        root.querySelectorAll('th[data-col-key], td[data-col-key]').forEach(node => {
            const key = (node as HTMLElement).dataset.colKey || '';
            const col = columnsByKey.get(key);
            if (!col) return;

            applyOffset(node, 'left', col.fixed === 'left' ? (leftOffsets.get(key) ?? null) : null);
            applyOffset(node, 'right', col.fixed === 'right' ? (rightOffsets.get(key) ?? null) : null);
        });
    }

    /** 列配置从固定列改回普通列时，清理上一次写入的内联偏移 */
    private clearFixedOffsets(root: ShadowRoot): void {
        root.querySelectorAll(
            [
                'th.table__selection-cell, td.table__selection-cell,',
                'th.table__expand-cell, td.table__expand-cell,',
                'th[data-col-key], td[data-col-key]',
            ].join(' '),
        ).forEach(node => {
            const el = node as HTMLElement;
            if (!el.style) return;
            el.style.removeProperty('left');
            el.style.removeProperty('right');
        });
    }

    /** 行 class 对象 */
    getRowClasses(row: Record<string, unknown>, index: number): Record<string, boolean> {
        return {
            'table__row--selected': !!this.$data.selectable && this.isRowSelected(row, index),
            'table__row--expanded': !!this.$data.expandable && this.isRowExpanded(row, index),
        };
    }

    /**
     * 获取排序方向图标
     */
    getSortIcon(col: TableColumn): string {
        const order = this.getSortOrder(col);
        if (order === SORT_ORDER_ASC) return '↑';
        if (order === SORT_ORDER_DESC) return '↓';
        return '';
    }

    /** 排序图标 class */
    getSortIconClasses(col: TableColumn): Record<string, boolean> {
        const order = this.getSortOrder(col);
        return {
            'is-active': order !== SORT_ORDER_NONE,
        };
    }

    /**
     * 表头 aria-sort。非排序列返回 null，由渲染器移除该属性。
     */
    getAriaSort(col: TableColumn): 'ascending' | 'descending' | 'none' | null {
        if (!col.sortable) return null;
        const order = this.getSortOrder(col);
        if (order === SORT_ORDER_ASC) return 'ascending';
        if (order === SORT_ORDER_DESC) return 'descending';
        return 'none';
    }

    mounted(): void {
        this.refresh();
    }

    /**
     * 每次渲染完成后注入 expandRender 返回的内容。
     * 仅处理没有对应 slot 的展开行。
     */
    updated(): void {
        const root = this.shadowRoot;
        if (!root) return;

        // 显式关闭本地计算时提示：只派发事件，不改变数据
        this.warnAboutLocalComputation();

        // 未配置 row-key 且启用了依赖行身份的能力时，给出一次开发期提示
        this.warnAboutRowKey();

        // 列级 render 的内容在渲染后注入（返回字符串按纯文本插入）
        this.renderColumnCells();

        // 固定列偏移按列宽累加，选择列/展开列一并参与
        this.syncFixedOffsets();

        // 展开行的 colspan 依赖运行时列数，模板无法直接写动态属性
        root.querySelectorAll('.table__expand-detail').forEach(cell => {
            cell.setAttribute('colspan', String(this.getColumnCount()));
        });

        const render = this.$data.expandRender;
        if (typeof render !== 'function') return;

        const rows = this.getDisplayedDataSource();
        root.querySelectorAll('.table__expand-render').forEach(node => {
            const container = node as HTMLElement;
            const index = Number(container.dataset.expandIndex);
            const row = rows[index];
            if (!row) {
                container.replaceChildren();
                return;
            }

            const content = render(row, index);
            if (content == null) {
                container.replaceChildren();
            } else if (content instanceof Node) {
                container.replaceChildren(content);
            } else {
                container.replaceChildren(String(content));
            }
        });
    }

    /**
     * 获取单元格值（支持嵌套路径与数组下标）
     */
    getCellValue(row: Record<string, unknown>, col: TableColumn): unknown {
        return this.getValueByPath(row, col.dataIndex);
    }

    /** 渲染列级 render 返回的内容；字符串按纯文本插入，避免 XSS */
    private renderColumnCells(): void {
        const root = this.shadowRoot;
        if (!root) return;

        const nodes = root.querySelectorAll('.table__cell-render');
        if (nodes.length === 0) return;

        const columns = new Map(this.getParsedColumns().map(col => [this.getColumnKey(col), col]));
        const rows = this.getDisplayedDataSource();

        nodes.forEach(node => {
            const container = node as HTMLElement;
            const col = columns.get(container.dataset.colKey || '');
            const index = Number(container.dataset.rowIndex);
            const row = rows[index];

            if (!col || typeof col.render !== 'function' || !row) {
                container.replaceChildren();
                return;
            }

            const content = col.render(row, index);
            if (content == null) {
                container.replaceChildren();
            } else if (content instanceof Node) {
                container.replaceChildren(content);
            } else {
                container.replaceChildren(document.createTextNode(String(content)));
            }
        });
    }

    /** 显式关闭本地排序/筛选时提示一次，避免“传了 sortable/filters 却只收到事件”的困惑 */
    private warnAboutLocalComputation(): void {
        if (this.#warnedLocalComputation || this.$data.remote) return;

        const columns = this.getParsedColumns();
        const sortOnly = !this.$data.localSort && columns.some(col => col.sortable);
        const filterOnly = !this.$data.localFilter && columns.some(col => (col.filters || []).length > 0);
        if (!sortOnly && !filterOnly) return;

        this.#warnedLocalComputation = true;
        const parts = [sortOnly ? '排序' : '', filterOnly ? '筛选' : ''].filter(Boolean).join(' / ');
        this.warn(true, `本地${parts}已关闭：组件只管理状态并派发事件，需由使用方自行变换数据。`);
    }

    /** 未配置 row-key 且实际启用了依赖行身份的能力时提示一次 */
    private warnAboutRowKey(): void {
        if (this.#warnedMissingRowKey) return;

        const columns = this.getParsedColumns();
        const needsIdentity =
            !!this.$data.selectable ||
            !!this.$data.expandable ||
            (this.isLocalSortEnabled() && columns.some(col => col.sortable)) ||
            (this.isLocalFilterEnabled() && columns.some(col => (col.filters || []).length > 0));

        if (!this.$data.rowKey && needsIdentity) {
            this.#warnedMissingRowKey = true;
            this.warn(
                true,
                '未配置 row-key：选择、展开与本地排序/筛选会按行对象引用生成稳定 id。' +
                    '排序/筛选不会漂移，但数据源替换为新对象后身份会变化；推荐为每行提供稳定的 row-key 字段。',
            );
        }
    }

    /**
     * 行点击事件
     *
     * 事件契约：只派发一次 CustomEvent('row-click')，detail 为 `{ row, index }`。
     * 不再手动派发 click —— 原生 click 已会从行冒泡到宿主元素，
     * 额外派发会造成监听 click 的一方收到两次。
     */
    handleRowClick(row: Record<string, unknown>, index: number): void {
        if (!this.$data.rowClickable) return;

        this.emit('row-click', {
            row,
            index,
        });
    }

    /**
     * 行是否参与键盘交互时的 tabindex。
     *
     * - 无 row-click 且不可选：不聚焦
     * - 仅 row-click：行是唯一操作件，进入 Tab 序列（0）
     * - 可选中：复选框已是该行的 Tab 停点，行用 -1 保持可被点击/focus() 聚焦，
     *   但不额外占用一个 Tab 停点，避免同一行出现两个停点
     */
    getRowTabIndex(): string | null {
        if (!this.$data.selectable && !this.$data.rowClickable) return null;
        return this.$data.selectable ? '-1' : '0';
    }

    /**
     * 行键盘激活：Enter / Space 触发与行点击一致的行为。
     * 仅处理行自身获得焦点的情况，复选框/展开按钮等内部控件的键盘事件不重复触发。
     *
     * - 行可点击：派发 row-click，与鼠标点击一致；
     * - 仅可选择（未开启 row-clickable）：切换该行选中状态。这里直接调用
     *   toggleRowSelection + refresh，不产生原生 checkbox click，因此无需
     *   preventDefault，也不会出现 input.checked 与状态失同步。
     */
    handleRowKeydown(row: Record<string, unknown>, index: number, event: KeyboardEvent): void {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (!this.$data.selectable && !this.$data.rowClickable) return;
        event.preventDefault();

        if (this.$data.rowClickable) {
            this.handleRowClick(row, index);
            return;
        }

        this.toggleRowSelection(row, index);
        this.refresh();
    }

    /* -------------------- 排序 -------------------- */

    /** 是否处于受控排序模式（sort 有值即视为受控） */
    isSortControlled(): boolean {
        const raw = this.$data.sort;
        if (raw == null) return false;
        if (typeof raw === 'string') return raw.trim() !== '';
        return typeof raw === 'object';
    }

    /** 归一化排序状态（接受对象或 JSON 字符串） */
    private normalizeSortState(raw: unknown): TableSortState | null {
        let value = raw;
        if (typeof value === 'string') {
            if (!value.trim()) return null;
            value = safeJsonParse<unknown>(value, null);
        }
        if (!value || typeof value !== 'object') return null;

        const record = value as Record<string, unknown>;
        const column = typeof record.column === 'string' ? record.column : '';
        const order =
            record.order === SORT_ORDER_DESC ? SORT_ORDER_DESC : record.order === SORT_ORDER_ASC ? SORT_ORDER_ASC : '';
        if (!column || !order) return null;
        return { column, order };
    }

    /** 当前生效的排序状态（受控优先） */
    public getSortState(): TableSortState | null {
        if (this.isSortControlled()) return this.normalizeSortState(this.$data.sort);
        return this.#sortState;
    }

    private isSameSort(a: TableSortState | null, b: TableSortState | null): boolean {
        if (!a || !b) return a === b;
        return a.column === b.column && a.order === b.order;
    }

    private getColumnKey(col: TableColumn): string {
        return col.key || col.dataIndex;
    }

    /** 某列当前的排序方向 */
    getSortOrder(col: TableColumn): TableSortOrder {
        const sort = this.getSortState();
        if (!sort || sort.column !== this.getColumnKey(col)) return SORT_ORDER_NONE;
        return sort.order;
    }

    /**
     * 点击表头排序（非排序列忽略）。
     */
    handleHeaderClick(col: TableColumn): void {
        if (!col.sortable) return;
        this.toggleSortColumn(col);
    }

    /**
     * 表头键盘排序：Enter / Space
     */
    handleHeaderKeydown(col: TableColumn, event: KeyboardEvent): void {
        if (!col.sortable) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.toggleSortColumn(col);
    }

    /** asc → desc → 无 */
    private toggleSortColumn(col: TableColumn): void {
        const key = this.getColumnKey(col);
        const current = this.getSortState();
        let next: TableSortOrder;
        if (current && current.column === key) {
            next = current.order === SORT_ORDER_ASC ? SORT_ORDER_DESC : SORT_ORDER_NONE;
        } else {
            next = SORT_ORDER_ASC;
        }
        this.applySort(key, next);
    }

    private applySort(column: string | null, order: TableSortOrder, silent = false): void {
        const next = column && order ? { column, order } : null;
        const current = this.getSortState();

        if (!this.isSortControlled()) {
            this.#sortState = next;
            if (!this.isSameSort(current, next)) this.refresh();
        }

        if (!silent) {
            this.emit('sort-change', {
                column: next ? next.column : null,
                order: next ? next.order : SORT_ORDER_NONE,
                sort: next,
            });
        }
    }

    /** 程序化设置排序 */
    public setSort(column: string, order: 'asc' | 'desc' = 'asc'): void {
        this.applySort(column, order === SORT_ORDER_DESC ? SORT_ORDER_DESC : SORT_ORDER_ASC);
    }

    /** 清除排序 */
    public clearSort(): void {
        this.applySort(null, SORT_ORDER_NONE);
    }

    /** 默认比较规则：自定义 sorter > 数字 > 日期 > 字符串 */
    private compareRows(a: Record<string, unknown>, b: Record<string, unknown>, col: TableColumn): number {
        if (typeof col.sorter === 'function') return col.sorter(a, b);

        const av = this.getCellValue(a, col);
        const bv = this.getCellValue(b, col);

        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        if (typeof av === 'number' && typeof bv === 'number') return av - bv;

        if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();

        return String(av).localeCompare(String(bv));
    }

    /* -------------------- 筛选 -------------------- */

    /** 是否处于受控筛选模式（filterValues 有值即视为受控） */
    isFilterControlled(): boolean {
        const raw = this.$data.filterValues;
        if (raw == null) return false;
        if (typeof raw === 'string') return raw.trim() !== '';
        return typeof raw === 'object';
    }

    private normalizeFilterValue(value: unknown): string[] {
        if (value == null) return [];
        if (Array.isArray(value)) {
            return value
                .filter(item => item != null)
                .map(item => String(item))
                .filter(item => item !== '');
        }
        const text = String(value);
        return text === '' ? [] : [text];
    }

    private normalizeFilterValues(raw: unknown): Record<string, string[]> {
        let value = raw;
        if (typeof value === 'string') {
            if (!value.trim()) return {};
            value = safeJsonParse<unknown>(value, {});
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

        const result: Record<string, string[]> = {};
        for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
            const values = this.normalizeFilterValue(rawValue);
            if (values.length > 0) result[key] = values;
        }
        return result;
    }

    private cloneFilters(filters: Record<string, string[]>): Record<string, string[]> {
        const cloned: Record<string, string[]> = {};
        for (const [key, values] of Object.entries(filters)) {
            cloned[key] = values.slice();
        }
        return cloned;
    }

    /** 当前生效的筛选值（受控优先） */
    public getFilterValues(): Record<string, string[]> {
        return this.cloneFilters(this.getEffectiveFilterValues());
    }

    private getEffectiveFilterValues(): Record<string, string[]> {
        if (this.isFilterControlled()) return this.normalizeFilterValues(this.$data.filterValues);
        return this.#filterValues;
    }

    private applyFilterValues(
        next: Record<string, string[]>,
        column: string | null,
        values: string[] | null,
        silent = false,
    ): void {
        const controlled = this.isFilterControlled();
        if (!controlled) {
            this.#filterValues = this.cloneFilters(next);
        }
        // 受控模式下父级可能不回写：重渲染让原生复选框回到绑定值，避免残留临时翻转
        this.refresh();

        if (!silent) {
            this.emit('filter-change', {
                filters: this.cloneFilters(next),
                column,
                values: values ? values.slice() : null,
            });
        }
    }

    /** 设置单列筛选值；传空值等于清除该列 */
    public setFilter(column: string, values: TableFilterValues[string], silent = false): void {
        const next = this.cloneFilters(this.getEffectiveFilterValues());
        const normalized = this.normalizeFilterValue(values);
        if (normalized.length > 0) {
            next[column] = normalized;
        } else {
            delete next[column];
        }
        this.applyFilterValues(next, column, normalized, silent);
    }

    /** 批量设置筛选值 */
    public setFilterValues(values: TableFilterValues, silent = false): void {
        const normalized = this.normalizeFilterValues(values);
        this.applyFilterValues(normalized, null, null, silent);
    }

    /** 是否存在带 filters 的列（决定是否渲染内置筛选行） */
    hasFilterableColumn(): boolean {
        return this.getParsedColumns().some(col => (col.filters || []).length > 0);
    }

    /** 某列当前选中的筛选值（字符串形式） */
    private getColumnFilterValues(col: TableColumn): string[] {
        return this.getEffectiveFilterValues()[this.getColumnKey(col)] || [];
    }

    /** 某列是否有生效中的筛选（用于显示清除按钮与激活态） */
    hasColumnFilter(col: TableColumn): boolean {
        return this.getColumnFilterValues(col).length > 0;
    }

    /** 内置筛选行中某个选项是否已选中 */
    isFilterOptionChecked(col: TableColumn, option: TableFilterOption): boolean {
        const value = String(option.value);
        return this.getColumnFilterValues(col).some(item => item === value);
    }

    /** 内置筛选行勾选/取消勾选 */
    handleFilterOptionChange(col: TableColumn, option: TableFilterOption, event: Event): void {
        const checked = !!(event.target as HTMLInputElement | null)?.checked;
        const value = String(option.value);
        const current = this.getColumnFilterValues(col);
        const next = checked
            ? current.includes(value)
                ? current
                : [...current, value]
            : current.filter(item => item !== value);

        this.setFilter(this.getColumnKey(col), next);
    }

    /** 清除全部或指定列的筛选 */
    public clearFilters(column?: string, silent = false): void {
        if (column) {
            const next = this.cloneFilters(this.getEffectiveFilterValues());
            delete next[column];
            this.applyFilterValues(next, column, [], silent);
            return;
        }
        this.applyFilterValues({}, null, null, silent);
    }

    /* -------------------- 行选择 -------------------- */

    /**
     * 行 key。
     * 配置 rowKey 时取该字段；未配置时按行对象引用分配稳定 id，
     * 因此排序/筛选换位置不会改变身份（数据源替换为新对象时才会变化）。
     */
    public getRowKey(row: Record<string, unknown>, index: number): string {
        const key = this.$data.rowKey;
        if (key) {
            const value = this.getValueByPath(row, key);
            if (value != null) return String(value);
            this.warnMissingRowKeyField(key);
        }
        return this.getStableRowKey(row, index);
    }

    private getStableRowKey(row: Record<string, unknown>, index: number): string {
        if (row && typeof row === 'object') {
            let id = this.#rowIdentity.get(row as object);
            if (!id) {
                id = `#row-${++this.#rowIdentitySeq}`;
                this.#rowIdentity.set(row as object, id);
            }
            return id;
        }
        return `#row-${index}`;
    }

    private warnMissingRowKeyField(key: string): void {
        if (this.#warnedMissingRowKeyFields.has(key)) return;
        this.#warnedMissingRowKeyFields.add(key);
        this.warn(true, `row-key "${key}" 在部分行中不存在，已回退为按行对象引用生成的稳定 id，请检查数据字段。`);
    }

    private normalizeKeyList(raw: unknown): string[] {
        if (Array.isArray(raw)) {
            return raw.filter(item => item != null).map(item => String(item));
        }
        if (typeof raw === 'string' && raw.trim()) {
            const parsed = safeJsonParse<unknown>(raw, null);
            if (Array.isArray(parsed)) {
                return parsed.filter(item => item != null).map(item => String(item));
            }
            if (raw.includes(',')) {
                return raw
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean);
            }
            return [raw];
        }
        return [];
    }

    isSelectionControlled(): boolean {
        const raw = this.$data.selectedKeys;
        if (raw == null) return false;
        if (typeof raw === 'string') return raw.trim() !== '';
        return Array.isArray(raw);
    }

    isExpansionControlled(): boolean {
        const raw = this.$data.expandedKeys;
        if (raw == null) return false;
        if (typeof raw === 'string') return raw.trim() !== '';
        return Array.isArray(raw);
    }

    /** 受控选中数据的归一化缓存（按 raw 引用缓存，避免每次调用重新归一化） */
    private getControlledSelectionCache(): { raw: unknown; set: Set<string>; array: string[] } {
        const raw = this.$data.selectedKeys;
        const cached = this.#controlledSelectionCache;
        if (cached && cached.raw === raw) return cached;

        const array = this.normalizeKeyList(raw);
        const next = { raw, set: new Set(array), array };
        this.#controlledSelectionCache = next;
        return next;
    }

    /** 当前生效的选中键集合 */
    private getEffectiveSelectedKeySet(): Set<string> {
        if (this.isSelectionControlled()) return this.getControlledSelectionCache().set;
        return this.#selectedKeys;
    }

    private getEffectiveSelectedKeys(): string[] {
        if (this.isSelectionControlled()) return this.getControlledSelectionCache().array;
        const cached = this.#uncontrolledSelectionArrayCache;
        if (cached && cached.source === this.#selectedKeys) return cached.array;

        const array = Array.from(this.#selectedKeys);
        this.#uncontrolledSelectionArrayCache = { source: this.#selectedKeys, array };
        return array;
    }

    private getEffectiveExpandedKeys(): string[] {
        if (this.isExpansionControlled()) return this.normalizeKeyList(this.$data.expandedKeys);
        return Array.from(this.#expandedKeys);
    }

    private listsEqual(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((item, index) => item === b[index]);
    }

    /** 当前选中行 key（返回副本，避免调用方修改内部缓存） */
    public getSelectedKeys(): string[] {
        return this.getEffectiveSelectedKeys().slice();
    }

    /** 当前选中行（仅当前数据中仍存在的行） */
    public getSelectedRows(): Record<string, unknown>[] {
        return this.getRowsByKeys(this.getEffectiveSelectedKeys());
    }

    private getRowsByKeys(keys: string[]): Record<string, unknown>[] {
        const target = new Set(keys);
        const rows: Record<string, unknown>[] = [];
        this.getParsedDataSource().forEach((row, index) => {
            if (target.has(this.getRowKey(row, index))) rows.push(row);
        });
        return rows;
    }

    /** 某行是否被选中（按行 key 做 Set.has，避免每行重建数组 + includes 的 O(n) 扫描） */
    isRowSelected(row: Record<string, unknown>, index: number): boolean {
        return this.getEffectiveSelectedKeySet().has(this.getRowKey(row, index));
    }

    /** 全选状态（仅针对当前展示数据） */
    isAllDisplayedSelected(): boolean {
        const rows = this.getDisplayedDataSource();
        if (!this.$data.selectable || rows.length === 0) return false;
        return rows.every((row, index) => this.isRowSelected(row, index));
    }

    /** 半选状态 */
    isSelectionIndeterminate(): boolean {
        if (!this.$data.selectable || this.getSelectionMode() === 'single') return false;
        const rows = this.getDisplayedDataSource();
        if (rows.length === 0) return false;
        const selectedCount = rows.filter((row, index) => this.isRowSelected(row, index)).length;
        return selectedCount > 0 && selectedCount < rows.length;
    }

    private emitSelectionChange(keys: string[], row?: Record<string, unknown>, selected?: boolean): void {
        this.emit('selection-change', {
            selectedKeys: keys,
            selectedRows: this.getRowsByKeys(keys),
            row,
            selected,
        });
    }

    private applySelectedKeys(next: string[], row?: Record<string, unknown>, selected?: boolean, silent = false): void {
        const nextKeys = Array.from(new Set(next.map(String)));
        const changed = !this.listsEqual(this.getEffectiveSelectedKeys(), nextKeys);

        if (!this.isSelectionControlled() && changed) {
            this.#selectedKeys = new Set(nextKeys);
            this.refresh();
        }

        if (!silent && changed) this.emitSelectionChange(nextKeys, row, selected);
    }

    /** 切换某行选中状态 */
    public toggleRowSelection(row: Record<string, unknown>, index: number): void {
        if (!this.$data.selectable) return;

        const key = this.getRowKey(row, index);
        const current = this.getEffectiveSelectedKeys();
        const isSelected = this.getEffectiveSelectedKeySet().has(key);

        let next: string[];
        const selectionMode = this.getSelectionMode();
        if (selectionMode === 'single') {
            next = isSelected ? [] : [key];
        } else {
            next = isSelected ? current.filter(item => item !== key) : [...current, key];
        }

        this.applySelectedKeys(next, row, !isSelected);
    }

    /** 设置选中行 key */
    public setSelectedKeys(keys: string[], silent = false): void {
        this.applySelectedKeys(this.normalizeKeyList(keys), undefined, undefined, silent);
    }

    /** 清空选择 */
    public clearSelection(silent = false): void {
        this.applySelectedKeys([], undefined, undefined, silent);
    }

    /**
     * 行选择框点击：阻止冒泡避免触发行点击。
     *
     * 这里刻意不调用 preventDefault()：
     * 原生 checkbox 的 checked 翻转发生在 click 监听器之前；若在此取消默认行为，
     * 浏览器只会在「微任务检查点之后」才把 checked/indeterminate 回滚到点击前的值。
     * 组件的 refresh 恰好排在同一次点击的微任务里，渲染时读到的是翻转后的临时值，
     * renderIR 的布尔属性脏检查判定“无需写入”而跳过；随后浏览器回滚，DOM 属性就停在
     * 旧值（真实指针点击与键盘 Space 激活均可复现，脚本 click() 因回滚先于微任务而不复现）。
     *
     * 因此让原生翻转正常生效，再由紧随其后的 refresh 把 DOM 对齐到组件状态。
     * 这里统一 refresh 一次（同一微任务内的重复调度会被合并）：既覆盖受控模式下
     * 使用方未回写 selectedKeys、需要立即纠正原生翻转的场景，也覆盖空表等无状态变化场景。
     */
    handleRowSelectClick(row: Record<string, unknown>, index: number, event: Event): void {
        event.stopPropagation();
        this.toggleRowSelection(row, index);
        this.refresh();
    }

    /**
     * 表头全选/取消全选（仅多选模式）
     *
     * 同 handleRowSelectClick：不取消原生默认行为，避免 preventDefault 的回滚
     * 晚于微任务渲染而导致表头 checkbox/indeterminate 停在陈旧值。
     */
    handleSelectAllClick(event: Event): void {
        event.stopPropagation();
        if (!this.$data.selectable || this.getSelectionMode() === 'single') return;

        const rows = this.getDisplayedDataSource();
        if (rows.length === 0) {
            // 空表时点击仍会触发原生翻转，需要重新渲染把它纠正回来
            this.refresh();
            return;
        }

        const current = this.getEffectiveSelectedKeys();
        const currentSet = this.getEffectiveSelectedKeySet();
        const rowKeys = rows.map((row, index) => this.getRowKey(row, index));
        const rowKeySet = new Set(rowKeys);
        const allSelected = rowKeys.every(key => currentSet.has(key));

        const next = allSelected
            ? current.filter(key => !rowKeySet.has(key))
            : [...current, ...rowKeys.filter(key => !currentSet.has(key))];

        this.applySelectedKeys(next, undefined, !allSelected);
        this.refresh();
    }

    /* -------------------- 展开行 -------------------- */

    private getExpandSlotName(row: Record<string, unknown>, index: number): string {
        // 复用 getRowKey 的嵌套路径解析（rowKey="user.id" 等），
        // 避免插槽名在嵌套字段下退化为行索引、与文档承诺不一致。
        return `expand-${this.getRowKey(row, index)}`;
    }

    private hasSlot(name: string): boolean {
        return Array.from(this.children).some(child => child.getAttribute('slot') === name);
    }

    /** 该展开行是否由 expandRender 渲染（有对应 slot 时以 slot 为准） */
    shouldRenderExpand(row: Record<string, unknown>, index: number): boolean {
        return typeof this.$data.expandRender === 'function' && !this.hasSlot(this.getExpandSlotName(row, index));
    }

    /** 某行是否处于展开状态 */
    isRowExpanded(row: Record<string, unknown>, index: number): boolean {
        return this.getEffectiveExpandedKeys().includes(this.getRowKey(row, index));
    }

    /** 当前展开行 key */
    public getExpandedKeys(): string[] {
        return this.getEffectiveExpandedKeys();
    }

    private emitExpandChange(keys: string[], row?: Record<string, unknown>, index?: number, expanded?: boolean): void {
        this.emit('expand-change', {
            expandedKeys: keys,
            row,
            index,
            expanded,
        });
    }

    private applyExpandedKeys(
        next: string[],
        row?: Record<string, unknown>,
        index?: number,
        expanded?: boolean,
        silent = false,
    ): void {
        const nextKeys = Array.from(new Set(next.map(String)));
        const changed = !this.listsEqual(this.getEffectiveExpandedKeys(), nextKeys);

        if (!this.isExpansionControlled() && changed) {
            this.#expandedKeys = new Set(nextKeys);
            this.refresh();
        }

        if (!silent && changed) this.emitExpandChange(nextKeys, row, index, expanded);
    }

    /** 切换某行展开状态 */
    public toggleRowExpansion(row: Record<string, unknown>, index: number): void {
        if (!this.$data.expandable) return;

        const key = this.getRowKey(row, index);
        const current = this.getEffectiveExpandedKeys();
        const isExpanded = current.includes(key);
        const next = isExpanded ? current.filter(item => item !== key) : [...current, key];

        this.applyExpandedKeys(next, row, index, !isExpanded);
    }

    /** 设置展开行 key */
    public setExpandedKeys(keys: string[], silent = false): void {
        this.applyExpandedKeys(this.normalizeKeyList(keys), undefined, undefined, undefined, silent);
    }

    /** 展开行按钮点击 */
    handleExpandClick(row: Record<string, unknown>, index: number, event: Event): void {
        event.stopPropagation();
        this.toggleRowExpansion(row, index);
    }

    /* -------------------- 分页联动 -------------------- */

    /**
     * 接收 pagination 的 change 事件（或 detail），转出为 page-change。
     * table 不执行分页计算，数据切片/远端请求由使用方完成。
     */
    public handlePaginationChange(input: TablePaginationDetail | Event): void {
        const detail =
            typeof Event !== 'undefined' && input instanceof Event
                ? ((input as CustomEvent<TablePaginationDetail>).detail as TablePaginationDetail | undefined)
                : (input as TablePaginationDetail | undefined);

        if (!detail) return;

        const current = Math.max(1, Math.floor(Number(detail.current)) || 1);
        const pageSize = Math.max(1, Math.floor(Number(detail.pageSize)) || 10);

        this.emit('page-change', { current, pageSize });
    }

    /* -------------------- 属性钩子 -------------------- */

    /**
     * 数据源变化（含 attribute 更新）时派发 data-change。
     *
     * 注意：受控属性的「切换回非受控」请通过 property 赋值为 undefined 实现；
     * 移除 HTML attribute 会被框架回落为旧值，组件无法感知。
     */
    attributeChanged(name: string, _oldValue: unknown, _newValue: unknown): void {
        if (name !== 'data-source') return;

        const dataSource = this.getParsedDataSource();
        this.emit('data-change', { dataSource, total: dataSource.length });
    }

    /**
     * 设置列配置
     */
    public setColumns(columns: TableColumn[]): void {
        // 直接保存数组，保留 render / sorter 等函数；attribute 路径仍走 JSON
        this.$data.columns = columns;
    }

    /**
     * 设置数据源
     */
    public setDataSource(dataSource: Record<string, unknown>[]): void {
        // 直接保存数组，保留行对象身份与 Date 等值；attribute 路径仍走 JSON
        this.$data.dataSource = dataSource;
        this.emit('data-change', { dataSource, total: dataSource.length });
    }

    /**
     * 获取数据源
     */
    public getDataSource(): Record<string, unknown>[] {
        return this.getParsedDataSource();
    }
}

export default SolelyTable;
export { SolelyTable };
