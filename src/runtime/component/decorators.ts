import { buildIR, parseHtml } from "@/compiler";
import { IRRoot } from "@/types";

const MANIFEST_SYMBOL = Symbol.for("solely.manifest");

/** Prop 配置，支持类型声明 */
export type PropType = "string" | "number" | "boolean" | "object";

export interface PropDescriptor {
    name: string;       // HTML attribute 名
    type?: PropType;    // 输入转换类型
    default?: any;      // 渲染兜底值（非状态）
    reflect?: boolean;  // 是否同步回 HTML Attribute
}

/**
 * Manifest：组件声明配置
 * -------------------------------------------------------
 * 用于描述组件模板、样式、属性监听和 Shadow DOM 行为。
 */
export interface Manifest {
    template?: string | Function;                  // HTML 模板字符串
    styles?: string;                    // 组件样式（CSS 字符串）
    props?: Array<string | PropDescriptor>; // 支持字符串或对象形式
    shadowDOM?: { use: boolean; mode?: "open" | "closed" }; // 是否启用 Shadow DOM
    className?: string;                 // 组件根元素类名
    tagName: string;                    // 注册的自定义元素标签名
}

/** 框架内部使用的运行时版本 */
export interface InternalManifest extends Manifest {
    ir?: IRRoot;
    sheet?: CSSStyleSheet;
    // 预处理后的属性映射表：attr-name -> PropDescriptor
    propMap?: Map<string, PropDescriptor>;
}


export const CustomElement = (config: Manifest): ClassDecorator => {
    // 将用户配置强制断言为内部版本，方便后续挂载编译产物
    const manifest = config as InternalManifest;

    return (OriginalClass: any) => {
        const { tagName } = manifest;

        // 1. 注册检查：如果已经注册过，直接返回原类
        // 这防止了浏览器抛出 "Registration failed for type 'xxx'. A type with that name is already registered."
        if (customElements.get(tagName)) {
            if (import.meta.env.DEV) {
                console.warn(`[Solely] 标签名称 "${tagName}" 已经被注册，跳过重复定义。`);
            }
            return OriginalClass;
        }

        // 2. 预编译 IR (只在第一次注册时运行)
        if (typeof manifest.template === "string" && !manifest.ir) {
            try {
                const ast = parseHtml(manifest.template);
                manifest.ir = buildIR(ast, {
                    source: manifest.template,
                    filename: tagName,
                });
            } catch (e) {
                console.error(`[Compiler Error] <${tagName}>:`, e);
            }
        }

        // 3. 预创建 StyleSheet (只在第一次注册时运行)
        if (manifest.styles && !manifest.sheet && "CSSStyleSheet" in window) {
            try {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(manifest.styles);
                manifest.sheet = sheet;
            } catch (e) {
                console.error(`[Style Error] <${tagName}>:`, e);
            }
        }

        // 4. 预处理 Props (将 string[] 或对象混合数组 统一转为 Map)
        if (manifest.props && !manifest.propMap) {
            const map = new Map<string, PropDescriptor>();
            manifest.props.forEach(p => {
                const desc: PropDescriptor = typeof p === "string" ? { name: p } : p;
                // 转换出 HTML attribute 名 (camelCase -> kebab-case)
                const attrName = desc.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
                map.set(attrName, desc);
            });
            manifest.propMap = map;
        }

        // 5. 定义新类并注册
        class CE extends OriginalClass { }
        (CE as any)[MANIFEST_SYMBOL] = manifest;

        customElements.define(tagName, CE as CustomElementConstructor);

        return CE;
    };
};