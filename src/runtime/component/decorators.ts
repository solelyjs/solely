const MANIFEST_SYMBOL = Symbol.for("solely.manifest");

/** Prop 配置，支持类型声明 */
export type PropType = "string" | "number" | "boolean" | "object";

export interface PropDescriptor {
    name: string;       // HTML attribute 名
    type?: PropType;    // 输入转换类型
    default?: any;      // 渲染兜底值（非状态）
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


export const CustomElement = (manifest: Manifest): ClassDecorator => {
    return (OriginalClass: any) => {
        // 防止重复注册同一个 tagName
        if (customElements.get(manifest.tagName)) {
            console.warn(`标签名称 "${manifest.tagName}" 已经被注册`);
            return OriginalClass;
        }

        // 动态生成一个新的类，继承原类
        class CE extends OriginalClass { }

        // 给类静态属性赋值
        (CE as any)[MANIFEST_SYMBOL] = manifest;

        // 注册自定义元素
        customElements.define(manifest.tagName, CE as CustomElementConstructor);

        return CE;
    };
};