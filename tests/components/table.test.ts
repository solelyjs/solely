import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TableColumn } from '../../src/components/elements/table/types';
import { toRaw } from '../../src/runtime/reactivity';

// 引入组件即自动注册自定义元素 <solely-table>（sideEffects 已覆盖）
import '../../src/components/elements/table';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

const COLUMNS: TableColumn[] = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 100 },
    { title: 'Age', dataIndex: 'age', key: 'age', align: 'right' },
];

const DATA = [
    { name: 'Alice', age: 20 },
    { name: 'Bob', age: 30 },
];

function createTable(
    attrs: Record<string, string> = {},
    columns: TableColumn[] = COLUMNS,
    data: Record<string, unknown>[] = DATA,
) {
    const el = document.createElement('solely-table') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    el.setAttribute('columns', JSON.stringify(columns));
    el.setAttribute('data-source', JSON.stringify(data));
    document.body.appendChild(el);
    return el as any;
}

describe('solely-table', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render headers and rows from columns/data-source', async () => {
        const el = createTable();
        await tick();
        const heads = [...el.shadowRoot.querySelectorAll('th')].map((t: any) => t.textContent);
        expect(heads).toContain('Name');
        expect(heads).toContain('Age');

        const rows = el.shadowRoot.querySelectorAll('tr[part="row"]');
        expect(rows.length).toBe(2);
        // 单元格值正确
        const firstRowCells = [...rows[0].querySelectorAll('td')].map((c: any) => c.textContent);
        expect(firstRowCells).toContain('Alice');
        expect(firstRowCells).toContain('20');
        // 宽度样式生效
        expect(el.shadowRoot.querySelector('th').getAttribute('style')).toContain('100px');
    });

    it('数组 dataSource 按引用感知：代理数组原地修改自动刷新，原始数组需 refresh', async () => {
        const el = createTable();
        await tick();
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(2);

        const rows = [{ name: 'Carol', age: 40 }];
        el.setDataSource(rows);
        await tick();

        // 保留调用方数组的引用（$data 是响应式代理，比较前先取 raw）
        expect(toRaw(el.getDataSource())).toBe(rows);
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(1);

        // 调用方原始数组：无响应式通知，需要显式 refresh
        rows.push({ name: 'Dave', age: 41 });
        await tick();
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(1);
        el.refresh();
        await tick();
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(2);

        // 组件返回的代理数组：push 会自动触发刷新
        el.getDataSource().push({ name: 'Eve', age: 50 });
        await tick();
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(3);

        // 整体替换同样生效
        const next = [{ name: 'Frank', age: 60 }];
        el.setDataSource(next);
        await tick();
        expect(toRaw(el.getDataSource())).toBe(next);
        expect(el.shadowRoot.querySelectorAll('tr[part="row"]').length).toBe(1);
    });

    it('should map size prop to table class (small/large/default-md)', async () => {
        const small = createTable({ size: 'small' });
        await tick();
        expect(small.shadowRoot.querySelector('.table').classList.contains('table--sm')).toBe(true);

        const large = createTable({ size: 'large' });
        await tick();
        expect(large.shadowRoot.querySelector('.table').classList.contains('table--lg')).toBe(true);

        const def = createTable();
        await tick();
        expect(def.shadowRoot.querySelector('.table').classList.contains('table--md')).toBe(true);
    });

    it('should apply bordered and striped props to table class', async () => {
        const el = createTable({ bordered: '', striped: '' });
        await tick();
        const cls = el.shadowRoot.querySelector('.table').classList;
        expect(cls.contains('table--bordered')).toBe(true);
        expect(cls.contains('table--striped')).toBe(true);
    });

    it('should emit row-click event with row and index when rowClickable', async () => {
        const el = createTable({ 'row-clickable': '' });
        await tick();

        const onRowClick = vi.fn();
        el.addEventListener('row-click', onRowClick);

        const rows = el.shadowRoot.querySelectorAll('tr[part="row"]');
        rows[1].click();
        await tick();

        expect(onRowClick).toHaveBeenCalledTimes(1);
        const detail = onRowClick.mock.calls[0][0].detail;
        expect(detail.index).toBe(1);
        expect(detail.row.name).toBe('Bob');
    });

    it('should NOT emit row-click when rowClickable is false', async () => {
        const el = createTable();
        await tick();
        const onRowClick = vi.fn();
        el.addEventListener('row-click', onRowClick);
        el.shadowRoot.querySelector('tr[part="row"]').click();
        await tick();
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('should show loading indicator and suppress empty when loading', async () => {
        const el = createTable({ loading: '' }, COLUMNS, []);
        await tick();
        expect(el.shadowRoot.querySelector('.table__loading')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.table__empty')).toBeNull();
    });

    it('should expose aria-busy while loading and aria-selected on selectable rows', async () => {
        const el = createTable(
            { loading: '', selectable: '', 'row-key': 'id' },
            COLUMNS,
            DATA.map((row, index) => ({ ...row, id: index + 1 })),
        );
        await tick();

        expect(el.shadowRoot.querySelector('.table').getAttribute('aria-busy')).toBe('true');

        const rows = el.shadowRoot.querySelectorAll('tr[part="row"]') as NodeListOf<HTMLElement>;
        expect(rows[0].getAttribute('aria-selected')).toBe('false');

        const checkbox = rows[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
        checkbox.click();
        await tick();
        expect(rows[0].getAttribute('aria-selected')).toBe('true');
        expect(rows[0].classList.contains('table__row--selected')).toBe(true);
        expect(rows[1].getAttribute('aria-selected')).toBe('false');

        el.loading = false;
        await tick();
        expect(el.shadowRoot.querySelector('.table').hasAttribute('aria-busy')).toBe(false);
    });

    it('should show empty state when there is no data', async () => {
        const el = createTable({}, COLUMNS, []);
        await tick();
        const empty = el.shadowRoot.querySelector('.table__empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toContain('暂无数据');
    });

    it('should support setColumns / setDataSource / getDataSource methods', async () => {
        const el = createTable();
        await tick();
        expect(el.getDataSource().length).toBe(2);

        el.setDataSource([{ name: 'Carol', age: 40 }]);
        await tick();
        const rows = el.shadowRoot.querySelectorAll('tr[part="row"]');
        expect(rows.length).toBe(1);
        expect(el.getDataSource()[0].name).toBe('Carol');

        el.setColumns([{ title: 'Name', dataIndex: 'name', key: 'name' }]);
        await tick();
        expect(el.shadowRoot.querySelectorAll('th').length).toBe(1);
    });
});

describe('solely-table - 排序', () => {
    const SORT_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age', sortable: true },
    ];
    const SORT_DATA = [
        { id: '1', name: 'Alice', age: 20, status: 'active' },
        { id: '2', name: 'Bob', age: 30, status: 'active' },
        { id: '3', name: 'Carol', age: 10, status: 'inactive' },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const header = (el: any, index: number) =>
        el.shadowRoot.querySelectorAll('thead th[part="head-cell"]')[index] as HTMLElement;
    const rowNames = (el: any) =>
        [...el.shadowRoot.querySelectorAll('tr[part="row"]')].map((row: any) =>
            row.querySelector('td').textContent.trim(),
        );

    it('should toggle asc -> desc -> none and emit sort-change (非受控)', async () => {
        const el = createTable({ 'local-sort': '' }, SORT_COLUMNS, SORT_DATA);
        await tick();

        const onSort = vi.fn();
        el.addEventListener('sort-change', onSort);

        const ageTh = header(el, 1);
        expect(ageTh.getAttribute('aria-sort')).toBe('none');

        ageTh.click();
        await tick();
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Carol', 'Alice', 'Bob']);
        expect(ageTh.getAttribute('aria-sort')).toBe('ascending');
        expect(onSort).toHaveBeenCalledTimes(1);
        expect(onSort.mock.calls[0][0].detail.column).toBe('age');
        expect(onSort.mock.calls[0][0].detail.order).toBe('asc');

        ageTh.click();
        await tick();
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Bob', 'Alice', 'Carol']);
        expect(ageTh.getAttribute('aria-sort')).toBe('descending');
        expect(onSort.mock.calls[1][0].detail.order).toBe('desc');

        ageTh.click();
        await tick();
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Alice', 'Bob', 'Carol']);
        expect(ageTh.getAttribute('aria-sort')).toBe('none');
        expect(onSort.mock.calls[2][0].detail.order).toBe('');
    });

    it('should be keyboard operable on sortable header', async () => {
        const el = createTable({ 'local-sort': '' }, SORT_COLUMNS, SORT_DATA);
        await tick();

        const onSort = vi.fn();
        el.addEventListener('sort-change', onSort);

        const ageTh = header(el, 1);
        expect(ageTh.getAttribute('tabindex')).toBe('0');
        ageTh.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await tick();
        expect(onSort).toHaveBeenCalledTimes(1);
        expect(onSort.mock.calls[0][0].detail.order).toBe('asc');

        ageTh.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        await tick();
        expect(onSort).toHaveBeenCalledTimes(2);
        expect(onSort.mock.calls[1][0].detail.order).toBe('desc');
    });

    it('should not sort or emit when column is not sortable', async () => {
        const el = createTable({ 'local-sort': '' }, SORT_COLUMNS, SORT_DATA);
        await tick();
        const onSort = vi.fn();
        el.addEventListener('sort-change', onSort);

        const nameTh = header(el, 0);
        expect(nameTh.getAttribute('tabindex')).toBeNull();
        expect(nameTh.getAttribute('aria-sort')).toBeNull();
        nameTh.click();
        await tick();
        expect(onSort).not.toHaveBeenCalled();
    });

    it('should support controlled sort state (受控：点击只派发不改变内部展示)', async () => {
        const el = createTable(
            { 'local-sort': '', sort: JSON.stringify({ column: 'age', order: 'asc' }) },
            SORT_COLUMNS,
            SORT_DATA,
        );
        await tick();

        const ageTh = header(el, 1);
        expect(ageTh.getAttribute('aria-sort')).toBe('ascending');
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Carol', 'Alice', 'Bob']);

        const onSort = vi.fn();
        el.addEventListener('sort-change', onSort);
        ageTh.click();
        await tick();

        expect(onSort).toHaveBeenCalledTimes(1);
        expect(onSort.mock.calls[0][0].detail.order).toBe('desc');
        // 受控模式下外部未回写，展示与 aria 不变
        expect(ageTh.getAttribute('aria-sort')).toBe('ascending');
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Carol', 'Alice', 'Bob']);

        // 外部回写后生效
        el.setAttribute('sort', JSON.stringify({ column: 'age', order: 'desc' }));
        await tick();
        expect(ageTh.getAttribute('aria-sort')).toBe('descending');
        expect(rowNames(el).map((name: string) => name.split(/\s+/)[0])).toEqual(['Bob', 'Alice', 'Carol']);
        expect(el.getSortState()).toEqual({ column: 'age', order: 'desc' });
    });

    it('should fall back to uncontrolled after controlled sort property is cleared', async () => {
        const el = createTable(
            { 'local-sort': '', sort: JSON.stringify({ column: 'age', order: 'desc' }) },
            SORT_COLUMNS,
            SORT_DATA,
        );
        await tick();
        expect(el.getSortState()).toEqual({ column: 'age', order: 'desc' });

        // 框架会把「移除 attribute」回落为旧值，因此受控切换回非受控需通过 property 置空
        el.sort = undefined;
        await tick();
        expect(el.getSortState()).toBeNull();
    });
});

describe('solely-table - 筛选', () => {
    const FILTER_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age', sortable: true },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: [
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
            ],
        },
    ];
    const FILTER_DATA = [
        { id: '1', name: 'Alice', age: 30, status: 'active' },
        { id: '2', name: 'Bob', age: 10, status: 'active' },
        { id: '3', name: 'Carol', age: 20, status: 'inactive' },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const names = (el: any) =>
        [...el.shadowRoot.querySelectorAll('tr[part="row"]')].map((row: any) =>
            row.querySelector('td').textContent.trim(),
        );

    it('should apply local filtering by default and emit filter-change', async () => {
        const el = createTable({}, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        const onFilter = vi.fn();
        el.addEventListener('filter-change', onFilter);

        el.setFilter('status', 'active');
        await tick();

        expect(onFilter).toHaveBeenCalledTimes(1);
        expect(onFilter.mock.calls[0][0].detail.column).toBe('status');
        expect(onFilter.mock.calls[0][0].detail.values).toEqual(['active']);
        expect(el.getFilterValues()).toEqual({ status: ['active'] });
        // localFilter 默认开启，传了 filters 即生效
        expect(names(el)).toEqual(['Alice', 'Bob']);
    });

    it('should only manage filter state when remote is enabled', async () => {
        const el = createTable({ remote: '' }, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        const onFilter = vi.fn();
        el.addEventListener('filter-change', onFilter);

        el.setFilter('status', 'active');
        await tick();

        expect(onFilter).toHaveBeenCalledTimes(1);
        expect(el.getFilterValues()).toEqual({ status: ['active'] });
        // remote 模式由使用方做远端筛选，组件内数据不变
        expect(names(el).length).toBe(3);
    });

    it('should render built-in filter row and filter rows via checkbox', async () => {
        const el = createTable({}, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        const filterRow = el.shadowRoot.querySelector('tr[part="filter-row"]');
        expect(filterRow).not.toBeNull();

        const checkboxes = [...filterRow!.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
        expect(checkboxes.length).toBe(2);

        const onFilter = vi.fn();
        el.addEventListener('filter-change', onFilter);

        checkboxes[0].checked = true;
        checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(el.getFilterValues()).toEqual({ status: ['active'] });
        expect(names(el)).toEqual(['Alice', 'Bob']);
        expect(checkboxes[1].checked).toBe(false);
        expect(onFilter).toHaveBeenCalledTimes(1);

        const clearButton = filterRow!.querySelector('button[part="filter-clear"]') as HTMLButtonElement;
        expect(clearButton).not.toBeNull();
        clearButton.click();
        await tick();

        expect(el.getFilterValues()).toEqual({});
        expect(names(el)).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('should filter rows when localFilter is enabled and clear via API', async () => {
        const el = createTable({ 'local-filter': '' }, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        el.setFilter('status', ['active']);
        await tick();
        expect(names(el)).toEqual(['Alice', 'Bob']);
        expect(el.getDisplayedDataSource().length).toBe(2);
        // 数据源本身不变
        expect(el.getDataSource().length).toBe(3);

        el.clearFilters('status');
        await tick();
        expect(names(el)).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('should apply filter and sort together', async () => {
        const el = createTable({ 'local-filter': '', 'local-sort': '' }, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        el.setFilter('status', 'active');
        el.setSort('age', 'asc');
        await tick();

        expect(names(el)).toEqual(['Bob', 'Alice']);

        el.setSort('age', 'desc');
        await tick();
        expect(names(el)).toEqual(['Alice', 'Bob']);
    });

    it('should support controlled filter values', async () => {
        const el = createTable(
            { 'local-filter': '', 'filter-values': JSON.stringify({ status: ['active'] }) },
            FILTER_COLUMNS,
            FILTER_DATA,
        );
        await tick();
        expect(names(el)).toEqual(['Alice', 'Bob']);

        const onFilter = vi.fn();
        el.addEventListener('filter-change', onFilter);

        el.setFilter('status', 'inactive');
        await tick();
        expect(onFilter).toHaveBeenCalledTimes(1);
        expect(onFilter.mock.calls[0][0].detail.values).toEqual(['inactive']);
        // 受控模式未回写，展示不变
        expect(names(el)).toEqual(['Alice', 'Bob']);

        el.setAttribute('filter-values', JSON.stringify({ status: ['inactive'] }));
        await tick();
        expect(names(el)).toEqual(['Carol']);
    });

    it('should show empty state when local filtering removes all rows', async () => {
        const el = createTable({ 'local-filter': '' }, FILTER_COLUMNS, FILTER_DATA);
        await tick();

        el.setFilter('status', 'not-exist');
        await tick();
        expect(el.shadowRoot.querySelector('.table__empty')).not.toBeNull();
        expect(el.getDataSource().length).toBe(3);
    });
});

describe('solely-table - 行选择', () => {
    const SELECT_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age' },
    ];
    const SELECT_DATA = [
        { id: 1, name: 'Alice', age: 20 },
        { id: 2, name: 'Bob', age: 30 },
        { id: 3, name: 'Carol', age: 40 },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const rowCheckboxes = (el: any) =>
        [...el.shadowRoot.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];
    const selectAll = (el: any) => el.shadowRoot.querySelector('thead input[type="checkbox"]') as HTMLInputElement;

    /**
     * 模拟真实指针/键盘激活路径：派发可取消的 click（不用 element.click()）。
     *
     * jsdom 的边界：它不执行原生 checkbox 的 pre-click 翻转与 canceled activation 回滚，
     * 因此这里能覆盖「click 未被 preventDefault 取消」以及「渲染后 checked 属性同步」；
     * 真实浏览器中 preventDefault 的回滚发生在微任务检查点（组件 refresh）之后，
     * 该时序由 headless Chromium + CDP 真实鼠标/键盘事件验证（见 PR 说明）。
     */
    const pointerClick = (input: HTMLInputElement) => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        input.dispatchEvent(event);
        return event;
    };

    it('should render selection column and select rows by row-key', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id', 'row-clickable': '' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        expect(rowCheckboxes(el).length).toBe(3);
        const onSelection = vi.fn();
        const onRowClick = vi.fn();
        el.addEventListener('selection-change', onSelection);
        el.addEventListener('row-click', onRowClick);

        rowCheckboxes(el)[0].click();
        await tick();

        expect(onSelection).toHaveBeenCalledTimes(1);
        const detail = onSelection.mock.calls[0][0].detail;
        expect(detail.selectedKeys).toEqual(['1']);
        expect(detail.selectedRows.map((row: any) => row.name)).toEqual(['Alice']);
        expect(detail.selected).toBe(true);
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        // 点击选择框不应触发行点击
        expect(onRowClick).not.toHaveBeenCalled();

        // 行上带 data-row-key
        expect(el.shadowRoot.querySelector('tr[part="row"]').getAttribute('data-row-key')).toBe('1');
    });

    it('should support header select-all and indeterminate state', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const onSelection = vi.fn();
        el.addEventListener('selection-change', onSelection);

        rowCheckboxes(el)[0].click();
        await tick();
        expect(selectAll(el).indeterminate).toBe(true);
        expect(selectAll(el).checked).toBe(false);

        rowCheckboxes(el)[1].click();
        await tick();
        expect(selectAll(el).indeterminate).toBe(true);
        expect(selectAll(el).getAttribute('aria-checked')).toBe('mixed');

        selectAll(el).click();
        await tick();
        expect(el.getSelectedKeys()).toEqual(['1', '2', '3']);
        expect(selectAll(el).indeterminate).toBe(false);
        expect(selectAll(el).checked).toBe(true);
        expect(onSelection.mock.calls.at(-1)![0].detail.selected).toBe(true);

        selectAll(el).click();
        await tick();
        expect(el.getSelectedKeys()).toEqual([]);
        expect(selectAll(el).checked).toBe(false);
        expect(onSelection.mock.calls.at(-1)![0].detail.selected).toBe(false);
    });

    it('should support single selection mode', async () => {
        const el = createTable(
            { selectable: '', 'selection-mode': 'single', 'row-key': 'id' },
            SELECT_COLUMNS,
            SELECT_DATA,
        );
        await tick();

        // 单选模式不显示表头全选
        expect(el.shadowRoot.querySelector('thead input[type="checkbox"]')).toBeNull();

        rowCheckboxes(el)[0].click();
        await tick();
        expect(el.getSelectedKeys()).toEqual(['1']);

        rowCheckboxes(el)[1].click();
        await tick();
        expect(el.getSelectedKeys()).toEqual(['2']);

        rowCheckboxes(el)[1].click();
        await tick();
        expect(el.getSelectedKeys()).toEqual([]);
    });

    it('should preserve selection by key when data source is refreshed', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        rowCheckboxes(el)[0].click();
        rowCheckboxes(el)[1].click();
        await tick();
        expect(el.getSelectedKeys()).toEqual(['1', '2']);

        el.setDataSource([
            { id: 2, name: 'Bob', age: 30 },
            { id: 1, name: 'Alice', age: 20 },
            { id: 4, name: 'Dave', age: 50 },
        ]);
        await tick();

        expect(el.getSelectedKeys()).toEqual(['1', '2']);
        expect(el.getSelectedRows().map((row: any) => row.name)).toEqual(['Bob', 'Alice']);
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        expect(rowCheckboxes(el)[1].checked).toBe(true);
        expect(rowCheckboxes(el)[2].checked).toBe(false);
    });

    it('should support controlled selected keys', async () => {
        const el = createTable(
            { selectable: '', 'row-key': 'id', 'selected-keys': JSON.stringify(['2']) },
            SELECT_COLUMNS,
            SELECT_DATA,
        );
        await tick();
        expect(rowCheckboxes(el)[1].checked).toBe(true);

        const onSelection = vi.fn();
        el.addEventListener('selection-change', onSelection);
        rowCheckboxes(el)[0].click();
        await tick();

        expect(onSelection).toHaveBeenCalledTimes(1);
        expect(onSelection.mock.calls[0][0].detail.selectedKeys).toEqual(['2', '1']);
        // 受控模式未回写
        expect(rowCheckboxes(el)[0].checked).toBe(false);

        el.setAttribute('selected-keys', JSON.stringify(['2', '1']));
        await tick();
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        expect(el.getSelectedKeys()).toEqual(['2', '1']);
    });

    it('should sync input.checked after a pointer-like row checkbox activation', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const firstClick = pointerClick(rowCheckboxes(el)[0]);
        await tick();

        // 关键回归点：不能取消原生 click 的默认行为，否则真实浏览器会在微任务渲染后回滚 checked
        expect(firstClick.defaultPrevented).toBe(false);
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        expect(rowCheckboxes(el)[0].getAttribute('aria-checked')).toBe('true');
        expect(el.getSelectedKeys()).toEqual(['1']);

        // 再次激活应取消勾选
        pointerClick(rowCheckboxes(el)[0]);
        await tick();
        expect(rowCheckboxes(el)[0].checked).toBe(false);
        expect(el.getSelectedKeys()).toEqual([]);
    });

    it('should make row-clickable rows keyboard operable without touching checkbox state', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id', 'row-clickable': '' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const row = el.shadowRoot.querySelector('tbody tr[part="row"]') as HTMLElement;
        // 可选中的行由复选框承担 Tab 停点，行使用 -1 仍可被点击/focus() 聚焦
        expect(row.getAttribute('tabindex')).toBe('-1');
        expect(rowCheckboxes(el)[0].getAttribute('tabindex')).toBeNull();

        const onRowClick = vi.fn();
        el.addEventListener('row-click', onRowClick);

        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        row.dispatchEvent(event);
        await tick();

        expect(onRowClick).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
        // 行键盘激活不得改变复选框状态，也不得让表头出现错位的 indeterminate
        expect(rowCheckboxes(el)[0].checked).toBe(false);
        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(false);
    });

    it('should keep checkbox as the single Tab stop and not duplicate row activation', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id', 'row-clickable': '' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const checkbox = rowCheckboxes(el)[0];
        const onRowClick = vi.fn();
        el.addEventListener('row-click', onRowClick);

        // 模拟复选框上的 Space：keydown 冒泡到行，但不应被行当作激活
        checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        pointerClick(checkbox);
        await tick();

        expect(onRowClick).not.toHaveBeenCalled();
        expect(checkbox.checked).toBe(true);
        expect(selectAll(el).indeterminate).toBe(true);
        expect(selectAll(el).checked).toBe(false);
    });

    it('should toggle selection when a selectable-only row is activated by keyboard', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const getRow = () => el.shadowRoot.querySelector('tbody tr[part="row"]') as HTMLElement;
        expect(getRow().getAttribute('tabindex')).toBe('-1');

        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        getRow().dispatchEvent(event);
        await tick();

        expect(event.defaultPrevented).toBe(true);
        expect(el.getSelectedKeys()).toEqual(['1']);
        // 键盘路径直接调用 toggleRowSelection，不产生原生 click，复选框与表头需同步
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(true);

        getRow().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        await tick();
        expect(el.getSelectedKeys()).toEqual([]);
        expect(rowCheckboxes(el)[0].checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(false);
    });

    it('should expose tabindex=0 for row-click rows without a selection checkbox', async () => {
        const el = createTable({ 'row-key': 'id', 'row-clickable': '' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const row = el.shadowRoot.querySelector('tbody tr[part="row"]') as HTMLElement;
        expect(row.getAttribute('tabindex')).toBe('0');

        const onRowClick = vi.fn();
        el.addEventListener('row-click', onRowClick);

        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        row.dispatchEvent(event);
        await tick();

        expect(onRowClick).toHaveBeenCalledTimes(1);
    });

    it('should sync header checkbox and indeterminate after pointer-like select-all activation', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, SELECT_DATA);
        await tick();

        const head = selectAll(el);
        expect(head.checked).toBe(false);
        expect(head.indeterminate).toBe(false);

        // 部分选中：表头显示半选
        pointerClick(rowCheckboxes(el)[0]);
        await tick();
        expect(selectAll(el).indeterminate).toBe(true);
        expect(selectAll(el).getAttribute('aria-checked')).toBe('mixed');

        // 全选
        const selectAllClick = pointerClick(selectAll(el));
        await tick();
        expect(selectAllClick.defaultPrevented).toBe(false);
        expect(selectAll(el).checked).toBe(true);
        expect(selectAll(el).indeterminate).toBe(false);
        expect(rowCheckboxes(el).map(input => input.checked)).toEqual([true, true, true]);
        expect(el.getSelectedKeys()).toEqual(['1', '2', '3']);

        // 全选后再次点击取消
        pointerClick(selectAll(el));
        await tick();
        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(false);
        expect(rowCheckboxes(el).map(input => input.checked)).toEqual([false, false, false]);
        expect(el.getSelectedKeys()).toEqual([]);
    });

    it('should keep input.checked aligned with controlled selectedKeys (pointer-like click + external update)', async () => {
        const el = createTable(
            { selectable: '', 'row-key': 'id', 'selected-keys': JSON.stringify(['2']) },
            SELECT_COLUMNS,
            SELECT_DATA,
        );
        await tick();
        expect(rowCheckboxes(el)[1].checked).toBe(true);

        // 受控模式下外部未回写：原生翻转必须被纠正回受控值
        const rejectedClick = pointerClick(rowCheckboxes(el)[0]);
        await tick();
        expect(rejectedClick.defaultPrevented).toBe(false);
        expect(rowCheckboxes(el)[0].checked).toBe(false);
        expect(el.getSelectedKeys()).toEqual(['2']);

        // 外部回写后，input.checked 跟随 selectedKeys
        el.setAttribute('selected-keys', JSON.stringify(['2', '1']));
        await tick();
        expect(rowCheckboxes(el)[0].checked).toBe(true);
        expect(rowCheckboxes(el)[1].checked).toBe(true);
        // 仅选中 3 行中的 2 行，表头应为半选
        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(true);

        el.setAttribute('selected-keys', '[]');
        await tick();
        expect(rowCheckboxes(el).map(input => input.checked)).toEqual([false, false, false]);
        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(false);
    });

    it('should correct the native flip when select-all is activated with empty data', async () => {
        const el = createTable({ selectable: '', 'row-key': 'id' }, SELECT_COLUMNS, []);
        await tick();
        expect(el.getSelectedKeys()).toEqual([]);

        const head = selectAll(el);
        // jsdom 不执行原生激活，这里手动模拟浏览器 pre-click 翻转，验证渲染会把它纠正回来
        head.checked = true;
        pointerClick(head);
        await tick();

        expect(selectAll(el).checked).toBe(false);
        expect(selectAll(el).indeterminate).toBe(false);
        expect(el.getSelectedKeys()).toEqual([]);
    });
});

describe('solely-table - 展开行', () => {
    const EXPAND_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age' },
    ];
    const EXPAND_DATA = [
        { id: 1, name: 'Alice', age: 20 },
        { id: 2, name: 'Bob', age: 30 },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const expandButtons = (el: any) =>
        [...el.shadowRoot.querySelectorAll('button[part="expand-trigger"]')] as HTMLButtonElement[];

    it('should expand/collapse row and emit expand-change with colspan', async () => {
        const el = createTable({ expandable: '', 'row-key': 'id', 'row-clickable': '' }, EXPAND_COLUMNS, EXPAND_DATA);
        await tick();

        expect(expandButtons(el).length).toBe(2);
        const onExpand = vi.fn();
        const onRowClick = vi.fn();
        el.addEventListener('expand-change', onExpand);
        el.addEventListener('row-click', onRowClick);

        expandButtons(el)[0].click();
        await tick();

        expect(onExpand).toHaveBeenCalledTimes(1);
        const detail = onExpand.mock.calls[0][0].detail;
        expect(detail.expanded).toBe(true);
        expect(detail.expandedKeys).toEqual(['1']);
        expect(detail.row.name).toBe('Alice');
        expect(detail.index).toBe(0);
        expect(onRowClick).not.toHaveBeenCalled();

        const expandRow = el.shadowRoot.querySelector('tr[part="expand-row"]');
        expect(expandRow).not.toBeNull();
        expect(expandRow.querySelector('td').getAttribute('colspan')).toBe('3');
        expect(expandButtons(el)[0].getAttribute('aria-expanded')).toBe('true');

        expandButtons(el)[0].click();
        await tick();
        expect(el.getExpandedKeys()).toEqual([]);
        expect(el.shadowRoot.querySelector('tr[part="expand-row"]')).toBeNull();
    });

    it('should render expand content from slot', async () => {
        const el = document.createElement('solely-table') as any;
        el.setAttribute('expandable', '');
        el.setAttribute('row-key', 'id');
        el.setAttribute('columns', JSON.stringify(EXPAND_COLUMNS));
        el.setAttribute('data-source', JSON.stringify(EXPAND_DATA));

        const slotContent = document.createElement('div');
        slotContent.setAttribute('slot', 'expand-1');
        slotContent.textContent = 'Alice 的详情';
        el.appendChild(slotContent);
        document.body.appendChild(el);

        await tick();
        expandButtons(el)[0].click();
        await tick();

        const slot = el.shadowRoot.querySelector('slot[name="expand-1"]');
        expect(slot).not.toBeNull();
        // slot 被分配到轻量 DOM 内容（jsdom 支持 assignedNodes）
        expect(slot.assignedNodes().length).toBe(1);
        expect(typeof slotContent.assignedSlot === 'object' || slotContent.assignedSlot === slot).toBe(true);
    });

    it('should render expand content from expandRender function', async () => {
        const el = createTable({ expandable: '', 'row-key': 'id' }, EXPAND_COLUMNS, EXPAND_DATA);
        await tick();

        el.expandRender = (row: Record<string, unknown>) => `详情：${row.name}`;
        await tick();

        expandButtons(el).at(0)!.click();
        await tick();

        const render = el.shadowRoot.querySelector('.table__expand-render');
        expect(render).not.toBeNull();
        expect(render.textContent).toBe('详情：Alice');
    });

    it('should support controlled expanded keys', async () => {
        const el = createTable(
            { expandable: '', 'row-key': 'id', 'expanded-keys': JSON.stringify(['2']) },
            EXPAND_COLUMNS,
            EXPAND_DATA,
        );
        await tick();
        expect(el.shadowRoot.querySelector('tr[part="expand-row"]')).not.toBeNull();
        expect(expandButtons(el)[1].getAttribute('aria-expanded')).toBe('true');

        const onExpand = vi.fn();
        el.addEventListener('expand-change', onExpand);
        expandButtons(el)[0].click();
        await tick();

        expect(onExpand).toHaveBeenCalledTimes(1);
        expect(onExpand.mock.calls[0][0].detail.expandedKeys).toEqual(['2', '1']);
        // 受控模式未回写：仍然只有第二行展开
        expect(el.shadowRoot.querySelectorAll('tr[part="expand-row"]').length).toBe(1);
        expect(expandButtons(el)[0].getAttribute('aria-expanded')).toBe('false');

        el.setAttribute('expanded-keys', JSON.stringify(['1']));
        await tick();
        expect(expandButtons(el)[0].getAttribute('aria-expanded')).toBe('true');
        expect(expandButtons(el)[1].getAttribute('aria-expanded')).toBe('false');
    });
});

describe('solely-table - 空态与分页联动', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should allow customizing empty state via slot', async () => {
        const el = document.createElement('solely-table') as any;
        el.setAttribute('columns', JSON.stringify(COLUMNS));
        el.setAttribute('data-source', JSON.stringify([]));

        const custom = document.createElement('div');
        custom.setAttribute('slot', 'empty');
        custom.textContent = '自定义空态';
        el.appendChild(custom);
        document.body.appendChild(el);

        await tick();
        const empty = el.shadowRoot.querySelector('.table__empty');
        expect(empty).not.toBeNull();

        const slot = el.shadowRoot.querySelector('slot[name="empty"]');
        expect(slot).not.toBeNull();
        expect(slot.assignedNodes().length).toBe(1);
        expect(slot.assignedNodes()[0].textContent).toBe('自定义空态');
    });

    it('should reuse solely-empty when no custom slot is provided', async () => {
        const el = createTable({}, COLUMNS, []);
        await tick();
        const empty = el.shadowRoot.querySelector('.table__empty');
        expect(empty!.querySelector('solely-empty')).not.toBeNull();
        expect(empty!.textContent).toContain('暂无数据');
    });

    it('should forward pagination change to page-change', async () => {
        const el = createTable();
        await tick();

        const onPage = vi.fn();
        el.addEventListener('page-change', onPage);

        el.handlePaginationChange({ current: 2, pageSize: 10 });
        expect(onPage).toHaveBeenCalledTimes(1);
        expect(onPage.mock.calls[0][0].detail).toEqual({ current: 2, pageSize: 10 });

        // 支持直接传入 pagination 的 CustomEvent
        const changeEvent = new CustomEvent('change', {
            detail: { current: 3, pageSize: 20 },
        });
        el.handlePaginationChange(changeEvent);
        expect(onPage).toHaveBeenCalledTimes(2);
        expect(onPage.mock.calls[1][0].detail).toEqual({ current: 3, pageSize: 20 });
    });

    it('should emit data-change when data source changes so pagination can follow', async () => {
        const el = createTable();
        await tick();

        const onData = vi.fn();
        el.addEventListener('data-change', onData);

        el.setDataSource([{ name: 'Carol', age: 40 }]);
        expect(onData).toHaveBeenCalledTimes(1);
        expect(onData.mock.calls[0][0].detail.total).toBe(1);

        el.setAttribute(
            'data-source',
            JSON.stringify([
                { name: 'A', age: 1 },
                { name: 'B', age: 2 },
                { name: 'C', age: 3 },
            ]),
        );
        expect(onData).toHaveBeenCalledTimes(2);
        expect(onData.mock.calls[1][0].detail.total).toBe(3);
    });
});

describe('solely-table - 列级自定义渲染（U-01）', () => {
    const RENDER_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age' },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render Node returned by column render', async () => {
        const el = createTable({}, RENDER_COLUMNS, DATA);
        await tick();

        el.setColumns([
            { title: 'Name', dataIndex: 'name', key: 'name', render: (row: any) => `#${row.name}` },
            {
                title: 'Age',
                dataIndex: 'age',
                key: 'age',
                render: (row: any) => {
                    const strong = document.createElement('strong');
                    strong.textContent = `年龄 ${row.age}`;
                    return strong;
                },
            },
        ]);
        await tick();

        const cells = [...el.shadowRoot.querySelectorAll('tr[part="row"]')][0].querySelectorAll('td');
        expect(cells[0].querySelector('.table__cell-render').textContent).toBe('#Alice');
        expect(cells[1].querySelector('.table__cell-render strong').textContent).toBe('年龄 20');
    });

    it('should insert string returned by render as plain text (no XSS)', async () => {
        const el = createTable({}, RENDER_COLUMNS, DATA);
        await tick();

        el.setColumns([
            {
                title: 'Name',
                dataIndex: 'name',
                key: 'name',
                render: () => '<img src=x onerror="window.__xss=1">',
            },
            { title: 'Age', dataIndex: 'age', key: 'age' },
        ]);
        await tick();

        const cell = el.shadowRoot.querySelector('tr[part="row"] .table__cell-render') as HTMLElement;
        expect(cell.textContent).toBe('<img src=x onerror="window.__xss=1">');
        expect(cell.querySelector('img')).toBeNull();
    });

    it('should support column-level named slot', async () => {
        const el = createTable({}, [{ title: 'Name', dataIndex: 'name', key: 'name', slot: 'name-cell' }], DATA);
        await tick();

        const slotContent = document.createElement('span');
        slotContent.setAttribute('slot', 'name-cell');
        slotContent.textContent = '自定义列内容';
        el.appendChild(slotContent);
        await tick();

        const slot = el.shadowRoot.querySelector('slot[name="name-cell"]') as HTMLSlotElement;
        expect(slot).not.toBeNull();
        expect(slot.assignedNodes().length).toBe(1);
        expect(slot.assignedNodes()[0].textContent).toBe('自定义列内容');
    });
});

