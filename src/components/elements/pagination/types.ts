/**
 * Pagination 组件类型定义
 */

export type PaginationSize = 'small' | 'default' | 'large';

export interface PaginationProps {
    /** 当前页码 */
    current: number;
    /** 数据总数 */
    total: number;
    /** 每页条数 */
    pageSize: number;
    /** 组件尺寸 */
    size: PaginationSize;
    /** 是否显示较少页面内容 */
    simple: boolean;
    /** 是否显示快速跳转 */
    showQuickJumper: boolean;
    /** 是否显示用于改变页数 */
    showSizeChanger: boolean;
    /** 指定每页可以显示多少条 */
    pageSizeOptions: string;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否显示总数据 */
    showTotal: boolean;
    /** 快速跳转输入值 */
    jumperValue?: string;
}
