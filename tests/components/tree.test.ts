import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TreeNode } from '../../src/components/elements/tree/types';

// 引入组件即自动注册自定义元素 <solely-tree>（sideEffects 已覆盖）
import '../../src/components/elements/tree';

// 等待渲染（render 通过 queueMicrotask 调度，这里用 macrotask 确保完成）
const tick = () => new Promise<void>(r => setTimeout(r, 20));

function createTree(treeData: TreeNode[] | null, attrs: Record<string, string> = {}) {
    const el = document.createElement('solely-tree') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    if (treeData) {
        el.setAttribute('tree-data', JSON.stringify(treeData));
    }
    document.body.appendChild(el);
    return el as any;
}

const SAMPLE: TreeNode[] = [
    {
        key: '1',
        title: 'Parent',
        children: [
            { key: '1-1', title: 'Child A' },
            { key: '1-2', title: 'Child B' },
        ],
    },
    { key: '2', title: 'Leaf' },
];

describe('solely-tree', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render flattened nodes from tree-data attribute', async () => {
        const el = createTree(SAMPLE);
        await tick();
        const nodes = el.shadowRoot.querySelectorAll('.tree__node');
        // 默认未展开：只渲染顶层两个节点
        expect(nodes.length).toBe(2);
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('Parent');
        expect(titles).toContain('Leaf');
    });

    it('should apply show-line prop to root class', async () => {
        const el = createTree(SAMPLE, { 'show-line': '' });
        await tick();
        const root = el.shadowRoot.querySelector('.tree');
        expect(root.classList.contains('tree--show-line')).toBe(true);
    });

    it('should expand all nodes when default-expand-all is set', async () => {
        const el = createTree(SAMPLE, { 'default-expand-all': '' });
        await tick();
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        // 全部展开后包含子节点
        expect(titles).toContain('Child A');
        expect(titles).toContain('Child B');
    });

    it('should emit select event and mark node selected on content click', async () => {
        const el = createTree(SAMPLE);
        await tick();

        const onSelect = vi.fn();
        el.addEventListener('select', onSelect);

        const parentContent = [...el.shadowRoot.querySelectorAll('.tree__content')].find(
            (c: any) => c.querySelector('.tree__title').textContent === 'Parent',
        );
        parentContent.click();
        await tick();

        expect(onSelect).toHaveBeenCalledTimes(1);
        const detail = onSelect.mock.calls[0][0].detail;
        expect(detail.selectedKeys).toEqual(['1']);
        expect(detail.node.key).toBe('1');
        // DOM 类名反映选中态
        expect(parentContent.classList.contains('tree__content--selected')).toBe(true);
        // value getter 同步选中 key
        expect(el.value).toEqual(['1']);
    });

    it('should cascade check state and emit check event when checkable', async () => {
        const el = createTree(SAMPLE, { checkable: '', 'default-expand-all': '' });
        await tick();

        const onCheck = vi.fn();
        el.addEventListener('check', onCheck);

        const childCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Child A')
            .querySelector('.tree__checkbox');
        childCheckbox.click();
        await tick();

        expect(onCheck).toHaveBeenCalledTimes(1);
        expect(onCheck.mock.calls[0][0].detail.checkedKeys).toEqual(['1-1']);
        // 父节点半选
        const parentCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Parent')
            .querySelector('.tree__checkbox');
        expect(parentCheckbox.classList.contains('tree__checkbox--half-checked')).toBe(true);
        expect(el.getCheckedKeys()).toEqual(['1-1']);
    });

    it('should toggle expand on switcher click and emit expand event', async () => {
        const el = createTree(SAMPLE);
        await tick();

        const onExpand = vi.fn();
        el.addEventListener('expand', onExpand);

        const switcher = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Parent')
            .querySelector('.tree__switcher');
        switcher.click();
        await tick();

        // 展开后多出两个子节点（Parent + Child A + Child B + 顶层 Leaf = 4）
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(4);
        expect(onExpand).toHaveBeenCalledTimes(1);
        expect(onExpand.mock.calls[0][0].detail.expandedKeys).toEqual(['1']);
        expect(switcher.classList.contains('tree__switcher--expanded')).toBe(true);

        // 再次点击折叠
        switcher.click();
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(2);
    });

    it('should render nothing for empty data', async () => {
        const el = createTree([]);
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(0);
    });

    it('should support setTreeData / getTreeData public methods', async () => {
        const el = createTree(null);
        await tick();
        expect(el.getTreeData()).toEqual([]);

        el.setTreeData([{ key: 'x', title: 'New' }]);
        await tick();
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('New');
        expect(el.getTreeData()[0].key).toBe('x');
    });

    it('should reset to attribute data after re-attach (documented caveat)', async () => {
        // 锁定 parseTreeData() 注释描述的边界：重新挂载时 connectedCallback 会把
        // tree-data attribute 重新同步进 $data，随后 mounted -> parseTreeData()
        // 用它覆盖 setTreeData() 写入的动态数据。
        const el = createTree(SAMPLE);
        await tick();

        el.setTreeData([{ key: 'dynamic', title: 'Dynamic' }]);
        await tick();
        let titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('Dynamic');

        // 移出 DOM 再插入，触发 connectedCallback + mounted
        el.remove();
        document.body.appendChild(el);
        await tick();

        titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).not.toContain('Dynamic');
        expect(titles).toContain('Parent');
        // 恢复方式：重新挂载后再调一次 setTreeData
        el.setTreeData([{ key: 'dynamic', title: 'Dynamic' }]);
        await tick();
        titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('Dynamic');
    });
});
