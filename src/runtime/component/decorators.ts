import { buildIR, parseHtml } from '../../compiler';
import { IS_DEV } from '../../shared';
import { IRRoot } from '../../types';

const MANIFEST_SYMBOL = Symbol.for('solely.manifest');

/** Prop 配置，支持类型声明 */
export type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array';

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

    /**
     * 是否响应式同步到 $data
     * - true: 支持 :a="xx" 绑定，变化自动更新模板
     * - false: 仅作为普通 prop，不触发模板更新
     * @default true
     */
    reactive?: boolean;
}

/**
 * Model 配置：定义 s-model 双向绑定的属性名和事件名
 */
export interface ModelConfig {
    /** 要绑定的属性名，默认为 'value' */
    prop?: string;
    /** 监听的事件名，默认为 'change' */
    event?: string;
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
    /** s-model 双向绑定配置 */
    model?: ModelConfig;
}

/** 框架内部使用的运行时版本 */
export interface InternalManifest extends Manifest {
    /** 编译后的 IR */
    ir?: IRRoot;
    /** 预编译的样式表 */
    sheet?: CSSStyleSheet;
    /** 预处理后的属性映射表：attr-name -> PropDescriptor */
    attributeMap?: Map<string, PropDescriptor>;
    /** prop 原始名索引：prop name -> PropDescriptor */
    propMap?: Map<string, PropDescriptor>;
}

/**
 * 将 camelCase 转换为 kebab-case（修复连续大写字母问题）
 */
function camelToKebab(str: string): string {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

/**
 * 自定义元素装饰器 - 用于注册 Web Component
 * @param config 组件配置
 * @returns 类装饰器
 */
export const CustomElement = (config: Manifest): ClassDecorator => {
    // 将用户配置强制断言为内部版本，方便后续挂载编译产物
    const manifest = config as InternalManifest;

    // 环境检测：是否为浏览器环境且支持 Custom Elements
    const isBrowser = typeof window !== 'undefined' && typeof customElements !== 'undefined';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (OriginalClass: any) => {
        const { tagName } = manifest;

        // ---------- 修复 3：检查基类是否为 HTMLElement ----------
        if (isBrowser && !(OriginalClass.prototype instanceof HTMLElement) && OriginalClass !== HTMLElement) {
            throw new TypeError(
                `[Solely] CustomElement decorator can only be applied to classes extending HTMLElement.\n` +
                    `Received: ${OriginalClass.name || 'anonymous class'}`,
            );
        }

        // ---------- 修复 2：重复注册时仍挂载 symbol ----------
        if (isBrowser && customElements.get(tagName)) {
            if (IS_DEV) {
                console.warn(`[Solely] 标签名称 "${tagName}" 已经被注册，跳过重复定义。`);
            }
            // 即使已注册，仍需挂载 manifest 供框架内部获取元数据
            (OriginalClass as typeof OriginalClass)[MANIFEST_SYMBOL] = manifest;
            return OriginalClass;
        }

        // ---------- 修复 4：副作用仅在需要时执行（配合环境检测） ----------
        // 编译模板（在浏览器环境下提前编译，Node 环境可跳过，留给 SSR 或构建时处理）
        if (typeof manifest.template === 'string' && !manifest.ir) {
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
            if (typeof manifest.template === 'object' && manifest.template !== null) {
                const irCandidate = manifest.template as IRRoot;
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

        // 预创建 StyleSheet（仅浏览器环境）
        if (isBrowser && manifest.styles && !manifest.sheet && 'CSSStyleSheet' in window) {
            try {
                const sheet = new CSSStyleSheet();
                if (typeof sheet.replaceSync === 'function') {
                    sheet.replaceSync(manifest.styles);
                    manifest.sheet = sheet;
                }
            } catch (e) {
                if (IS_DEV) {
                    console.warn(`[Style Warning] <${tagName}>: CSSStyleSheet 不可用，将使用 style 标签回退方案`);
                }
            }
        }

        // 预处理 Props
        if (manifest.props && !manifest.attributeMap) {
            const map = new Map<string, PropDescriptor>();
            const nameIndex = new Map<string, PropDescriptor>();
            manifest.props.forEach(p => {
                const desc: PropDescriptor = typeof p === 'string' ? { name: p } : p;
                // ---------- 修复 5：使用更可靠的 camel -> kebab 转换 ----------
                const attrName = camelToKebab(desc.name);
                const propName = desc.name;
                const normalized = { ...desc, name: propName };
                map.set(attrName, normalized);
                nameIndex.set(propName, normalized);
            });
            manifest.attributeMap = map;
            manifest.propMap = nameIndex;
        }

        // 定义新类并挂载 manifest
        class CE extends OriginalClass {}
        (CE as typeof OriginalClass)[MANIFEST_SYMBOL] = manifest;

        // 注册自定义元素（仅浏览器环境）
        if (isBrowser) {
            customElements.define(tagName, CE as CustomElementConstructor);
        }

        return CE;
    };
};
