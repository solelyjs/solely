/**
 * Rate 组件类型定义
 */

export interface RateProps {
    /** 当前评分值 */
    value: number;
    /** 星星总数 */
    count?: number;
    /** 是否允许半选 */
    allowHalf?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否允许清除 */
    allowClear?: boolean;
    /** 自定义字符 */
    character?: string;
    /** 是否只读 */
    readonly?: boolean;
    /** 每颗星的自定义提示文案（JSON 数组或逗号分隔），缺省为「N 分」 */
    tooltips?: string;
}
