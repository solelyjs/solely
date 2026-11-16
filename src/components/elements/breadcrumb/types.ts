/**
 * Breadcrumb 组件类型定义
 */

export interface BreadcrumbItem {
    /** 显示标题 */
    title: string;
    /** 跳转链接 */
    href?: string;
}

export interface BreadcrumbProps {
    /** 路由栈信息 */
    items: BreadcrumbItem[];
    /** 分隔符 */
    separator: string;
    /** 导航地标的可访问名称（aria-label） */
    label: string;
}
