import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TreeNode } from '../../src/components/elements/tree/types';

/** 读取 tree 源码 CSS：jsdom 不计算 shadow DOM 内的样式级联，纯样式修复用静态断言锁定 */
function readTreeCss(): string {
    return readFileSync(resolve(process.cwd(), 'src/components/elements/tree/style.css'), 'utf-8').replace(/\s+/g, ' ');
}

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

    it('should re-render when tree-data attribute changes after mount', async () => {
        const el = createTree(SAMPLE);
        await tick();

        el.setAttribute('tree-data', JSON.stringify([{ key: 'next', title: 'Next' }]));
        await tick();

        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toEqual(['Next']);
        expect(el.getTreeData()).toEqual([{ key: 'next', title: 'Next' }]);
    });

    it('should navigate visible nodes with ArrowUp / ArrowDown and Home / End', async () => {
        const el = createTree(SAMPLE, { 'default-expand-all': '' });
        await tick();
        const nodes = el.shadowRoot.querySelectorAll('.tree__node') as NodeListOf<HTMLElement>;
        expect(nodes.length).toBe(4);

        nodes[0].focus();
        nodes[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
        await tick();
        expect(el.shadowRoot.activeElement?.getAttribute('aria-level')).toBe('2');

        el.shadowRoot.activeElement!.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true, composed: true }),
        );
        await tick();
        expect((el.shadowRoot.activeElement as HTMLElement).dataset.key).toBe('2');

        el.shadowRoot.activeElement!.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Home', bubbles: true, composed: true }),
        );
        await tick();
        expect((el.shadowRoot.activeElement as HTMLElement).dataset.key).toBe('1');
    });

    it('should expand with ArrowRight, descend into children and collapse with ArrowLeft', async () => {
        const el = createTree(SAMPLE);
        await tick();
        const parent = el.shadowRoot.querySelector('.tree__node') as HTMLElement;
        parent.focus();

        parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(4);

        parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
        await tick();
        expect((el.shadowRoot.activeElement as HTMLElement).dataset.key).toBe('1-1');

        // 折叠状态下按 ArrowLeft 回到父节点
        el.shadowRoot.activeElement!.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }),
        );
        await tick();
        expect((el.shadowRoot.activeElement as HTMLElement).dataset.key).toBe('1');

        // 展开状态下按 ArrowLeft 折叠
        parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(2);
    });

    it('should select with Enter and check with Space when checkable', async () => {
        const el = createTree(SAMPLE, { checkable: '' });
        await tick();
        const onSelect = vi.fn();
        const onCheck = vi.fn();
        el.addEventListener('select', onSelect);
        el.addEventListener('check', onCheck);

        const node = el.shadowRoot.querySelector('.tree__node') as HTMLElement;
        node.focus();
        node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }));
        await tick();
        expect(onCheck).toHaveBeenCalledTimes(1);
        expect(el.value).toEqual([]);

        // 非 checkable 时 Space 走选中
        const el2 = createTree(SAMPLE);
        await tick();
        const onSelect2 = vi.fn();
        el2.addEventListener('select', onSelect2);
        (el2.shadowRoot.querySelector('.tree__node') as HTMLElement).dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
        );
        await tick();
        expect(onSelect2).toHaveBeenCalledTimes(1);
        expect(el2.value).toEqual(['1']);
    });

    it('should honor node-level selectable: false', async () => {
        const el = createTree([
            { key: 'a', title: 'A', selectable: false },
            { key: 'b', title: 'B' },
        ]);
        await tick();
        const onSelect = vi.fn();
        el.addEventListener('select', onSelect);
        const contents = el.shadowRoot.querySelectorAll('.tree__content');
        contents[0].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(onSelect).not.toHaveBeenCalled();

        contents[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(el.value).toEqual(['b']);
    });

    it('should apply default expanded / checked / selected keys without events', async () => {
        const el = createTree(SAMPLE, {
            'default-expanded-keys': '["1"]',
            'default-checked-keys': '1-1',
            checkable: '',
        });
        const onChange = vi.fn();
        el.addEventListener('change', onChange);
        await tick();

        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toEqual(['Parent', 'Child A', 'Child B', 'Leaf']);
        expect(el.getCheckedKeys()).toEqual(['1-1']);
        expect(el.shadowRoot.querySelectorAll('.tree__checkbox--half-checked').length).toBe(1);

        document.body.innerHTML = '';
        const el2 = createTree(SAMPLE, { 'default-selected-keys': '2' });
        await tick();
        expect(el2.value).toEqual(['2']);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('should skip disabled descendants when cascading checked state', async () => {
        const data: TreeNode[] = [
            {
                key: 'p',
                title: 'Parent',
                children: [
                    { key: 'p-1', title: 'Enabled' },
                    { key: 'p-2', title: 'Disabled', disabled: true },
                ],
            },
        ];
        const el = createTree(data, {
            checkable: '',
            'default-expand-all': '',
            'checked-keys': '["p"]',
        });
        await tick();

        // 禁用节点不随父节点联动，也不进入提交集合
        expect(el.getCheckedKeys()).toEqual(['p', 'p-1']);
        expect(el.getCheckedKeys()).not.toContain('p-2');

        // 点击父节点复选框走同一条级联规则
        el.checkedKeys = [];
        await tick();
        const parentCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Parent')
            .querySelector('.tree__checkbox');
        parentCheckbox.click();
        await tick();
        expect(el.getCheckedKeys()).toEqual(['p', 'p-1']);
    });

    it('should honor explicitly written disabled keys and derive a half-checked parent', async () => {
        const data: TreeNode[] = [
            {
                key: 'p',
                title: 'Parent',
                children: [
                    { key: 'p-1', title: 'Enabled' },
                    { key: 'p-2', title: 'Disabled', disabled: true },
                ],
            },
        ];
        const el = createTree(data, { checkable: '', 'default-expand-all': '' });
        await tick();

        // 显式写入 disabled key：按调用方意图保留（与交互/级联路径不同）
        el.checkedKeys = ['p-2'];
        await tick();
        expect(el.getCheckedKeys()).toEqual(['p-2']);

        // 父节点的全选只统计 enabled 子节点，因此不能变全选；但禁用子节点已勾选，应呈半选
        const parentCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Parent')
            .querySelector('.tree__checkbox');
        expect(parentCheckbox.classList.contains('tree__checkbox--checked')).toBe(false);
        expect(parentCheckbox.classList.contains('tree__checkbox--half-checked')).toBe(true);

        // 禁用子节点本身必须同时带 checked + disabled 标记，且 CSS 不能让 disabled 覆盖选中背景
        const disabledCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Disabled')
            .querySelector('.tree__checkbox');
        expect(disabledCheckbox.classList.contains('tree__checkbox--checked')).toBe(true);
        expect(disabledCheckbox.classList.contains('tree__checkbox--disabled')).toBe(true);
        expect(disabledCheckbox.getAttribute('aria-checked')).toBe('true');
        expect(readTreeCss()).toContain('.tree__checkbox--disabled.tree__checkbox--checked');
    });

    it('should toggle only the target node when checkStrictly is set', async () => {
        const el = createTree(SAMPLE, { checkable: '', 'check-strictly': '', 'default-expand-all': '' });
        await tick();
        const parentCheckbox = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .find((n: any) => n.querySelector('.tree__title').textContent === 'Parent')
            .querySelector('.tree__checkbox');
        parentCheckbox.click();
        await tick();

        expect(el.getCheckedKeys()).toEqual(['1']);
        // 子节点未联动
        expect(el.shadowRoot.querySelectorAll('.tree__checkbox--checked').length).toBe(1);
    });

    it('should load children asynchronously via loadData', async () => {
        const el = createTree([{ key: 'lazy', title: 'Lazy' }]);
        await tick();
        el.loadData = vi.fn(async () => [{ key: 'lazy-1', title: 'Loaded' }]);

        (el.shadowRoot.querySelector('.tree__switcher') as HTMLElement).click();
        await tick();
        await tick();

        expect(el.loadData).toHaveBeenCalledTimes(1);
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(2);
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('Loaded');
    });

    it('异步加载节点保留可见箭头，并在等待期间给出 loading 反馈', async () => {
        const el = createTree([{ key: 'lazy', title: 'Lazy' }]);
        await tick();

        let resolveLoad: (nodes: TreeNode[]) => void = () => undefined;
        el.loadData = vi.fn(
            () =>
                new Promise<TreeNode[]>(resolve => {
                    resolveLoad = resolve;
                }),
        );
        // loadData 是挂载后才赋的 property，setter 触发的重渲染在下一帧生效
        await tick();

        const switcher = () => el.shadowRoot.querySelector('.tree__switcher') as HTMLElement;
        // 无 children 但可异步加载：不能标成叶子（CSS 会 visibility:hidden，用户点不到）
        expect(switcher().classList.contains('tree__switcher--leaf')).toBe(false);
        // 箭头与加载圆环都由伪元素绘制，DOM 里不再有会被 transform 旋转的三角字符
        expect(switcher().textContent!.trim()).toBe('');

        switcher().click();
        await tick();
        expect(switcher().classList.contains('tree__switcher--loading')).toBe(true);
        expect(switcher().classList.contains('tree__switcher--leaf')).toBe(false);

        // 加载中重复点击：不重复发请求，也不把还没有子数据的节点提前展开
        switcher().click();
        await tick();
        expect(el.loadData).toHaveBeenCalledTimes(1);
        expect(switcher().classList.contains('tree__switcher--expanded')).toBe(false);

        resolveLoad([{ key: 'lazy-1', title: 'Loaded' }]);
        await tick();
        expect(switcher().classList.contains('tree__switcher--loading')).toBe(false);
        expect(switcher().classList.contains('tree__switcher--expanded')).toBe(true);
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(2);
    });

    it('异步加载失败后箭头仍可点击重试', async () => {
        const el = createTree([{ key: 'lazy', title: 'Lazy' }]);
        await tick();
        el.loadData = vi.fn(() => Promise.reject(new Error('network')));

        const switcher = () => el.shadowRoot.querySelector('.tree__switcher') as HTMLElement;
        switcher().click();
        await tick();
        await tick();

        expect(el.loadData).toHaveBeenCalledTimes(1);
        expect(switcher().classList.contains('tree__switcher--loading')).toBe(false);
        expect(switcher().classList.contains('tree__switcher--leaf')).toBe(false);
    });

    it('加载反馈是独立的旋转圆环，三角不旋转、同级箭头不重放动画', () => {
        const css = readTreeCss();
        // 圆环由 ::after 绘制并单独旋转，三角形在加载期间隐藏
        expect(css).toContain('.tree__switcher--loading::after');
        expect(css).toContain('@keyframes solely-tree-loading-spin');
        expect(css).toContain('.tree__switcher--loading .solely-linear-icon { visibility: hidden; }');
        // 线性 chevron 取代 ▶ / ▼ 字符，CSS 里不能再有三角字形的 content
        expect(css).toContain('.solely-linear-icon { width: 14px; height: 14px; fill: none;');
        expect(css).not.toContain("content: '▼'");
        expect(css).not.toContain("content: '▶'");
        // 箭头本体不能带 animation 或 transform 过渡：flattenTree 按索引复用 DOM 时，
        // class 一变就会把旋转补间重放一遍，表现为同级三角一起抖一下
        expect(css).not.toMatch(/\.tree__switcher--loading\s*\{[^}]*animation\s*:/);
        expect(css).not.toMatch(/\.tree__switcher\s*\{[^}]*transition\s*:\s*transform/);
        expect(css).not.toMatch(/\.tree__switcher--expanded\s*\{[^}]*transform\s*:/);
    });

    it('should expose node slots for custom rendering and roving tabindex', async () => {
        const el = createTree(SAMPLE);
        await tick();
        const slots = [...el.shadowRoot.querySelectorAll('.tree__title slot')].map((s: any) => s.getAttribute('name'));
        expect(slots).toEqual(['node-1', 'node-2']);

        const nodes = el.shadowRoot.querySelectorAll('.tree__node');
        expect(nodes[0].getAttribute('tabindex')).toBe('0');
        expect(nodes[1].getAttribute('tabindex')).toBe('-1');
    });

    it('展开/勾选控件不产生幽灵 Tab 停点，整树只保留一个停点', async () => {
        const el = createTree(SAMPLE, { checkable: '' });
        await tick();

        const nodes = [...el.shadowRoot.querySelectorAll('.tree__node')] as HTMLElement[];
        expect(nodes.filter(node => node.getAttribute('tabindex') === '0')).toHaveLength(1);

        const switchers = [...el.shadowRoot.querySelectorAll('.tree__switcher')] as HTMLElement[];
        switchers.forEach(switcher => {
            // 完全不可聚焦：aria-hidden 元素若带 tabindex="-1"，鼠标点击仍会聚焦并触发 Chrome 警告
            expect(switcher.hasAttribute('tabindex')).toBe(false);
            expect(switcher.getAttribute('aria-hidden')).toBe('true');
        });

        const checkboxes = [...el.shadowRoot.querySelectorAll('.tree__checkbox')] as HTMLElement[];
        checkboxes.forEach(checkbox => expect(checkbox.getAttribute('tabindex')).toBe('-1'));
    });

    it('整树 disabled 时没有 Tab 停点且不可操作', async () => {
        const el = createTree(SAMPLE, { checkable: '', disabled: '' });
        await tick();

        const nodes = [...el.shadowRoot.querySelectorAll('.tree__node')] as HTMLElement[];
        nodes.forEach(node => expect(node.getAttribute('tabindex')).toBe('-1'));

        const switchers = [...el.shadowRoot.querySelectorAll('.tree__switcher')] as HTMLElement[];
        switchers.forEach(switcher => expect(switcher.hasAttribute('tabindex')).toBe(false));

        const checkboxes = [...el.shadowRoot.querySelectorAll('.tree__checkbox')] as HTMLElement[];
        checkboxes.forEach(checkbox => expect(checkbox.getAttribute('tabindex')).toBe('-1'));

        const before = el.shadowRoot.querySelectorAll('.tree__node').length;
        switchers[0].click();
        await tick();
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(before);
    });

    it('should apply default keys once when async data becomes available', async () => {
        const el = createTree(null, {
            'default-expanded-keys': '["1"]',
            'default-checked-keys': '1-1',
            'default-selected-keys': '2',
            checkable: '',
        });
        await tick();
        expect(el.getExpandedKeys()).toEqual([]);

        el.treeData = SAMPLE;
        await tick();

        expect(el.getExpandedKeys()).toEqual(['1']);
        expect(el.getCheckedKeys()).toEqual(['1-1']);
        expect(el.value).toEqual(['2']);
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toEqual(['Parent', 'Child A', 'Child B', 'Leaf']);
    });

    it('should render built-in search box and filter while typing', async () => {
        const el = createTree(SAMPLE, { searchable: '' });
        await tick();

        const input = el.shadowRoot.querySelector('.tree__search-input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.getAttribute('placeholder')).toContain('搜索');

        input.value = 'child a';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        const visibleTitles = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .filter((node: any) => !node.classList.contains('tree__node--filtered'))
            .map((node: any) => node.querySelector('.tree__title').textContent);
        expect(visibleTitles).toEqual(['Parent', 'Child A']);
        expect(el.shadowRoot.querySelectorAll('.tree__node--filtered').length).toBe(2);
    });

    it('should re-filter automatically when search-value attribute changes', async () => {
        const el = createTree(SAMPLE, { searchable: '', 'search-value': 'child' });
        await tick();
        let visibleTitles = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .filter((node: any) => !node.classList.contains('tree__node--filtered'))
            .map((node: any) => node.querySelector('.tree__title').textContent);
        expect(visibleTitles).toEqual(['Parent', 'Child A', 'Child B']);

        el.setAttribute('search-value', 'leaf');
        await tick();
        visibleTitles = [...el.shadowRoot.querySelectorAll('.tree__node')]
            .filter((node: any) => !node.classList.contains('tree__node--filtered'))
            .map((node: any) => node.querySelector('.tree__title').textContent);
        expect(visibleTitles).toEqual(['Leaf']);
        expect(el.shadowRoot.querySelectorAll('.tree__node--filtered').length).toBe(3);
    });

    it('should expandAll / collapseAll and emit expand + change', async () => {
        const el = createTree(SAMPLE);
        await tick();

        const onExpand = vi.fn();
        const onChange = vi.fn();
        el.addEventListener('expand', onExpand);
        el.addEventListener('change', onChange);

        el.expandAll();
        await tick();
        expect([...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent)).toEqual([
            'Parent',
            'Child A',
            'Child B',
            'Leaf',
        ]);
        expect(el.getExpandedKeys()).toEqual(['1', '1-1', '1-2', '2']);
        expect(onExpand).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledTimes(1);

        el.collapseAll();
        await tick();
        expect(el.getExpandedKeys()).toEqual([]);
        expect(el.shadowRoot.querySelectorAll('.tree__node').length).toBe(2);
        expect(onExpand).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('should load pending children during expandAll', async () => {
        const el = createTree([{ key: 'lazy', title: 'Lazy' }]);
        await tick();
        el.loadData = vi.fn(async () => [{ key: 'lazy-1', title: 'Loaded' }]);

        el.expandAll();
        await tick();
        await tick();

        expect(el.loadData).toHaveBeenCalledTimes(1);
        const titles = [...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent);
        expect(titles).toContain('Loaded');
        expect(el.getExpandedKeys()).toEqual(['lazy', 'lazy-1']);
    });

    it('should cancel in-flight expandAll loads on collapseAll', async () => {
        const el = createTree([{ key: 'lazy', title: 'Lazy' }]);
        await tick();

        let resolveLoad: (nodes: TreeNode[]) => void = () => undefined;
        el.loadData = vi.fn(
            () =>
                new Promise<TreeNode[]>(resolve => {
                    resolveLoad = resolve;
                }),
        );

        el.expandAll();
        el.collapseAll();
        resolveLoad([{ key: 'lazy-1', title: 'Loaded' }]);
        await tick();
        await tick();

        expect(el.getExpandedKeys()).toEqual([]);
        expect([...el.shadowRoot.querySelectorAll('.tree__title')].map((t: any) => t.textContent)).toEqual(['Lazy']);
    });
});

describe('tree 线性 chevron', () => {
    it('展开/折叠切换 SVG 的 path，不再是 ▶ / ▼ 文本字符', async () => {
        const el = createTree([{ key: '1', title: '父节点', children: [{ key: '1-1', title: '子节点' }] }]);
        await tick();

        const switcher = () => el.shadowRoot.querySelector('.tree__switcher') as HTMLElement;
        const path = () => switcher().querySelector('svg.solely-linear-icon path');
        expect(path()?.getAttribute('d')).toBe('M6 3.5 10.5 8 6 12.5');
        expect(switcher().textContent?.trim()).toBe('');

        switcher().click();
        await tick();
        expect(path()?.getAttribute('d')).toBe('M3.5 6 8 10.5 12.5 6');
    });
});

describe('tree default-expand-all', () => {
    it('默认展开后仍可点击折叠，collapseAll() 也不会被默认值覆盖回去', async () => {
        const el = createTree(
            [
                { key: 'p1', title: '父节点1', children: [{ key: 'c1', title: '子节点1' }] },
                { key: 'p2', title: '父节点2', children: [{ key: 'c2', title: '子节点2' }] },
            ],
            { 'default-expand-all': '' },
        );
        await tick();

        const titles = () =>
            Array.from(el.shadowRoot.querySelectorAll('.tree__title')).map((t: any) => t.textContent?.trim());
        expect(titles()).toContain('子节点1');
        expect(titles()).toContain('子节点2');

        (el.shadowRoot.querySelector('.tree__switcher') as HTMLElement).click();
        await tick();
        expect(titles()).not.toContain('子节点1');
        expect(titles()).toContain('子节点2');

        el.collapseAll();
        await tick();
        expect(titles()).not.toContain('子节点2');
    });

    it('静态 HTML 写法（属性在连接期间同步两次）默认展开仍生效且可折叠', async () => {
        document.body.innerHTML = '';
        const data = [
            { key: 'p1', title: '父节点1', children: [{ key: 'c1', title: '子节点1' }] },
            { key: 'p2', title: '父节点2', children: [{ key: 'c2', title: '子节点2' }] },
        ];
        document.body.innerHTML = `<solely-tree default-expand-all tree-data='${JSON.stringify(data)}'></solely-tree>`;
        await tick();

        const el = document.querySelector('solely-tree') as any;
        const titles = () =>
            Array.from(el.shadowRoot.querySelectorAll('.tree__title')).map((t: any) => t.textContent?.trim());
        expect(titles()).toContain('子节点1');
        expect(titles()).toContain('子节点2');

        (el.shadowRoot.querySelector('.tree__switcher') as HTMLElement).click();
        await tick();
        expect(titles()).not.toContain('子节点1');
        expect(titles()).toContain('子节点2');
    });
});
