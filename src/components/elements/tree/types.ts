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
    /** 树形数据（JSON字符串，如 '[{"key":"1","title":"Node 1"}]'） */
    treeData?: string;
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
}
