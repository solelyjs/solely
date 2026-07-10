import { camelToKebab, IS_DEV, isObject, SOLELY_VERSION } from '../../shared';
import { InternalManifest, Manifest, PropDescriptor, PropType } from './decorators';
import { createRender, IRRenderInstance } from '../renderer';
import { observe } from '../reactivity';
import { ChangeItem } from '../reactivity/observe';
import { IRRoot } from '@/types';

const MANIFEST_SYMBOL: unique symbol = Symbol.for('solely.manifest');

/* -------------------- 类型定义 -------------------- */
declare interface BaseElement<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TData extends object = Record<string, unknown>,
    TRefs extends Record<string, Element> = Record<string, Element>,
> {
    /**
     * 通过 ref 属性获取的 DOM 元素引用集合
     * - 键：模板中写的 ref="xxx" 的名字
     * - 值：对应的 DOM 元素（通常是 HTMLElement 或 SVGElement）
     */
    $refs: TRefs;
}

type DataRecord = Record<string, unknown>;

interface ManifestConstructor {
    [MANIFEST_SYMBOL]?: Manifest;
}

/* -------------------- 实现 -------------------- */
class BaseElement<
    TData extends object = Record<string, unknown>,
    TRefs extends Record<string, Element> = Record<string, Element>,