describe('solely-table 默认值', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const createBareTable = () => {
        const el = document.createElement('solely-table') as any;
        document.body.appendChild(el);
        return el;
    };

    it('未设置时 property 读回 []，且引用稳定', async () => {
        const el = createBareTable();
        await tick();

        expect(el.columns).toEqual([]);
        expect(el.dataSource).toEqual([]);
        expect(el.hasAttribute('columns')).toBe(false);
        expect(el.hasAttribute('data-source')).toBe(false);

        const columnsRef = el.columns;
        expect(el.columns).toBe(columnsRef);
    });

    it('显式设置后 property 读回设置值', async () => {
        const el = createBareTable();
        await tick();

        el.columns = COLUMNS;
        el.dataSource = DATA;

        expect(el.columns).toEqual(COLUMNS);
        expect(el.dataSource).toEqual(DATA);
    });

    it('removeAttribute 后回退到 []', async () => {
        const el = createBareTable();
        el.setAttribute('columns', JSON.stringify(COLUMNS));
        el.setAttribute('data-source', JSON.stringify(DATA));
        await tick();

        el.removeAttribute('columns');
        el.removeAttribute('data-source');
        await tick();

        expect(el.columns).toEqual([]);
        expect(el.dataSource).toEqual([]);
    });
});

describe('solely-table - 行身份（U-02）', () => {
    const IDENTITY_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age', sortable: true },
    ];
    const IDENTITY_DATA = [
        { name: 'Alice', age: 20 },
        { name: 'Bob', age: 30 },
        { name: 'Carol', age: 10 },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should keep selection stable across local sort without row-key', async () => {
        const el = createTable({ selectable: '' }, IDENTITY_COLUMNS, IDENTITY_DATA);
        await tick();

        const rows = () => [...el.shadowRoot.querySelectorAll('tr[part="row"]')] as HTMLElement[];
        const checkboxes = () =>
            [...el.shadowRoot.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];

        checkboxes()[0].click();
        await tick();
        expect(el.getSelectedRows().map((row: any) => row.name)).toEqual(['Alice']);
        expect(el.getSelectedKeys()).toEqual(['#row-1']);

        // 本地排序后 Alice 换到第 2 行，但行的稳定身份不变
        el.setSort('age', 'asc');
        await tick();
        expect(rows()[1].querySelectorAll('td')[1].textContent.trim()).toBe('Alice');
        expect(checkboxes()[1].checked).toBe(true);
        expect(checkboxes()[0].checked).toBe(false);
        expect(el.getSelectedRows().map((row: any) => row.name)).toEqual(['Alice']);
    });

    it('should warn once when row identity is needed but row-key is missing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = createTable({ selectable: '', 'local-sort': '' }, IDENTITY_COLUMNS, IDENTITY_DATA);
        await tick();
        await tick();

        const messages = warn.mock.calls.map(call => String(call[0]));
        expect(messages.filter(message => message.includes('row-key')).length).toBe(1);
        warn.mockRestore();
        el.remove();
    });
});

