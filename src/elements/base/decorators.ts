export interface Manifest {
    tagName: string;
    template?: string;
    className?: string;
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