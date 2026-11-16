/**
 * 组件尺寸的统一语义。
 *
 * 目标档位只有 small / medium / large。
 * middle 与 default 是历史兼容别名，解析时统一归一为 medium，
 * 不再作为独立档位参与样式映射。
 */
export type CanonicalSize = 'small' | 'medium' | 'large';

/** 历史兼容别名 */
export type SizeAlias = 'middle' | 'default';

/** 对外接受的尺寸输入：标准档位 + 兼容别名 */
export type SizeInput = CanonicalSize | SizeAlias;

/**
 * 将组件 size 输入归一为标准档位。
 * 别名与所有非法值都落到 medium，保证渲染与属性读回一致。
 */
export function normalizeSize(value: unknown): CanonicalSize {
    return value === 'small' || value === 'large' ? value : 'medium';
}