describe('solely-table - 默认本地排序（U-03）', () => {
    const SORT_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Age', dataIndex: 'age', key: 'age', sortable: true },
    ];
    const SORT_DATA = [
        { name: 'Alice', age: 20 },
        { name: 'Bob', age: 30 },
        { name: 'Carol', age: 10 },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const names = (el: any) =>
        [...el.shadowRoot.querySelectorAll('tr[part="row"]')].map((row: any) =>
            row.querySelector('td').textContent.trim(),
        );

    it('should sort locally by default when column is sortable', async () => {
        const el = createTable({}, SORT_COLUMNS, SORT_DATA);
        await tick();

        const ageTh = el.shadowRoot.querySelectorAll('thead th[part="head-cell"]')[1] as HTMLElement;
        ageTh.click();
        await tick();

        expect(names(el)).toEqual(['Carol', 'Alice', 'Bob']);
    });

    it('should only emit sort-change when remote is enabled', async () => {
        const el = createTable({ remote: '' }, SORT_COLUMNS, SORT_DATA);
        await tick();

        const onSort = vi.fn();
        el.addEventListener('sort-change', onSort);

        const ageTh = el.shadowRoot.querySelectorAll('thead th[part="head-cell"]')[1] as HTMLElement;
        ageTh.click();
        await tick();

        expect(onSort).toHaveBeenCalledTimes(1);
        expect(names(el)).toEqual(['Alice', 'Bob', 'Carol']);
    });
});

