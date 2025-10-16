/** Prop 配置，支持类型声明 */
export interface PropOption {
    name: string;                      // 属性名，对应 HTML attribute
    type?: 'string' | 'number' | 'boolean' | 'object'; // 可选类型
}
/**
 * Manifest：组件声明配置
 * -------------------------------------------------------
 * 用于描述组件模板、样式、属性监听和 Shadow DOM 行为。
 */
export interface Manifest {
    template?: string;                  // HTML 模板字符串
    styles?: string;                    // 组件样式（CSS 字符串）
    props?: Array<string | PropOption>; // 支持字符串或对象形式
    shadowDOM?: { use: boolean; mode?: "open" | "closed" }; // 是否启用 Shadow DOM
    className?: string;                 // 组件根元素类名
    tagName: string;                    // 注册的自定义元素标签名
}


export const CustomElement = (manifest: Manifest): ClassDecorator => {
    return (target: any) => {
        // 防止重复定义
        if (customElements.get(manifest.tagName)) {
            console.warn(`标签名称 "${manifest.tagName}" 已经被注册`);
            return;
        }
        target.prototype._manifest = getManifest(manifest);
        // 创建标签
        customElements.define(manifest.tagName, target as CustomElementConstructor);
        return target as any;
    };
}

const getManifest = (manifest: Manifest): Manifest => {
    // 合成manifest，添加默认参数
    manifest = Object.assign({
        hasConfig: false
    }, manifest);

    return manifest;
}