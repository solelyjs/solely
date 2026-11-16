/**
 * 布尔 attribute 统一解析。
 *
 * 与 framework property 路径（normalizePropValue）保持一致的语义：
 * - `"false"` / `"0"`（trim、大小写不敏感）→ false
 * - `""`（仅属性名）及其他字符串 → true
 * - 属性不存在（null / undefined）→ fallback（通常是 manifest 默认值）
 */
export function parseBooleanAttribute(value: string | null | undefined, fallback = false): boolean {
    if (value === null || value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    return !(normalized === 'false' || normalized === '0');
}