describe('solely-table - 嵌套 dataIndex（U-17）', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should resolve dot paths and array indexes', async () => {
        const columns: TableColumn[] = [
            { title: 'User', dataIndex: 'user.name', key: 'user' },
            { title: 'First', dataIndex: 'items[0].label', key: 'first' },
            { title: 'Second', dataIndex: 'items.1.label', key: 'second' },
        ];
        const data = [
            { user: { name: 'Alice' }, items: [{ label: 'A' }, { label: 'B' }] },
            { user: { name: 'Bob' }, items: [{ label: 'C' }, { label: 'D' }] },
        ];
        const el = createTable({}, columns, data);
        await tick();

        const firstRow = [...el.shadowRoot.querySelectorAll('tr[part="row"]')][0];
        expect([...firstRow.querySelectorAll('td')].map((td: any) => td.textContent)).toEqual(['Alice', 'A', 'B']);
    });

    it('should prefer a literal field name containing dots when present', async () => {
        const columns: TableColumn[] = [{ title: 'User', dataIndex: 'user.name', key: 'user' }];
        const el = createTable({}, columns, [{ 'user.name': 'Flat Alice' }]);
        await tick();

        const row = el.shadowRoot.querySelector('tr[part="row"]') as HTMLElement;
        expect(row.querySelector('td')!.textContent).toBe('Flat Alice');
    });
});

