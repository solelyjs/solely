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
    /** 表单重置时写回的开关状态 */
    defaultChecked: boolean;
    /** 开关尺寸 */
    size: SwitchSize;
    /** 开关颜色类型 */
    type: SwitchType;
    /** 是否禁用 */
    disabled: boolean;
    /** 是否必填 */
    required: boolean;
    /** 自定义校验消息 */
    invalidMessage: string;
    /** 加载中状态 */
    loading: boolean;
    /** 选中时的内容 */
    checkedChildren: string;
    /** 非选中时的内容 */
    unCheckedChildren: string;
    /** 表单 name 属性（不参与原生表单提交，仅用于自行收集数据） */
    name: string;
    /** 表单 value 属性 */
    value: string;
    /** 无障碍名称，默认 "开关" */
    ariaLabel: string;
}

/** Switch 组件引用接口 */
export interface SwitchRefs extends Record<string, Element> {
    switchRef: HTMLDivElement;
}
