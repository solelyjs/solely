/**
 * Solely Tree 组件
 * 树形控件，用于展示层级结构数据
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TreeProps, TreeNode, TreeSelectEventDetail, TreeCheckEventDetail, TreeExpandEventDetail } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-tree',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'treeData', type: 'string' },
        { name: 'showLine', type: 'boolean', default: false },
        { name: 'multiple', type: 'boolean', default: false },
        { name: 'checkable', type: 'boolean', default: false },
        { name: 'defaultExpandAll', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'searchable', type: 'boolean', default: false },
        { name: 'searchValue', type: 'string' },
        { name: 'block', type: 'boolean', default: false },
        { name: 'checkStrictly', type: 'boolean', default: false },
        { name: 'defaultExpandedKeys', type: 'string' },
        { name: 'defaultCheckedKeys', type: 'string' },
        { name: 'defaultSelectedKeys', type: 'string' },
        // 受控键：attribute 写法为 JSON 数组，property 写法可直接传 string[]
        { name: 'checkedKeys', type: 'array' },
        { name: 'expandedKeys', type: 'array' },
        { name: 'label', type: 'string', default: '' },
    ],
})
class SolelyTree extends BaseElement<
    TreeProps & {
        flattenedTree: Array<
            TreeNode & {
                level: number;
                isFiltered?: boolean;
                highlight?: boolean;
                isLastChild?: boolean;
            }
        >;
    }
> {
    private _treeData: TreeNode[] = [];

    /** default*Keys 是否已应用（首次拿到非空数据时应用一次） */
    private _defaultsApplied = false;

    /** default-expand-all 是否已写回节点（只应用一次，之后由用户交互接管） */
    private _expandAllApplied = false;

    /** 上一次生效的搜索条件，用于在 search-value/searchable 变化时自动重新过滤 */
    private _lastSearchValue = '';
    private _lastSearchable = false;

    /** 展开全部时的异步加载代次，collapseAll 会让未完成的加载失效 */
    private _expandAllToken = 0;

    /** 数据尚未可用时暂存的受控键，挂载/数据就绪后统一应用 */
    private _pendingCheckedKeys?: string[];
    private _pendingExpandedKeys?: string[];

    /**
     * 异步加载子节点的回调（属性赋值方式使用，如 `el.loadData = async node => [...]`）。
     * 节点无 children 且非 isLeaf 时，首次展开会调用它。
     *
     * 用 accessor 而非普通字段：文档站通常在 mounted() 里才赋值，此时首帧已渲染，
     * 没有 loadData 的无子节点会被当成叶子、箭头被 CSS 隐藏，用户根本点不到。
     * setter 触发一次重算，让可异步加载的节点立刻获得可见箭头。
     */
    private _loadData?: (node: TreeNode) => Promise<TreeNode[]> | TreeNode[];

    get loadData(): ((node: TreeNode) => Promise<TreeNode[]> | TreeNode[]) | undefined {
        return this._loadData;
    }

    set loadData(value: ((node: TreeNode) => Promise<TreeNode[]> | TreeNode[]) | undefined) {
        this._loadData = value;
        this.flattenTree();
    }

    /** 已触发过异步加载的节点 key，避免重复请求 */
    private _loadedKeys = new Set<string>();

    /** 正在拉取子节点的节点 key：这段时间内箭头必须保持可见并给出加载反馈 */
    private _loadingKeys = new Set<string>();

    /**
     * 树形数据（解析后的数组）。
     * attribute、property 与方法三条路径都经过此 setter，统一触发解析与扁平化。
     */
    get treeData(): TreeNode[] {
        return this._treeData;
    }

    set treeData(value: string | TreeNode[]) {
        this._treeData = typeof value === 'string' ? safeJsonParse(value, []) : Array.isArray(value) ? value : [];
        // 重新解析会生成全新的节点对象，之前写入的默认展开/默认键随之丢失。
        // 静态 HTML 场景下 upgrade 与 connectedCallback 会各写一次 tree-data：
        // 不重置标记的话，第二遍数据会抹掉第一遍应用的默认状态，而标记仍为 true，
        // mounted 也不会再补应用（表现为 default-expand-all 静默失效）。
        this._expandAllApplied = false;
        this._defaultsApplied = false;
        // 数据首次可用时（常见于异步 fetch 后赋值）补应用默认键
        this.applyDefaultKeysIfAvailable();
        this.applyPendingKeys();
        this.flattenTree();
    }

    /**
     * 获取 tree class 对象
     */
    getTreeClasses(): Record<string, boolean> {
        return {
            'tree--show-line': !!this.$data.showLine,
        };
    }

    /**
     * 获取 node class 对象
     */
    getNodeClasses(
        node: TreeNode & { isFiltered?: boolean; isLastChild?: boolean; level?: number },
    ): Record<string, boolean> {
        const classes: Record<string, boolean> = {
            'tree__node--filtered': !!node.isFiltered,
            'tree__node--last-child': !!node.isLastChild,
        };
        // 添加层级类名，用于连接线样式
        if (node.level !== undefined) {
            classes[`tree__node--level-${node.level}`] = true;
        }
        return classes;
    }

    /**
     * 获取 content class 对象
     */
    getContentClasses(node: TreeNode): Record<string, boolean> {
        return {
            'tree__content--selected': !!node.selected,
            'tree__content--disabled': !!node.disabled,
        };
    }

    /**
     * 获取 switcher class 对象
     *
     * 配置了 loadData 且尚未拉取过子节点的节点，即使当前没有 children 也不是叶子：
     * 必须保留可见的展开箭头，否则用户点不到它，异步加载永远无法触发。
     */
    getSwitcherClasses(node: TreeNode): Record<string, boolean> {
        const hasChildren = !!node.children && node.children.length > 0;
        const loading = this._loadingKeys.has(node.key);
        return {
            'tree__switcher--expanded': !!node.expanded,
            'tree__switcher--loading': loading,
            'tree__switcher--leaf': !hasChildren && !loading && !this.shouldLoadChildren(node),
        };
    }

    /**
     * 获取 checkbox class 对象
     */
    getCheckboxClasses(node: TreeNode): Record<string, boolean> {
        return {
            'tree__checkbox--checked': !!node.checked,
            'tree__checkbox--half-checked': !!(node as { halfChecked?: boolean }).halfChecked,
            'tree__checkbox--disabled': !!node.disabled,
        };
    }

    /**
     * 获取 title class 对象
     */
    getTitleClasses(node: TreeNode & { highlight?: boolean }): Record<string, boolean> {
        return {
            'tree__title--highlight': !!node.highlight,
        };
    }

    mounted(): void {
        this.applyDefaultKeysIfAvailable();
        this.applyPendingKeys();
        this.refresh();
        this.parseTreeData();
        this._lastSearchable = !!this.$data.searchable;
        this._lastSearchValue = this._lastSearchable ? this.$data.searchValue || '' : '';
    }

    /**
     * searchValue / searchable 变化后自动重新过滤，无需手动调用 parseTreeData()
     */
    updated(): void {
        const searchable = !!this.$data.searchable;
        const searchValue = searchable ? this.$data.searchValue || '' : '';
        if (searchable === this._lastSearchable && searchValue === this._lastSearchValue) return;

        this._lastSearchable = searchable;
        this._lastSearchValue = searchValue;
        this.flattenTree();
        // 搜索过滤会改变可见集合，与展开/勾选一样通过 change 事件通知
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * 解析 default*Keys 属性：支持 JSON 数组（'["1","2"]'）与逗号分隔（'1,2'）
     */
    private parseKeys(value?: string): string[] {
        if (!value) return [];
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            const parsed = safeJsonParse<unknown>(trimmed, []);
            return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
        }
        return trimmed
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    /**
     * 应用默认展开/勾选/选中（仅在数据首次可用时生效，不派发事件）
     */
    private applyDefaultKeys(): boolean {
        const expandedKeys = this.parseKeys(this.$data.defaultExpandedKeys);
        const checkedKeys = this.parseKeys(this.$data.defaultCheckedKeys);
        const selectedKeys = this.parseKeys(this.$data.defaultSelectedKeys);
        if (!expandedKeys.length && !checkedKeys.length && !selectedKeys.length) return false;

        const traverse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (expandedKeys.includes(node.key)) node.expanded = true;
                if (checkedKeys.includes(node.key)) node.checked = true;
                if (selectedKeys.includes(node.key) && this.isNodeSelectable(node)) node.selected = true;
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        if (checkedKeys.length && !this.$data.checkStrictly) {
            // 默认键可能指向父节点：先向下级联勾选后代，再自底向上重算，避免父节点被清空
            this.syncCheckCascade();
        }
        return true;
    }

    /**
     * 数据首次可用时应用默认键。
     * 未连接阶段（属性初始化）不处理，交给 mounted / 后续 tree-data 赋值。
     */
    private applyDefaultKeysIfAvailable(): void {
        if (!this.isConnected || this.treeData.length === 0) return;
        // 「默认展开全部」只在数据首次可用时写回节点状态：若让 flattenTree 每次都按
        // defaultExpandAll 强制展开，用户点击折叠 / collapseAll() 后会被立刻覆盖回去。
        this.applyDefaultExpandAll();
        if (this._defaultsApplied) return;
        if (this.applyDefaultKeys()) this._defaultsApplied = true;
    }

    /** 一次性把 default-expand-all 应用到节点，之后完全由 node.expanded 控制 */
    private applyDefaultExpandAll(): void {
        if (this._expandAllApplied || !this.$data.defaultExpandAll) return;
        this._expandAllApplied = true;

        const traverse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.children && node.children.length > 0) {
                    node.expanded = true;
                    traverse(node.children);
                }
            }
        };
        traverse(this.treeData);
    }

    /**
     * 由子节点计算父节点的勾选态
     *
     * - 没有未禁用子节点时返回 null：不重算，保留父节点的显式状态
     *   （例如 checkedKeys 写入一个子节点全禁用的父节点）；
     * - 全选判定只统计未禁用子节点：禁用项不能被级联勾选，也不应阻止父节点全选；
     * - 半选判定包含禁用子节点：调用方显式写入的 disabled key 会被保留，父节点据此呈半选。
     */
    private calcParentCheckState(children: TreeNode[]): { checked: boolean; halfChecked: boolean } | null {
        const enabled = children.filter(child => !child.disabled);
        if (enabled.length === 0) return null;
        const checked = enabled.every(child => child.checked);
        const halfChecked = !checked && children.some(child => child.checked || child.halfChecked);
        return { checked, halfChecked };
    }

    /**
     * 根据子节点状态自底向上重算父节点的 checked / halfChecked
     */
    private syncParentCheckStates(nodes: TreeNode[]): void {
        for (const node of nodes) {
            if (!node.children || node.children.length === 0) continue;
            this.syncParentCheckStates(node.children);
            const state = this.calcParentCheckState(node.children);
            if (!state) continue;
            node.checked = state.checked;
            node.halfChecked = state.halfChecked;
        }
    }

    /**
     * 非严格勾选模式下的父子联动：
     * 勾选父节点时向下级联所有【未禁用】后代，再自底向上重算父节点的 checked / halfChecked。
     *
     * 仅约束交互与级联路径；调用方显式写入的 checkedKeys / defaultCheckedKeys
     * 即使命中 disabled 节点也按原样保留（业务预置场景）。
     */
    private syncCheckCascade(): void {
        const checkDescendants = (node: TreeNode) => {
            node.children?.forEach(child => {
                // 禁用子树不随父节点联动
                if (child.disabled) return;
                child.checked = true;
                child.halfChecked = false;
                checkDescendants(child);
            });
        };
        const cascade = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.disabled) continue;
                if (node.checked) checkDescendants(node);
                if (node.children) cascade(node.children);
            }
        };
        cascade(this.treeData);
        this.syncParentCheckStates(this.treeData);
    }

    /**
     * 节点是否可选中：节点自身 selectable: false 时不可选中
     */
    isNodeSelectable(node: TreeNode): boolean {
        return node.selectable !== false;
    }

    /**
     * 解析树形数据（属性 setter 已自动完成解析，这里仅重建扁平列表）
     */
    parseTreeData(): void {
        this.flattenTree();
    }

    /**
     * 扁平化树形数据
     */
    flattenTree(): void {
        const result: Array<
            TreeNode & { level: number; isFiltered?: boolean; highlight?: boolean; isLastChild?: boolean }
        > = [];
        const searchValue = this.$data.searchable ? (this.$data.searchValue || '').toLowerCase() : '';

        const traverse = (nodes: TreeNode[], level: number) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const hasChildren = node.children && node.children.length > 0;
                const isExpanded = !!searchValue || node.expanded;
                const matchesSearch = searchValue && node.title.toLowerCase().includes(searchValue);

                const flatNode = {
                    ...node,
                    level,
                    expanded: isExpanded,
                    isFiltered: !!(searchValue && !matchesSearch && !this.hasMatchingDescendant(node, searchValue)),
                    highlight: !!matchesSearch,
                    isLastChild: i === nodes.length - 1,
                };

                result.push(flatNode);

                if (hasChildren && isExpanded && node.children) {
                    traverse(node.children, level + 1);
                }
            }
        };

        traverse(this.treeData, 0);
        this.$data.flattenedTree = result;
    }

    /**
     * 检查是否有匹配的后代节点
     */
    hasMatchingDescendant(node: TreeNode, searchValue: string): boolean {
        if (!node.children || node.children.length === 0) return false;

        for (const child of node.children) {
            if (child.title.toLowerCase().includes(searchValue)) return true;
            if (this.hasMatchingDescendant(child, searchValue)) return true;
        }

        return false;
    }

    /**
     * 内置搜索框输入；过滤统一在 updated() 中按 searchValue 变化触发
     */
    handleSearchInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.$data.searchValue = input.value;
    }

    /**
     * 切换展开/折叠
     */
    handleToggle(node: TreeNode & { level: number }, event: Event): void {
        event.stopPropagation();

        if (this.$data.disabled) return;

        const originalNode = this.findNode(this.treeData, node.key);
        if (!originalNode) return;

        // 拉取中再次点击不应把还没有子数据的节点提前展开，也不应重复发请求
        if (this._loadingKeys.has(originalNode.key)) return;

        const willExpand = !originalNode.expanded;

        // 异步加载：无子节点且非叶子、且提供了 loadData 时，首次展开先拉取数据
        if (willExpand && this.shouldLoadChildren(originalNode)) {
            this._loadedKeys.add(originalNode.key);
            this._loadingKeys.add(originalNode.key);
            // 立即重渲染：箭头进入 loading 态，避免等待期间看起来「点了没反应」
            this.flattenTree();
            Promise.resolve(this.loadData ? this.loadData(originalNode) : [])
                .then(children => {
                    this._loadingKeys.delete(originalNode.key);
                    originalNode.children = Array.isArray(children) ? children : [];
                    originalNode.expanded = true;
                    this.expandFromNode();
                    this.notifyExpand(originalNode);
                })
                .catch(() => {
                    // 加载失败时保持折叠，允许下次重试
                    this._loadedKeys.delete(originalNode.key);
                    this._loadingKeys.delete(originalNode.key);
                    this.flattenTree();
                });
            return;
        }

        originalNode.expanded = willExpand;
        this.expandFromNode();
        this.notifyExpand(originalNode);
    }

    /**
     * 是否需要异步加载子节点
     */
    private shouldLoadChildren(node: TreeNode): boolean {
        if (!this.loadData) return false;
        if (node.isLeaf) return false;
        if (this._loadedKeys.has(node.key)) return false;
        return !node.children || node.children.length === 0;
    }

    /**
     * 依据 treeData 重建扁平列表并刷新
     */
    private expandFromNode(): void {
        this.flattenTree();
    }

    /**
     * 派发 expand 事件与 change 事件
     */
    private notifyExpand(node: TreeNode): void {
        this.emit('expand', {
            expandedKeys: this.getExpandedKeys(),
            node,
        } as TreeExpandEventDetail);

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 节点点击
     */
    handleNodeClick(node: TreeNode & { level: number }): void {
        if (this.$data.disabled || node.disabled) return;
        if (!this.isNodeSelectable(node)) return;

        // 清除其他选中状态（非多选模式下）
        if (!this.$data.multiple) {
            this.clearSelection();
        }

        const originalNode = this.findNode(this.treeData, node.key);
        if (originalNode) {
            originalNode.selected = !originalNode.selected;
            this.flattenTree();

            // 派发 select 自定义事件
            this.emit('select', {
                selectedKeys: this.getSelectedKeys(),
                selectedNodes: this.getSelectedNodes(),
                node: originalNode,
            } as TreeSelectEventDetail);

            // 同时派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    /**
     * 勾选节点
     */
    handleCheck(node: TreeNode & { level: number }, event: Event): void {
        event.stopPropagation();

        if (this.$data.disabled || node.disabled) return;

        const originalNode = this.findNode(this.treeData, node.key);
        if (originalNode) {
            const newChecked = !originalNode.checked;
            if (this.$data.checkStrictly) {
                // 父子不关联：只切换当前节点
                originalNode.checked = newChecked;
                originalNode.halfChecked = false;
            } else {
                this.updateNodeCheckState(originalNode, newChecked);
            }
            this.flattenTree();

            // 派发 check 自定义事件
            this.emit('check', {
                checkedKeys: this.getCheckedKeys(),
                checkedNodes: this.getCheckedNodes(),
                node: originalNode,
            } as TreeCheckEventDetail);

            // 同时派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    /**
     * 复选框的键盘触发
     */
    handleCheckKeydown(event: KeyboardEvent, node: TreeNode & { level: number }): void {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        this.handleCheck(node, event);
    }

    /**
     * 参与键盘导航的节点（跳过禁用节点）
     */
    private getNavigableNodes(): Array<TreeNode & { level: number }> {
        // 全局禁用时整树退出 Tab 序列与键盘导航
        if (this.$data.disabled) return [];
        const nodes = this.$data.flattenedTree || [];
        // 搜索过滤的节点仅以 display:none 隐藏，仍留在 flattenedTree 中：
        // 必须排除，否则 tabindex 会落到不可见节点、方向键 focus 也会失败
        return nodes.filter(node => !node.disabled && !node.isFiltered);
    }

    /**
     * roving tabindex：仅第一个可导航节点进入 Tab 序列
     */
    getNodeTabindex(node: TreeNode): string {
        const first = this.getNavigableNodes()[0];
        return first && first.key === node.key ? '0' : '-1';
    }

    /**
     * 把焦点移到指定节点
     */
    private focusNode(key: string): void {
        const nodes = Array.from(this.shadowRoot?.querySelectorAll('.tree__node') || []) as HTMLElement[];
        const target = nodes.find(item => item.dataset.key === key);
        target?.focus();
    }

    /**
     * 节点键盘导航（WAI-ARIA tree 模式）
     *
     * - ArrowDown / ArrowUp：下一个 / 上一个可见节点
     * - ArrowRight：展开节点；已展开时聚焦第一个子节点
     * - ArrowLeft：折叠节点；已折叠时聚焦父节点
     * - Home / End：第一个 / 最后一个可见节点
     * - Enter：选中节点；Space：可勾选时勾选，否则选中
     */
    handleNodeKeydown(event: KeyboardEvent, node: TreeNode & { level: number }): void {
        if (this.$data.disabled) return;
        if (event.target !== event.currentTarget) return;

        const key = event.key;
        const nodes = this.getNavigableNodes();
        if (nodes.length === 0) return;
        const index = nodes.findIndex(item => item.key === node.key);
        if (index < 0) return;

        const focusAt = (next?: TreeNode) => {
            if (!next) return;
            event.preventDefault();
            this.focusNode(next.key);
        };

        switch (key) {
            case 'ArrowDown':
                focusAt(nodes[(index + 1) % nodes.length]);
                return;
            case 'ArrowUp':
                focusAt(nodes[(index - 1 + nodes.length) % nodes.length]);
                return;
            case 'Home':
                focusAt(nodes[0]);
                return;
            case 'End':
                focusAt(nodes[nodes.length - 1]);
                return;
            case 'ArrowRight': {
                const originalNode = this.findNode(this.treeData, node.key);
                if (!originalNode) return;
                if (originalNode.children && originalNode.children.length > 0 && !originalNode.expanded) {
                    this.handleToggle(node, event);
                } else if (originalNode.expanded && nodes[index + 1] && nodes[index + 1].level > node.level) {
                    focusAt(nodes[index + 1]);
                }
                return;
            }
            case 'ArrowLeft': {
                const originalNode = this.findNode(this.treeData, node.key);
                if (!originalNode) return;
                if (originalNode.expanded) {
                    this.handleToggle(node, event);
                    return;
                }
                const parent = this.findParentNode(nodes, index, node.level);
                focusAt(parent);
                return;
            }
            case 'Enter':
                event.preventDefault();
                this.handleNodeClick(node);
                return;
            case ' ':
            case 'Spacebar':
                event.preventDefault();
                if (this.$data.checkable) {
                    this.handleCheck(node, event);
                } else {
                    this.handleNodeClick(node);
                }
                return;
            default:
                return;
        }
    }

    /**
     * 在可见节点列表中向前查找最近的上层父节点
     */
    private findParentNode(
        nodes: Array<TreeNode & { level: number }>,
        index: number,
        level: number,
    ): TreeNode | undefined {
        for (let i = index - 1; i >= 0; i--) {
            if (nodes[i].level === level - 1) return nodes[i];
        }
        return undefined;
    }

    /**
     * 更新节点勾选状态（包括子节点）
     */
    updateNodeCheckState(node: TreeNode, checked: boolean): void {
        node.checked = checked;
        node.halfChecked = false;

        // 更新子节点：禁用子树不随父节点联动
        if (node.children) {
            for (const child of node.children) {
                if (child.disabled) continue;
                this.updateNodeCheckState(child, checked);
            }
        }

        // 更新父节点状态
        this.updateParentCheckState(this.treeData, node);
    }

    /**
     * 更新父节点勾选状态
     */
    updateParentCheckState(nodes: TreeNode[], targetNode: TreeNode): boolean {
        for (const node of nodes) {
            if (node.children) {
                if (node.children.includes(targetNode)) {
                    // 找到父节点；子节点全禁用时保留父节点显式状态
                    const state = this.calcParentCheckState(node.children);
                    if (state) {
                        node.checked = state.checked;
                        node.halfChecked = state.halfChecked;
                    }
                    return true;
                }

                if (this.updateParentCheckState(node.children, targetNode)) {
                    // 递归更新上层父节点
                    const state = this.calcParentCheckState(node.children);
                    if (state) {
                        node.checked = state.checked;
                        node.halfChecked = state.halfChecked;
                    }
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 查找节点
     */
    findNode(nodes: TreeNode[], key: string): TreeNode | null {
        for (const node of nodes) {
            if (node.key === key) return node;

            if (node.children) {
                const found = this.findNode(node.children, key);
                if (found) return found;
            }
        }

        return null;
    }

    /**
     * 清除选中状态
     */
    clearSelection(): void {
        const clear = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                node.selected = false;
                if (node.children) clear(node.children);
            }
        };

        clear(this.treeData);
    }

    /**
     * 获取勾选的节点 key
     */
    getCheckedKeys(): string[] {
        const keys: string[] = [];

        const traverse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.checked) {
                    keys.push(node.key);
                }
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        return keys;
    }

    /**
     * 设置勾选的节点 key
     *
     * 支持 `el.checkedKeys = ['1','2']` 与 attribute `checked-keys='["1","2"]'`。
     * 数据未就绪（属性升级 / 异步赋值）时先暂存，等 treeData 可用后应用。
     */
    set checkedKeys(keys: string | string[]) {
        const normalized = this.parseKeyList(keys);
        if (!this.isConnected || this._treeData.length === 0) {
            this._pendingCheckedKeys = normalized;
            return;
        }
        this.applyCheckedKeys(normalized);
        if (!this.isSyncingProps) {
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
    }

    get checkedKeys(): string[] {
        return this.getCheckedKeys();
    }

    private applyCheckedKeys(keys: string[]): void {
        const clearAll = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                node.checked = false;
                node.halfChecked = false;
                if (node.children) clearAll(node.children);
            }
        };
        clearAll(this.treeData);

        const setChecked = (nodes: TreeNode[], targetKeys: string[]) => {
            for (const node of nodes) {
                if (targetKeys.includes(node.key)) {
                    node.checked = true;
                }
                if (node.children) setChecked(node.children, targetKeys);
            }
        };
        setChecked(this.treeData, keys);
        if (keys.length && !this.$data.checkStrictly) {
            // 受控写入与点击路径保持一致：父节点勾选需向下级联并重算半选态
            this.syncCheckCascade();
        }
        this.flattenTree();
    }

    /** 应用数据就绪前暂存的受控键（默认键先应用，显式键覆盖默认值） */
    private applyPendingKeys(): void {
        if (!this.isConnected) return;
        if (this._pendingCheckedKeys) {
            this.applyCheckedKeys(this._pendingCheckedKeys);
            this._pendingCheckedKeys = undefined;
        }
        if (this._pendingExpandedKeys) {
            this.applyExpandedKeys(this._pendingExpandedKeys);
            this._pendingExpandedKeys = undefined;
        }
    }

    /** 受控键既接受 string[]，也接受 JSON / 逗号分隔字符串（兼容模板拼接） */
    private parseKeyList(value: string | string[] | undefined): string[] {
        if (Array.isArray(value)) return value.map(key => String(key));
        return this.parseKeys(value);
    }

    /**
     * 获取展开的节点 key
     */
    getExpandedKeys(): string[] {
        const keys: string[] = [];

        const traverse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.expanded) {
                    keys.push(node.key);
                }
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        return keys;
    }

    /**
     * 设置展开的节点 key（attribute 写法为 JSON 数组）
     */
    set expandedKeys(keys: string | string[]) {
        const normalized = this.parseKeyList(keys);
        if (!this.isConnected || this._treeData.length === 0) {
            this._pendingExpandedKeys = normalized;
            return;
        }
        this.applyExpandedKeys(normalized);
        if (!this.isSyncingProps) {
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
    }

    get expandedKeys(): string[] {
        return this.getExpandedKeys();
    }

    private applyExpandedKeys(keys: string[]): void {
        const setExpanded = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                node.expanded = keys.includes(node.key);
                if (node.children) setExpanded(node.children);
            }
        };
        setExpanded(this.treeData);
        this.flattenTree();
    }

    /**
     * 获取选中的节点 key
     */
    getSelectedKeys(): string[] {
        const keys: string[] = [];

        const traverse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                if (node.selected) {
                    keys.push(node.key);
                }
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        return keys;
    }

    /**
     * 获取选中的节点
     */
    getSelectedNodes(): TreeNode[] {
        const nodes: TreeNode[] = [];

        const traverse = (treeNodes: TreeNode[]) => {
            for (const node of treeNodes) {
                if (node.selected) {
                    nodes.push(node);
                }
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        return nodes;
    }

    /**
     * 获取勾选的节点
     */
    getCheckedNodes(): TreeNode[] {
        const nodes: TreeNode[] = [];

        const traverse = (treeNodes: TreeNode[]) => {
            for (const node of treeNodes) {
                if (node.checked) {
                    nodes.push(node);
                }
                if (node.children) traverse(node.children);
            }
        };

        traverse(this.treeData);
        return nodes;
    }

    /**
     * 展开所有节点。
     * 对配置了 loadData 且尚未加载的节点会并发拉取子节点；collapseAll() 会作废未完成的加载。
     */
    public expandAll(): void {
        const token = ++this._expandAllToken;
        const pending: Promise<void>[] = [];

        const traverse = (nodes: TreeNode[], allowLoad: boolean) => {
            for (const node of nodes) {
                node.expanded = true;
                if (node.children && node.children.length > 0) {
                    traverse(node.children, allowLoad);
                    continue;
                }
                if (!allowLoad || !this.shouldLoadChildren(node)) continue;

                const key = node.key;
                this._loadedKeys.add(key);
                pending.push(
                    Promise.resolve(this.loadData ? this.loadData(node) : [])
                        .then(children => {
                            if (token !== this._expandAllToken) {
                                // 已被 collapseAll 取消：释放 key，便于下次重新加载
                                this._loadedKeys.delete(key);
                                return;
                            }
                            node.children = Array.isArray(children) ? children : [];
                            node.expanded = true;
                            // 刚返回的节点不再自动触发下一层加载，避免数据未标记叶子时递归请求
                            traverse(node.children, false);
                            this.flattenTree();
                        })
                        .catch(() => {
                            if (token !== this._expandAllToken) return;
                            node.expanded = false;
                            this._loadedKeys.delete(key);
                            this.flattenTree();
                        }),
                );
            }
        };

        traverse(this.treeData, true);
        this.flattenTree();
        this.notifyExpandAll();

        if (pending.length > 0) {
            Promise.all(pending).then(() => {
                if (token !== this._expandAllToken) return;
                this.flattenTree();
                this.notifyExpandAll();
            });
        }
    }

    /**
     * 收起所有节点。
     * 不会清除已通过 loadData 加载的子节点，也不会影响勾选状态（checkStrictly 无交互）。
     */
    public collapseAll(): void {
        this._expandAllToken++;

        const collapse = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                node.expanded = false;
                if (node.children) collapse(node.children);
            }
        };

        collapse(this.treeData);
        this.flattenTree();
        this.notifyExpandAll();
    }

    /**
     * 批量展开/收起后派发 expand + change 事件
     */
    private notifyExpandAll(): void {
        this.emit('expand', { expandedKeys: this.getExpandedKeys() } as TreeExpandEventDetail);
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 设置树形数据
     */
    public setTreeData(data: TreeNode[]): void {
        this.treeData = data;
    }

    /**
     * 获取树形数据
     */
    public getTreeData(): TreeNode[] {
        return this.treeData;
    }

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问选中节点 key
     */
    get value(): string[] {
        return this.getSelectedKeys();
    }

    set value(keys: string[]) {
        this.clearSelection();
        const setSelected = (nodes: TreeNode[], targetKeys: string[]) => {
            for (const node of nodes) {
                if (targetKeys.includes(node.key)) {
                    node.selected = true;
                }
                if (node.children) setSelected(node.children, targetKeys);
            }
        };
        setSelected(this.treeData, keys);
        this.flattenTree();

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * selectedKeys getter/setter（与 checkedKeys/expandedKeys 对称）
     */
    get selectedKeys(): string[] {
        return this.getSelectedKeys();
    }

    set selectedKeys(keys: string[]) {
        this.value = keys;
    }
}

export default SolelyTree;
export { SolelyTree };
