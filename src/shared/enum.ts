/**
 * 枚举属性白名单
 *
 * 命令式与声明式 API 都可能收到运行时动态值（含非法值），
 * 组件在读取枚举类属性时必须先经过这里回退到默认档位，
 * 避免拼出无 CSS 的死类名、空模板或异常分支。
 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** 浮层 12 方位白名单，供命令式组件复用（与 shared/floating/types 的 Placement 一致） */
export const PLACEMENTS = [
    'top',
    'bottom',
    'left',
    'right',
    'topLeft',
    'topRight',
    'bottomLeft',
    'bottomRight',
    'leftTop',
    'leftBottom',
    'rightTop',
    'rightBottom',
] as const;
