/**
 * Switch 组件类型定义
 */

/** 开关尺寸类型 */
export type SwitchSize = 'small' | 'medium' | 'large';

/** 开关颜色类型 */
export type SwitchType = 'primary' | 'success' | 'warning' | 'error';

/** Switch 组件属性接口 */
export interface SwitchProps {
    /** 开关状态 */
    checked: boolean;
    /** 开关尺寸 */
    size: SwitchSize;
    /** 开关颜色类型 */
    type: SwitchType;
    /** 是否禁用 */
    disabled: boolean;
    /** 加载中状态 */
    loading: boolean;
    /** 选中时的内容 */
    checkedChildren: string;
    /** 非选中时的内容 */
    unCheckedChildren: string;
}

/** Switch 组件引用接口 */
export interface SwitchRefs extends Record<string, Element> {
    switchRef: HTMLDivElement;
}
