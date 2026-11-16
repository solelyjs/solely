/**
 * 浮层定位纯函数的公共类型
 *
 * 约束见 `docs/architecture/contracts.md`（浮层部分）；完整编号版见本地审计材料 `docs/internal/design-contracts.md`（不入库）。
 * 这里的类型只描述几何与计算结果，不引用 DOM 实例，保证 `position.ts` 可在任意环境运行。
 */

/** 12 个方位（`topLeft` 表示贴锚点左边，`leftTop` 表示贴锚点上边） */
export type Placement =
    | 'top'
    | 'topLeft'
    | 'topRight'
    | 'bottom'
    | 'bottomLeft'
    | 'bottomRight'
    | 'left'
    | 'leftTop'
    | 'leftBottom'
    | 'right'
    | 'rightTop'
    | 'rightBottom';

/** 定位坐标系：fixed 用视口坐标，absolute 用容器坐标 */
export type Strategy = 'fixed' | 'absolute';

/** 浮层尺寸 */
export interface Size {
    readonly width: number;
    readonly height: number;
}

/**
 * 矩形（与 DOMRect 结构兼容）
 *
 * `right` / `bottom` 可省略，缺省时由 `left + width` / `top + height` 推导，
 * 方便测试和调用方用最小数据构造。
 */
export interface RectLike {
    readonly top: number;
    readonly left: number;
    readonly width: number;
    readonly height: number;
    readonly right?: number;
    readonly bottom?: number;
}

/** 视口尺寸（fixed 为浏览器视口，absolute 为容器可视区域） */
export interface ViewportSize {
    readonly width: number;
    readonly height: number;
}

/**
 * `strategy='absolute'` 时的定位容器几何
 *
 * 纯函数不读取 DOM，容器信息必须由调用方测量后传入。
 * 字段含义与 C-OVL-03 的换算公式一致。
 */
export interface ContainerGeometry {
    /** 容器 `getBoundingClientRect()` 的结果（视口坐标） */
    readonly rect: RectLike;
    readonly scrollTop?: number;
    readonly scrollLeft?: number;
    readonly clientTop?: number;
    readonly clientLeft?: number;
}

/** `computePosition` 的输入选项 */
export interface ComputeOptions {
    /** 期望方位；`auto` 由可用空间推导 */
    readonly placement: Placement | 'auto';
    /** 视口尺寸，必须由调用方传入，纯函数不读取 `window` */
    readonly viewport: ViewportSize;
    /** 锚点与浮层间距，默认 8 */
    readonly offset?: number;
    /** 与视口边界的最小内边距，默认 8 */
    readonly boundaryPadding?: number;
    /** 主轴越界时是否尝试切到对侧，默认 true */
    readonly flip?: boolean;
    /** 交叉轴越界时是否平移回边界内，默认 true */
    readonly shift?: boolean;
    /** 默认 `fixed` */
    readonly strategy?: Strategy;
    /** `strategy='absolute'` 时的定位容器；缺省时按视口坐标返回 */
    readonly container?: ContainerGeometry;
}

/** 箭头偏移：相对浮层左上角，垂直方位用 x，水平方位用 y */
export interface ArrowPosition {
    readonly x?: number;
    readonly y?: number;
}

/**
 * 主轴 / 交叉轴溢出量（像素，恒 >= 0）
 *
 * `main` 为 flip 之后、主轴钳制之前的溢出量。调用方可据此决定是否隐藏浮层
 * （例如锚点被滚出视口）。`cross` 为 shift 之后的剩余溢出量。
 */
export interface Overflow {
    readonly main: number;
    readonly cross: number;
}

/** flip 决策记录，便于调试与调用方判断是否发生过翻转 */
export interface FlipState {
    /** 调用方原始请求（可能是 `auto`） */
    readonly requested: Placement | 'auto';
    /** 解析后的首选方位（`auto` 已按可用空间选定） */
    readonly preferred: Placement;
    /** 最终生效方位 */
    readonly final: Placement;
    /** 是否实际发生了翻转 */
    readonly flipped: boolean;
    /** 依次尝试的方位，`[preferred, opposite?]` */
    readonly tried: Placement[];
}

/** 定位结果 */
export interface PositionResult {
    /** 水平坐标（fixed 为视口坐标，absolute 为容器坐标） */
    readonly x: number;
    /** 垂直坐标（fixed 为视口坐标，absolute 为容器坐标） */
    readonly y: number;
    /** 与 y 同值；契约 C-OVL-01 使用 top/left 命名，保留别名便于迁移 */
    readonly top: number;
    /** 与 x 同值 */
    readonly left: number;
    /** 实际生效方位（翻转后） */
    readonly placement: Placement;
    /** 箭头相对浮层的偏移；未发生翻转/平移时也始终返回对象 */
    readonly arrow: ArrowPosition;
    readonly overflow: Overflow;
    readonly flipState: FlipState;
}
