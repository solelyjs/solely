import { buildIR, parseHtml } from '../../compiler';
import { IS_DEV } from '../../shared';
import { IRRoot } from '../../types';

const MANIFEST_SYMBOL = Symbol.for('solely.manifest');

/** Prop 配置，支持类型声明 */
export type PropType = 'string' | 'number' | 'boolean' | 'object';

/** 属性描述符 */
export interface PropDescriptor {
    /** HTML attribute 名 */
    name: string;
    /** 输入转换类型 */
    type?: PropType;
    /** 渲染兜底值（非状态） */
    default?: unknown;
    /** 是否同步回 HTML Attribute */
    reflect?: boolean;
}

/**
 * Manifest：组件声明配置
 * -------------------------------------------------------
 * 用于描述组件模板、样式、属性监听和 Shadow DOM 行为。
 */
export interface Manifest {
    /** HTML 模板字符串 */
    template?: string | IRRoot;
    /** 组件样式（CSS 字符串） */
    styles?: string;
    /** 支持字符串或对象形式 */
    props?: Array<string | PropDescriptor>;
    /** 是否启用 Shadow DOM */
    shadowDOM?: { use: boolean; mode?: 'open' | 'closed' };
    /** 组件根元素类名 */
    className?: string;
    /** 注册的自定义元素标签名 */
    tagName: string;
}

/** 框架内部使用的运行时版本 */
export interface InternalManifest extends Manifest {
    /** 编译后的 IR */
    ir?: IRRoot;
    /** 预编译的样式表 */
    sheet?: CSSStyleSheet;
    /** 预处理后的属性映射表：attr-name -> PropDescriptor */
    propMap?: Map<string, PropDescriptor>;
}

/**
 * 自定义元素装饰器 - 用于注册 Web Component
 * @param config 组件配置
 * @returns 类装饰器
 */
export const CustomElement = (config: Manifest): ClassDecorator => {
    // 将用户配置强制断言为内部版本，方便后续挂载编译产物
    const manifest = config as InternalManifest;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (OriginalClass: any) => {
        const { tagName } = manifest;

        // 1. 注册检查：如果已经注册过，直接返回原类
        // 这防止了浏览器抛出 "Registration failed for type 'xxx'. A type with that name is already registered."
        if (customElements.get(tagName)) {
            if (IS_DEV) {
                console.warn(`[Solely] 标签名称 "${tagName}" 已经被注册，跳过重复定义。`);
            }
            return OriginalClass;
        }

        // 2. 预编译 IR (只在第一次注册时运行)
        if (typeof manifest.template === 'string' && !manifest.ir) {
            // 检查空模板
            if (!manifest.template.trim()) {
                if (IS_DEV) {
                    console.warn(`[Solely] <${tagName}>: 模板为空字符串`);
                }
            } else {
                try {
                    const ast = parseHtml(manifest.template);
                    manifest.ir = buildIR(ast, {
                        source: manifest.template,
                        filename: tagName,
                    });
                } catch (e) {
                    const error = e instanceof Error ? e : new Error(String(e));
                    console.error(
                        `[Compiler Error] <${tagName}>: 模板编译失败\n` +
                            `错误: ${error.message}\n` +
                            `模板长度: ${manifest.template.length} 字符`,
                        IS_DEV ? error.stack : '',
                    );
                }
            }
        } else if (manifest.template && !manifest.ir) {
            // 如果用户直接提供了 IR 对象（跳过编译），这里进行简单验证
            if (typeof manifest.template === 'object' && manifest.template !== null) {
                const irCandidate = manifest.template as IRRoot;

                // 验证 IR 对象的结构
                if (irCandidate.t === 'root' && Array.isArray(irCandidate.fns) && Array.isArray(irCandidate.n)) {
                    manifest.ir = irCandidate;

                    if (IS_DEV) {
                        console.info(
                            `[Solely] Using precompiled IR for <${tagName}> | ` +
                                `Nodes: ${irCandidate.n.length} | Fns: ${irCandidate.fns.length}`,
                        );
                    }
                } else {
                    console.error(
                        `[Manifest Error] <${tagName}>: 提供的 template 不是有效的 IRRoot 对象。\n` +
                            `期望: { t: "root", fns: [], n: [] }\n` +
                            `实际: ${JSON.stringify(Object.keys(irCandidate))}`,
                    );
                }
            } else {
                console.error(
                    `[Manifest Error] <${tagName}>: template 类型无效。\n` +
                        `期望: string 或 IRRoot 对象\n` +
                        `实际: ${typeof manifest.template}`,
                );
            }
        }

        // 3. 预创建 StyleSheet (只在第一次注册时运行)
        if (manifest.styles && !manifest.sheet && 'CSSStyleSheet' in window) {
            try {
                const sheet = new CSSStyleSheet();
                // 检查 replaceSync 方法是否存在（某些测试环境可能不完整）
                if (typeof sheet.replaceSync === 'function') {
                    sheet.replaceSync(manifest.styles);
                    manifest.sheet = sheet;
                }
            } catch (e) {
                // 静默失败，让运行时回退到 style 标签方案
                if (IS_DEV) {
                    console.warn(`[Style Warning] <${tagName}>: CSSStyleSheet 不可用，将使用 style 标签回退方案`);
                }
            }
        }

        // 4. 预处理 Props (将 string[] 或对象混合数组 统一转为 Map)
        if (manifest.props && !manifest.propMap) {
            const map = new Map<string, PropDescriptor>();
            manifest.props.forEach(p => {
                const desc: PropDescriptor = typeof p === 'string' ? { name: p } : p;
                // 转换出 HTML attribute 名 (camelCase -> kebab-case)
                const attrName = desc.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                // 同时确保 desc.name 是 camelCase（用于 $data 属性访问）
                const propName = attrName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                map.set(attrName, { ...desc, name: propName });
            });
            manifest.propMap = map;
        }

        // 5. 定义新类并注册
        class CE extends OriginalClass {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (CE as any)[MANIFEST_SYMBOL] = manifest;

        customElements.define(tagName, CE as CustomElementConstructor);

        return CE;
    };
};
