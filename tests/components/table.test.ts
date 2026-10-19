import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TableColumn } from '../../src/components/elements/table/types';

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

function createTable(attrs: Record<string, string> = {}, columns = COLUMNS, data = DATA) {
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