>
    extends HTMLElement
    implements BaseElement<TData, TRefs>
{
    $refs: TRefs = {} as TRefs;
    #manifest: Manifest;
    #render?: IRRenderInstance;
    #ir!: IRRoot;
    #data!: TData;
    #root!: Element | ShadowRoot;
    #dispose?: () => void;

    #isRefreshing = false;
    #updateScheduled = false;
    #isAttributeUpdate = false;

    #createdCalled = false;
    #isActive = false;
    #needsRefresh = false;
    #propsInstalled = false;

    // reflect ↔ attributeChangedCallback 循环保护
    #reflectingAttrs = new Set<string>();

    // dispose 后禁止 reconnect
    #disposed = false;

    // 样式注入标记（防止 connect → disconnect → dispose 重复释放）
    #styleAttached = false;

    // 非 Shadow DOM 样式引用计数（用于组件卸载时清理）
    static #styleRefCount = new Map<string, number>();

    // 内部字段白名单（单例，避免每次 upgradeReactiveProperties 重建）
    static readonly #internalFields = new Set([
        '$data',
        '$refs',
        'constructor',
        'created',
        'mounted',
        'beforeUpdate',
        'updated',
        'unmounted',
        'attributeChanged',
        'beforeAttributesUpdate',
        'afterAttributesUpdate',
        'emit',
        'emitNative',
        'refresh',
        'dispose',
        'warn',
        'error',
    ]);

    /* -------------------- observedAttributes -------------------- */
    static get observedAttributes(): string[] {
        const manifest = (this as typeof BaseElement & ManifestConstructor)[MANIFEST_SYMBOL] as InternalManifest;
        if (!manifest?.attributeMap) return [];

        // 直接从预处理好的 Map 中获取所有 kebab-case 的键
        return Array.from(manifest.attributeMap.keys());
    }

    /* -------------------- 构造 -------------------- */
    constructor(initialData: TData = {} as TData) {
        super();

        const ctor = this.constructor as typeof BaseElement & ManifestConstructor;

        this.#manifest = ctor[MANIFEST_SYMBOL] || { tagName: 'base-element' };
        const manifest = this.#manifest;

        this.#root = manifest.shadowDOM?.use ? this.attachShadow({ mode: manifest.shadowDOM.mode || 'open' }) : this;

        this.#initData(initialData);
        this.#initTemplate(manifest);

        queueMicrotask(() => this.#callCreatedOnce());
    }

    // 升级属性（Upgrade Property）, 保障在元素被定义前设置的属性能正确触发响应式更新
    #upgradeReactiveProperties() {
        const ownKeys = Object.getOwnPropertyNames(this);

        const internalPrefixes = ['#', '_'];
        const internalFields = BaseElement.#internalFields;

        const setterMap = new Map<string, PropertyDescriptor>();
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== HTMLElement.prototype) {
            const descriptors = Object.getOwnPropertyDescriptors(proto);
            for (const [key, desc] of Object.entries(descriptors)) {
                if (desc.set && !setterMap.has(key)) {
                    setterMap.set(key, desc);
                }
            }
            proto = Object.getPrototypeOf(proto);
        }

        for (const key of ownKeys) {
            if (internalFields.has(key)) continue;
            if (internalPrefixes.some(p => key.startsWith(p))) continue;

            const desc = Object.getOwnPropertyDescriptor(this, key);
            if (!desc || !('value' in desc)) continue;

            const value = desc.value;
            const setterDesc = setterMap.get(key);

            if (setterDesc?.set) {
                delete this[key as keyof this];
                (this as DataRecord)[key] = value;
            }
        }
    }

    /* -------------------- 初始化 -------------------- */
    #initData(data: TData) {
        const { proxy, dispose } = observe(data, (change: ChangeItem) => {
            // 1. 使用类型守卫：只处理属性赋值操作
            if (change.type === 'set') {
                const { key, newValue } = change;

                const manifest = this.#manifest as InternalManifest;
                // 这里的 key 是 PathKey，如果是顶层属性同步，它通常是 string
                const propKey = String(key);

                const desc = manifest.propMap?.get(propKey);

                if (desc?.reflect) {
                    this.#reflectToAttribute(desc, newValue);
                }
            }

            this.emit('dataChange', {
                ...change,
            });

            this.#scheduleRefresh();
        });

        this.#data = proxy as TData;
        this.#dispose = dispose;
    }

    #reflectToAttribute(desc: PropDescriptor, value: unknown) {
        const attrName = camelToKebab(desc.name);

        this.#reflectingAttrs.add(attrName);
        try {
            // null/undefined → 移除属性
            if (value == null) {
                this.removeAttribute(attrName);
                return;
            }
            if (desc.type === 'boolean') {
                if (value) {
                    this.setAttribute(attrName, '');
                } else {
                    this.removeAttribute(attrName);
                }
            } else {
                // 对象类型转 JSON，其他转字符串
                const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                this.setAttribute(attrName, strValue);
            }
        } finally {
            this.#reflectingAttrs.delete(attrName);
        }
    }

    #initTemplate(manifest: InternalManifest) {
        // 直接读取装饰器预处理好的 ir
        if (manifest.ir) {
            this.#ir = manifest.ir;
        }
    }

    #installReactiveProps() {
        const manifest = this.#manifest as InternalManifest;
        if (!manifest.attributeMap) return;

        for (const [, desc] of manifest.attributeMap) {
            // 跳过非响应式
            if (desc.reactive === false) continue;

            // 沿原型链向上查找用户自定义的 getter/setter，支持继承链
            let protoDesc: PropertyDescriptor | undefined;
            let proto = Object.getPrototypeOf(this);
            while (proto && proto !== HTMLElement.prototype) {
                protoDesc = Object.getOwnPropertyDescriptor(proto, desc.name);
                if (protoDesc) break;
                proto = Object.getPrototypeOf(proto);
            }

            if (protoDesc?.get || protoDesc?.set) {
                continue;
            } else {
                // 在覆盖前，先取出实例上可能存在的自有数据属性值
                const instanceDesc = Object.getOwnPropertyDescriptor(this, desc.name);
                if (instanceDesc && 'value' in instanceDesc) {
                    // 预先赋的值直接同步到 $data
                    (this.$data as DataRecord)[desc.name] = instanceDesc.value;
                    delete this[desc.name as keyof this];
                }

                // 无用户自定义：生成标准 getter/setter
                Object.defineProperty(this, desc.name, {
                    get: () => (this.$data as DataRecord)[desc.name],
                    set: val => {
                        (this.$data as DataRecord)[desc.name] = val;
                    },
                    configurable: true,
                    enumerable: true,
                });
            }
        }
    }

    #installReactivePropsOnce() {
        if (this.#propsInstalled) return;
        this.#propsInstalled = true;
        this.#installReactiveProps();
    }

    /* -------------------- $data -------------------- */
    get $data(): TData {
        return this.#data;
    }

    set $data(value: TData) {
        if (!isObject(value)) value = {} as TData;
        if ((value as unknown) === (this.#data as unknown)) return; // 引用相同则跳过

        this.#dispose?.();
        this.#initData(value);
        this.#installReactivePropsOnce();
        this.#scheduleRefresh();
    }

    #convertAttrValue(value: string | null, defaultValue: unknown, type?: PropType) {
        if (value === null) {
            // 对于布尔值，属性不存在即为 false（HTML 标准语义）
            // 对于其他类型，保持当前值（defaultValue）
            return type === 'boolean' ? false : defaultValue;
        }

        switch (type) {
            case 'boolean':
                // 只要属性存在（value 不为 null），在 HTML 语义下就是 true
                // 这里的 value 可能是 "" (例如 <my-el active>) 或 "active"
                return true;

            case 'number': {
                const n = Number(value);
                return isNaN(n) ? defaultValue : n;
            }

            case 'object':
                try {
                    return JSON.parse(value);
                } catch (e) {
                    console.error(`[Solely] Failed to parse object value: "${value}", using default value.`, e);
                    return defaultValue;
                }

            case 'array':
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : defaultValue;
                } catch (e) {
                    console.error(`[Solely] Failed to parse array value: "${value}", using default value.`, e);
                    return defaultValue;
                }

            default:
                return value;
        }
    }

    /* -------------------- 刷新调度 -------------------- */
    #scheduleRefresh() {
        if (this.#disposed) return;
        if (!this.#isActive) {
            // 元素未连接，不刷新
            this.#needsRefresh = true; // defer refresh
            return;
        }
        if (this.#updateScheduled || !this.#render) return;

        this.#updateScheduled = true;

        queueMicrotask(() => {
            if (this.#disposed) return;
            this.#updateScheduled = false;
            this.#doRefresh();
        });
    }

    #doRefresh() {
        if (this.#disposed || this.#isRefreshing || !this.#isActive) return;

        this.#isRefreshing = true;

        try {
            if (this.#isAttributeUpdate) this.beforeAttributesUpdate();
            this.beforeUpdate();
            this.#render?.update();
            this.updated();
            if (this.#isAttributeUpdate) {
                this.afterAttributesUpdate();
                this.#isAttributeUpdate = false;
            }
        } finally {
            this.#isRefreshing = false;
        }
    }

    public refresh(): void {
        this.#scheduleRefresh();
    }

    #injectStyles() {
        const manifest = this.#manifest as InternalManifest;
        if (!manifest.styles) return;

        const root = this.#root;

        // 场景 A: 存在预生成的 sheet 且使用 Shadow DOM
        if (manifest.sheet && root instanceof ShadowRoot && 'adoptedStyleSheets' in root) {
            // 避免重复添加
            if (!root.adoptedStyleSheets.includes(manifest.sheet)) {
                const sheets = Array.from(root.adoptedStyleSheets);
                sheets.push(manifest.sheet);
                root.adoptedStyleSheets = sheets;
            }
            this.#styleAttached = true;
            return;
        }

        // 场景 B: 回退方案 (无 Shadow DOM 或 不支持 adoptedStyleSheets)
        const target = root instanceof ShadowRoot ? root : document.head;
        const styleId = `solely-style-${SOLELY_VERSION}-${manifest.tagName}`;
        const isNonSD = !manifest.shadowDOM?.use;

        // 注意：styleId 含版本号中的 "."，不能直接用于 querySelector，需转义
        const escapedId =
            typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(styleId) : styleId.replace(/([.#:[\]()!])/g, '\\$1');
        if (!target.querySelector(`#${escapedId}`)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = manifest.styles;
            target.appendChild(styleEl);
        }

        // 非 Shadow DOM 模式：增加引用计数
        if (isNonSD) {
            const count = BaseElement.#styleRefCount.get(styleId) || 0;
            BaseElement.#styleRefCount.set(styleId, count + 1);
            this.#styleAttached = true;
        }
    }

    #cleanupStyles() {
        if (!this.#styleAttached) return;
        this.#styleAttached = false;

        const manifest = this.#manifest as InternalManifest;
        if (!manifest.shadowDOM?.use && manifest.styles) {
            const styleId = `solely-style-${SOLELY_VERSION}-${manifest.tagName}`;
            const count = BaseElement.#styleRefCount.get(styleId) || 0;
            if (count <= 1) {
                const escapedId =
                    typeof CSS !== 'undefined' && CSS.escape
                        ? CSS.escape(styleId)
                        : styleId.replace(/([.#:[\]()!])/g, '\\$1');
                document.head.querySelector(`#${escapedId}`)?.remove();
                BaseElement.#styleRefCount.delete(styleId);
            } else {
                BaseElement.#styleRefCount.set(styleId, count - 1);
            }
        }
    }

    /* -------------------- 生命周期 -------------------- */
    connectedCallback(): void {
        if (this.#disposed) {
            this.remove();
            throw new Error(`[Solely] <${this.tagName.toLowerCase()}> has been disposed and cannot be reconnected.`);
        }
        this.#isActive = true;

        const manifest = this.#manifest as InternalManifest;

        this.#callCreatedOnce();

        const className = manifest.className || manifest.tagName || '';
        className.split(' ').forEach(n => n && this.classList.add(n));

        /* ---------- style ---------- */
        this.#injectStyles();

        /* ---------- attribute → state ---------- */

        if (manifest.attributeMap && isObject(this.$data)) {
            // 安装响应式属性访问器（如果用户没有自定义 getter/setter）
            this.#installReactivePropsOnce();

            // 遍历预设好的属性映射
            for (const [attrName, desc] of manifest.attributeMap) {
                const propName = desc.name; // 对应的驼峰或原始变量名

                if (this.hasAttribute(attrName)) {
                    const raw = this.getAttribute(attrName);
                    const value = this.#convertAttrValue(raw, desc.default, desc.type);
                    (this.$data as DataRecord)[propName] = value;
                } else if ('default' in desc) {
                    // 只有在 property 没有被设置过（比如通过 s-model）的情况下才使用默认值
                    // 检查 $data 中是否已经有值（非 undefined），有则保留，无则使用默认值
                    const currentValue = (this.$data as DataRecord)[propName];
                    if (currentValue === undefined) {
                        (this.$data as DataRecord)[propName] = desc.default;
                        // 对于布尔类型，如果默认值是 true，同步设置到 HTML 属性
                        if (desc.type === 'boolean' && desc.default === true) {
                            this.setAttribute(attrName, '');
                        }
                    }
                }
            }
        }

        // 自动升级所有响应式属性（不需要手动声明 upgradeProps）
        this.#upgradeReactiveProperties();

        if (this.#ir && !this.#render) this.#render = createRender(this.#ir, this.#root as HTMLElement, this);

        // 重新挂载强制刷新一次
        if (this.#needsRefresh) {
            this.#needsRefresh = false;
            this.#scheduleRefresh();
        }

        this.mounted();
    }

    disconnectedCallback(): void {
        this.#isActive = false;

        if (!this.#disposed) {
            this.#cleanupStyles();
        }

        this.unmounted();
    }
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (this.#disposed || oldValue === newValue || !isObject(this.$data)) return;
        if (this.#reflectingAttrs.has(name)) return;

        const manifest = this.#manifest as InternalManifest;
        // 1. 直接从 Map 拿到描述符，无需正则转换
        const desc = manifest.attributeMap?.get(name);
        if (!desc) return;

        const propName = desc.name;
        const oldDataValue = (this.$data as DataRecord)[propName];

        // 2. 转换值
        const next = this.#convertAttrValue(newValue, desc.default ?? oldDataValue, desc.type);

        // 3. 避免 primitive 类型的无意义更新（object/array 不适用 deep comparison）
        if (oldDataValue === next) return;

        // 4. 标记 attribute 更新（必须在赋值前设置，避免 observe → scheduleRefresh 先于标记执行）
        this.#isAttributeUpdate = true;
        (this.$data as DataRecord)[propName] = next;
        this.attributeChanged(name, oldDataValue, next);
    }

    /* -------------------- created 保障 -------------------- */
    #callCreatedOnce() {
        if (this.#createdCalled) return;

        this.#createdCalled = true;

        this.created();
    }

    /* -------------------- 事件派发 -------------------- */
    public emit(eventName: string, detail?: unknown, options?: Partial<CustomEventInit>) {
        if (this.#disposed) return;
        this.dispatchEvent(
            new CustomEvent(eventName, {
                bubbles: true,
                composed: true,
                detail,
                ...options,
            }),
        );
    }

    public emitNative(eventName: string, options?: EventInit) {
        if (this.#disposed) return;
        this.dispatchEvent(
            new Event(eventName, {
                bubbles: true,
                composed: true,
                ...options,
            }),
        );
    }

    /* -------------------- 开发模式警告 -------------------- */
    /**
     * 在开发模式下输出警告信息
     * @param condition - 是否输出警告的条件
     * @param message - 警告信息
     */
    protected warn(condition: boolean, message: string): void {
        if (IS_DEV && condition) {
            const tagName = this.tagName.toLowerCase();
            console.warn(`[${tagName}] ${message}`);
        }
    }

    /**
     * 在开发模式下输出错误信息
     * @param condition - 是否输出错误的条件
     * @param message - 错误信息
     */
    protected error(condition: boolean, message: string): void {
        if (IS_DEV && condition) {
            const tagName = this.tagName.toLowerCase();
            console.error(`[${tagName}] ${message}`);
        }
    }

    /* -------------------- 显式销毁 -------------------- */
    /**
     * 显式销毁组件，清理 renderer 等资源，并从 DOM 中移除。
     * 适用于确认组件不再 reconnect 的场景。
     * 调用后如需重新使用组件，需重新创建实例。
     */
    public dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        this.#isActive = false;
        this.#cleanupStyles();
        this.#render?.destroy();
        this.#render = undefined;
        this.#dispose?.();
        this.#dispose = undefined;
        this.remove();
    }

    /* -------------------- 钩子 -------------------- */
    public created(): void {}

    public mounted(): void {}

    public beforeUpdate(): void {}

    public updated(): void {}

    public unmounted(): void {}

    public attributeChanged(_name: string, _oldValue: unknown, _newValue: unknown): void {}

    public beforeAttributesUpdate(): void {}

    public afterAttributesUpdate(): void {}
}

export default BaseElement;
