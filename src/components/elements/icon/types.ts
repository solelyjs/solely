/**
 * Solely Icon 组件类型定义
 */

export type IconSize = 'small' | 'medium' | 'large' | number;

export type IconSpin = 'clockwise' | 'counterclockwise' | false;

export interface IconProps {
    /** 图标名称 */
    name?: string;
    /** 图标尺寸 */
    size?: IconSize;
    /** 图标颜色，支持 CSS 变量或具体颜色值 */
    color?: string;
    /** 是否旋转 */
    spin?: IconSpin;
    /** 旋转速度（秒/圈） */
    spinDuration?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** SVG Sprite 文件路径 */
    sprite?: string;
}

export interface IconRefs extends Record<string, Element> {
    svgRef: SVGSVGElement;
}
