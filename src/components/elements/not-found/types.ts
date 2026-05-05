/**
 * Solely NotFound 组件类型定义
 */

/**
 * NotFound 组件属性接口
 */
export interface NotFoundProps {
    /** 主标题，默认为 404 */
    title?: string;
    /** 副标题，默认为"抱歉，您访问的页面不存在" */
    subtitle?: string;
    /** 描述文字 */
    description?: string;
    /** 返回按钮文字，默认为"返回首页" */
    backText?: string;
    /** 返回链接地址，默认为 / */
    backUrl?: string;
    /** 是否为嵌入模式（用于文档演示等场景），默认 false */
    embedded?: boolean;
}
