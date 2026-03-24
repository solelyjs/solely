/** 生命周期类型 */
export type LifecycleKind = 'mounted' | 'updated' | 'unmounted';

/** 生命周期属性映射表 */
export const LIFECYCLE_ATTRS_MAP: Record<string, LifecycleKind> = {
    // 可选别名
    'onMounted': 'mounted',
    'onUpdated': 'updated',
    'onUnmounted': 'unmounted',
};

/**
 * 将属性键映射到生命周期类型
 * @param key 属性键
 * @returns 生命周期类型或 null
 */
export function mapAttrKeyToLifecycleKind(key: string): LifecycleKind | null {
    return LIFECYCLE_ATTRS_MAP[key] ?? null;
}

/**
 * 检查值是否为有效的生命周期类型
 * @param value 要检查的值
 * @returns 是否为有效的生命周期类型
 */
export function isLifecycleKind(value: string): value is LifecycleKind {
    return value === 'mounted' || value === 'updated' || value === 'unmounted';
}
