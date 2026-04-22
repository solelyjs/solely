/**
 * 经纬度输入框组件类型定义
 * 支持度分秒（DMS）格式输入
 */

/**
 * 坐标类型
 */
export type CoordinateType = 'latitude' | 'longitude' | 'both';

/**
 * 方向类型
 */
export type Direction = 'N' | 'S' | 'E' | 'W';

/**
 * 度分秒对象
 */
export interface DMS {
    /** 度 */
    degrees: number;
    /** 分 */
    minutes: number;
    /** 秒 */
    seconds: number;
    /** 方向（N/S/E/W） */
    direction: Direction;
}

/**
 * 经纬度坐标对象
 */
export interface Coordinate {
    /** 纬度 */
    latitude: number;
    /** 经度 */
    longitude: number;
}

/**
 * DMS 格式的经纬度
 */
export interface DMSCoordinate {
    /** 纬度 DMS */
    latitude: DMS;
    /** 经度 DMS */
    longitude: DMS;
}

/**
 * 坐标输入框组件属性接口
 */
export interface CoordinateInputProps {
    /** 坐标类型：latitude（纬度）、longitude（经度）、both（两者） */
    type?: CoordinateType;
    /** 纬度值（十进制） */
    latitude?: number;
    /** 经度值（十进制） */
    longitude?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否只读 */
    readonly?: boolean;
    /** 占位符 */
    placeholder?: string;
    /** 尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 是否显示方向选择 */
    showDirection?: boolean;
    /**
     * 精度（小数位数）
     * 控制秒输入的小数位数，也影响自动跳转行为
     * 默认3位小数
     */
    precision?: number;
    /** 是否显示十进制值 */
    showDecimal?: boolean;
    /** 是否自动跳转到下一个输入框 */
    autoTab?: boolean;
    /** 纬度方向下拉框是否打开 */
    latitudeDirectionOpen?: boolean;
    /** 经度方向下拉框是否打开 */
    longitudeDirectionOpen?: boolean;
    /** 是否块级显示 */
    block?: boolean;
}

/**
 * 坐标输入框组件 Refs 接口
 */
export interface CoordinateInputRefs extends Record<string, Element> {
    /** 纬度度输入框 */
    latitudeDegreesInput: HTMLInputElement;
    /** 纬度分输入框 */
    latitudeMinutesInput: HTMLInputElement;
    /** 纬度秒输入框 */
    latitudeSecondsInput: HTMLInputElement;
    /** 纬度方向选择 */
    latitudeDirectionSelect: HTMLSelectElement;
    /** 经度度输入框 */
    longitudeDegreesInput: HTMLInputElement;
    /** 经度分输入框 */
    longitudeMinutesInput: HTMLInputElement;
    /** 经度秒输入框 */
    longitudeSecondsInput: HTMLInputElement;
    /** 经度方向选择 */
    longitudeDirectionSelect: HTMLSelectElement;
}

/**
 * 输入事件数据
 */
export interface CoordinateInputEvent {
    /** 坐标类型 */
    type: 'latitude' | 'longitude';
    /** DMS 值 */
    dms: DMS;
    /** 十进制值 */
    decimal: number;
}