describe('solely-table - 固定列偏移（U-18）', () => {
    const FIXED_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name', width: 80, fixed: 'left' },
        { title: 'Age', dataIndex: 'age', key: 'age', width: 90, fixed: 'left' },
        { title: 'City', dataIndex: 'city', key: 'city', width: 100, fixed: 'right' },
        { title: 'Zip', dataIndex: 'zip', key: 'zip', width: 120, fixed: 'right' },
    ];
    const FIXED_DATA = [{ id: 1, name: 'Alice', age: 20, city: 'Shanghai', zip: '200000' }];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should accumulate offsets for multiple fixed columns and include selection/expand columns', async () => {
        const el = createTable({ selectable: '', expandable: '', 'row-key': 'id' }, FIXED_COLUMNS, FIXED_DATA);
        await tick();

        const headCells = [...el.shadowRoot.querySelectorAll('thead tr[part="head-row"] > th')] as HTMLElement[];
        const selection = headCells[0];
        const name = headCells[1];
        const age = headCells[2];
        const city = headCells[3];
        const zip = headCells[4];
        const expand = headCells[5];

        expect(selection.classList.contains('fixed-left')).toBe(true);
        expect(expand.classList.contains('fixed-right')).toBe(true);

        expect(selection.style.left).toBe('0px');
        expect(name.style.left).toBe('48px');
        expect(age.style.left).toBe('128px');

        expect(expand.style.right).toBe('0px');
        expect(zip.style.right).toBe('44px');
        expect(city.style.right).toBe('164px');

        // 表体单元格共享同一套偏移
        const bodyRow = el.shadowRoot.querySelector('tr[part="row"]') as HTMLElement;
        const bodyName = bodyRow.querySelector('td[data-col-key="name"]') as HTMLElement;
        const bodyZip = bodyRow.querySelector('td[data-col-key="zip"]') as HTMLElement;
        expect(bodyName.style.left).toBe('48px');
        expect(bodyZip.style.right).toBe('44px');
    });
});

