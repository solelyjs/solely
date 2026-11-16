/**
 * 组件清单工具：从导出类反查 manifest，供表驱动的契约矩阵遍历所有组件。
 */
import type { InternalManifest, PropDescriptor, PropType } from '../../src/runtime/component/decorators';
import { camelToKebab } from '../../src/shared';
import * as elementExports from '../../src/components/elements';

/** 与 decorators.ts 中保持一致 */
export const MANIFEST_SYMBOL = Symbol.for('solely.manifest');

export interface PropEntry {
    /** 驼峰 property 名 */
    name: string;
    /** kebab-case attribute 名 */
    attr: string;
    type: PropType;
    default?: unknown;
    reflect?: boolean;
    reactive?: boolean;
}

export interface ComponentEntry {
    /** 导出名（SolelyButton 等） */
    exportName: string;
    /** 自定义元素标签名 */
    tagName: string;
    /** 带 manifest 的构造函数 */
    ctor: CustomElementConstructor;
    manifest: InternalManifest;
    props: PropEntry[];
}

/** 读取构造函数上挂载的 manifest（由 @CustomElement 装饰器写入） */
export function getManifest(ctor: unknown): InternalManifest | undefined {
    return (ctor as Record<symbol, InternalManifest | undefined> | undefined)?.[MANIFEST_SYMBOL];
}

/** 从 manifest 还原 prop 列表（优先使用装饰器预处理后的 attributeMap） */
export function getProps(manifest: InternalManifest): PropEntry[] {
    if (manifest.attributeMap) {
        return Array.from(manifest.attributeMap.entries()).map(([attr, desc]) => toPropEntry(attr, desc));
    }

    return (manifest.props ?? []).map(p => {
        const desc = typeof p === 'string' ? ({ name: p } as PropDescriptor) : p;
        return toPropEntry(camelToKebab(desc.name), desc);
    });
}

function toPropEntry(attr: string, desc: PropDescriptor): PropEntry {
    return {
        name: desc.name,
        attr,
        type: desc.type ?? 'string',
        default: desc.default,
        reflect: desc.reflect,
        reactive: desc.reactive,
    };
}

/** 全部元素组件（按导出顺序），用于跨组件契约矩阵 */
export function listElementsComponents(): ComponentEntry[] {
    const entries: ComponentEntry[] = [];

    for (const [exportName, value] of Object.entries(elementExports)) {
        if (typeof value !== 'function') continue;
        const manifest = getManifest(value);
        if (!manifest?.tagName) continue;

        entries.push({
            exportName,
            tagName: manifest.tagName,
            ctor: value as unknown as CustomElementConstructor,
            manifest,
            props: getProps(manifest),
        });
    }

    return entries;
}
