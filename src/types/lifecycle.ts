export type LifecycleKind = 'mounted' | 'updated' | 'unmounted';

export const LIFECYCLE_ATTRS_MAP: Record<string, LifecycleKind> = {
    // 可选别名
    'onMounted': 'mounted',
    'onUpdated': 'updated',
    'onUnmounted': 'unmounted',
};

export function mapAttrKeyToLifecycleKind(key: string): LifecycleKind | null {
    return LIFECYCLE_ATTRS_MAP[key] ?? null;
}

export function isLifecycleKind(value: string): value is LifecycleKind {
    return value === 'mounted' || value === 'updated' || value === 'unmounted';
}