describe('solely-table - 行级单元格插槽稳定定位（R-06）', () => {
    const SLOT_COLUMNS: TableColumn[] = [
        { title: 'Name', dataIndex: 'name', key: 'name', sortable: true },
        { title: 'Status', dataIndex: 'status', key: 'status' },
    ];
    const SLOT_DATA = [
        { id: 1, name: 'Alice', status: 'active' },
        { id: 2, name: 'Bob', status: 'inactive' },
        { id: 3, name: 'Carol', status: 'active' },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const addSlot = (el: HTMLElement, name: string, text: string) => {
        const span = document.createElement('span');
        span.setAttribute('slot', name);
        span.textContent = text;
        el.appendChild(span);
        return span;
    };

    const slotText = (row: HTMLElement, name: string) => {
        const slot = row.querySelector(`slot[name="${name}"]`) as HTMLSlotElement | null;
        return slot
            ? slot
                  .assignedNodes()
                  .map(node => node.textContent)
                  .join('')
            : null;
    };

    it('should keep row-level slot content attached to the row after sorting', async () => {
        const el = createTable({ 'row-key': 'id' }, SLOT_COLUMNS, SLOT_DATA);
        addSlot(el, 'col-status-1', 'Alice 的状态');
        addSlot(el, 'col-status-2', 'Bob 的状态');
        addSlot(el, 'col-status-3', 'Carol 的状态');
        await tick();

        const findRow = (key: string) => el.shadowRoot.querySelector(`tr[data-row-key="${key}"]`) as HTMLElement;

        expect(slotText(findRow('1'), 'col-status-1')).toBe('Alice 的状态');

        // 稳定插槽按 row-key 定位，排序改变顺序后仍跟随原数据行
        el.setSort('name', 'desc');
        await tick();

        expect(slotText(findRow('1'), 'col-status-1')).toBe('Alice 的状态');
        expect(slotText(findRow('3'), 'col-status-3')).toBe('Carol 的状态');
        expect(slotText(findRow('2'), 'col-status-2')).toBe('Bob 的状态');
    });

    it('should fall back to legacy col-{key}-{rowIndex} slot name', async () => {
        const el = createTable({ 'row-key': 'id' }, SLOT_COLUMNS, SLOT_DATA);
        addSlot(el, 'col-status-0', '旧版第一行内容');
        await tick();

        const firstRow = el.shadowRoot.querySelector('tr[part="row"]') as HTMLElement;
        expect(slotText(firstRow, 'col-status-0')).toBe('旧版第一行内容');
    });

    it('should prefer stable slot over legacy slot when both exist', async () => {
        const el = createTable({ 'row-key': 'id' }, SLOT_COLUMNS, SLOT_DATA);
        const legacy = addSlot(el, 'col-status-0', '旧版内容');
        addSlot(el, 'col-status-1', '稳定内容');
        await tick();

        const firstRow = el.shadowRoot.querySelector('tr[data-row-key="1"]') as HTMLElement;
        expect(slotText(firstRow, 'col-status-1')).toBe('稳定内容');
        // 稳定插槽优先时，旧版插槽不参与该单元格渲染
        expect(legacy.assignedSlot).toBeNull();
    });
});

describe('solely-table - 固定列中的行级插槽按钮', () => {
    const OP_COLUMNS: TableColumn[] = [
        { title: '姓名', dataIndex: 'name', key: 'name', width: 120, fixed: 'left' },
        { title: '邮箱', dataIndex: 'mail', key: 'mail', width: 220 },
        { title: '操作', dataIndex: 'op', key: 'op', width: 120, fixed: 'right' },
    ];
    const OP_DATA = [
        { id: 1, name: '张三', mail: 'zhang@example.com' },
        { id: 2, name: '李四', mail: 'li@example.com' },
    ];

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('右固定列用稳定插槽渲染真正的按钮，而不是把字段值当纯文本', async () => {
        const el = createTable({ 'row-key': 'id' }, OP_COLUMNS, OP_DATA);
        for (const id of [1, 2]) {
            const button = document.createElement('solely-button');
            button.setAttribute('slot', `col-op-${id}`);
            button.setAttribute('type', 'primary');
            button.setAttribute('size', 'small');
            button.textContent = '编辑';
            el.appendChild(button);
        }
        await tick();

        for (const id of [1, 2]) {
            const slot = el.shadowRoot.querySelector(`slot[name="col-op-${id}"]`) as HTMLSlotElement | null;
            expect(slot).not.toBeNull();
            expect((slot!.closest('td') as HTMLElement).classList.contains('fixed-right')).toBe(true);
            const assigned = slot!.assignedNodes()[0] as HTMLElement;
            expect(assigned.tagName.toLowerCase()).toBe('solely-button');
            expect(assigned.getAttribute('type')).toBe('primary');
            expect(assigned.textContent).toBe('编辑');
        }
    });

    it('文档「固定列（0.8.0）」demo 用按钮插槽，不再把「编辑」写成数据字段', () => {
        const html = readFileSync(resolve(process.cwd(), 'docs/components-docs/views/table.html'), 'utf-8');
        const start = html.indexOf('固定列（0.8.0）');
        const end = html.indexOf('<!-- API 文档 -->', start);
        expect(start).toBeGreaterThan(-1);
        const section = html.slice(start, end);
        expect(section).toContain('row-key="id"');
        expect(section).toContain('slot="col-op-1"');
        expect(section).toContain('slot="col-op-2"');
        expect(section).toContain('slot="col-op-3"');
        expect(section).not.toContain('"op":"编辑"');
    });
});
