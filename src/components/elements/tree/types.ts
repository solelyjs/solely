/**
 * Tree 组件类型定义
 */

export interface TreeNode {
    /** 节点唯一标识 */
    key: string;
    /** 节点标题 */
    title: string;
    /** 子节点 */
    children?: TreeNode[];
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否可选 */
    selectable?: boolean;
    /** 是否已选中（点击选择状态） */
    selected?: boolean;
    /** 是否已勾选 */
    checked?: boolean;
    /** 是否半选 */
    halfChecked?: boolean;
    /** 是否展开 */
    expanded?: boolean;
    /** 是否叶子节点 */
    isLeaf?: boolean;
    /** 自定义图标 */
    icon?: string;
}

export interface TreeProps {
    /** 树形数据，支持 JSON 字符串（如 '[{"key":"1","title":"Node 1"}]'）或节点数组 */
    treeData?: string | TreeNode[];
    /** 是否显示连接线 */
    showLine?: boolean;
    /** 是否支持多选 */
    multiple?: boolean;
    /** 是否支持勾选 */
    checkable?: boolean;
    /** 是否默认展开所有节点 */
    defaultExpandAll?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否可搜索 */
    searchable?: boolean;
    /** 搜索关键词 */
    searchValue?: string;
    /** 是否撑满父容器宽度 */
    block?: boolean;
    /** 勾选是否父子不关联（true 时勾选节点不影响子节点与父节点） */
    checkStrictly?: boolean;
    /** 默认展开的节点 key（JSON 数组或逗号分隔，如 '["1","2"]' / '1,2'） */
    defaultExpandedKeys?: string;
    /** 默认勾选的节点 key（JSON 数组或逗号分隔） */
    defaultCheckedKeys?: string;
    /** 默认选中的节点 key（JSON 数组或逗号分隔） */
    defaultSelectedKeys?: string;
    /** 当前勾选的节点 key（受控；HTML 属性写法为 JSON 数组） */
    checkedKeys?: string[];
    /** 当前展开的节点 key（受控；HTML 属性写法为 JSON 数组） */
    expandedKeys?: string[];
    /** 树的可见名称（aria-label） */
    label?: string;
}

/** select 事件 detail */
export interface TreeSelectEventDetail {
    selectedKeys: string[];
    selectedNodes: TreeNode[];
    node: TreeNode;
}

/** check 事件 detail */
export interface TreeCheckEventDetail {
    checkedKeys: string[];
    checkedNodes: TreeNode[];
    node: TreeNode;
}

/** expand 事件 detail；expandAll()/collapseAll() 时 node 缺省 */
export interface TreeExpandEventDetail {
    expandedKeys: string[];
    node?: TreeNode;
}
