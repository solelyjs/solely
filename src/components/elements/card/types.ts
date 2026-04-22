/**
 * Card 组件类型定义
 */

/** 卡片尺寸 */
export type CardSize = 'default' | 'small' | 'large';

/** 卡片属性接口 */
export interface CardProps {
    /** 卡片标题 */
    title: string;
    /** 卡片尺寸 */
    size: CardSize;
    /** 是否显示边框 */
    bordered: boolean;
    /** 是否加载中 */
    loading: boolean;
    /** 是否可悬停 */
    hoverable: boolean;
    /** 封面图片 URL */
    cover: string;
    /** 底部操作区内容（JSON 数组字符串） */
    actions: string;
    /** 右上角额外操作区 */
    extra: string;
}

/** Card 组件 refs */
export interface CardRefs extends Record<string, Element> {
    card: HTMLDivElement;
}
