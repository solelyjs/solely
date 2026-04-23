/**
 * Solely Tree 组件
 * 树形控件，用于展示层级结构数据
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TreeProps, TreeNode } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';
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
    treeData: TreeNode[] = [];

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
     */
    getSwitcherClasses(node: TreeNode): Record<string, boolean> {
        return {
            'tree__switcher--expanded': !!node.expanded,
            'tree__switcher--leaf': !node.children || node.children.length === 0,
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
        this.parseTreeData();
    }

    /**
     * 解析树形数据
     */
    parseTreeData(): void {
        this.treeData = safeJsonParse(this.$data.treeData, []);
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
                const isExpanded = this.$data.defaultExpandAll || node.expanded;
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
     * 切换展开/折叠
     */
    handleToggle(node: TreeNode & { level: number }, event: MouseEvent): void {
        event.stopPropagation();

        if (this.$data.disabled) return;

        const originalNode = this.findNode(this.treeData, node.key);
        if (originalNode) {
            originalNode.expanded = !originalNode.expanded;
            this.flattenTree();

            // 派发 expand 自定义事件
            this.emit('expand', {
                expandedKeys: this.getExpandedKeys(),
                node: originalNode,
            });

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
     * 节点点击
     */
    handleNodeClick(node: TreeNode & { level: number }): void {
        if (this.$data.disabled || node.disabled) return;

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
            });

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
    handleCheck(node: TreeNode & { level: number }, event: MouseEvent): void {
        event.stopPropagation();

        if (this.$data.disabled || node.disabled) return;

        const originalNode = this.findNode(this.treeData, node.key);
        if (originalNode) {
            const newChecked = !originalNode.checked;
            this.updateNodeCheckState(originalNode, newChecked);
            this.flattenTree();

            // 派发 check 自定义事件
            this.emit('check', {
                checkedKeys: this.getCheckedKeys(),
                checkedNodes: this.getCheckedNodes(),
                node: originalNode,
            });

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
     * 更新节点勾选状态（包括子节点）
     */
    updateNodeCheckState(node: TreeNode, checked: boolean): void {
        node.checked = checked;
        node.halfChecked = false;

        // 更新子节点
        if (node.children) {
            for (const child of node.children) {
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
                    // 找到父节点
                    const allChecked = node.children.every(child => child.checked);
                    const someChecked = node.children.some(child => child.checked || child.halfChecked);

                    node.checked = allChecked;
                    node.halfChecked = !allChecked && someChecked;
                    return true;
                }

                if (this.updateParentCheckState(node.children, targetNode)) {
                    // 递归更新上层父节点
                    const allChecked = node.children.every(child => child.checked);
                    const someChecked = node.children.some(child => child.checked || child.halfChecked);

                    node.checked = allChecked;
                    node.halfChecked = !allChecked && someChecked;
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
     */
    set checkedKeys(keys: string[]) {
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
        this.flattenTree();

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
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
     * 设置展开的节点 key
     */
    set expandedKeys(keys: string[]) {
        const setExpanded = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                node.expanded = keys.includes(node.key);
                if (node.children) setExpanded(node.children);
            }
        };
        setExpanded(this.treeData);
        this.flattenTree();

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
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
     * 设置树形数据
     */
    public setTreeData(data: TreeNode[]): void {
        this.treeData = data;
        this.$data.treeData = JSON.stringify(data);
        this.flattenTree();
    }

    /**
     * 获取树形数据
     */
    public getTreeData(): TreeNode[] {
        return this.treeData;
    }
}

export default SolelyTree;
export { SolelyTree };
