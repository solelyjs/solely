/**
 * Empty 组件类型定义
 */

export interface EmptyProps {
    /** 描述文字，默认值 "暂无数据" */
    description: string;
    /** 图片的 URL，为空时展示默认占位图标 */
    image: string;
    /** 是否展示默认占位图标 / 图片区域，默认 true */
    showIcon: boolean;
}
