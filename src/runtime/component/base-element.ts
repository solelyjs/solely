import { IS_DEV, isObject } from '../../shared';
import { InternalManifest, Manifest, PropDescriptor, PropType } from './decorators';
import { createRender, IRRenderInstance } from '../renderer';
import { observe } from '../reactivity';
import { ChangeItem } from '../reactivity/observe';
import { IRRoot } from '@/types';

const MANIFEST_SYMBOL: unique symbol = Symbol.for('solely.manifest');

/* -------------------- 类型定义 -------------------- */
declare interface BaseElement<
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
    #render!: IRRenderInstance;
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

    // 非 Shadow DOM 样式引用计数（用于组件卸载时清理）
    static #styleRefCount = new Map<string, number>();

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
    #upgradeAllOwnDataProperties() {
        // 1. 获取实例所有自有属性键（包括不可枚举）
        const ownKeys = Object.getOwnPropertyNames(this);

        // 可选的过滤规则：跳过内部属性（以 #、_、$ 开头的内部保留字段）
        const internalPrefixes = ['#', '_'];
        const internalFields = new Set([
            '$data',
            '$refs',
            'constructor',
            'onInit',
            'created',
            'mounted',
            'beforeUpdate',
            'updated',
            'unmounted',
            'attributeChanged',
            'beforeAttributesUpdate',
            'afterAttributesUpdate',
            'emit',
            'refresh',
        ]);

        for (const key of ownKeys) {
            // 过滤内部字段
            if (internalFields.has(key)) continue;
            if (internalPrefixes.some(p => key.startsWith(p))) continue;

            // 只处理自有数据属性（value 描述符），不处理访问器属性
            const desc = Object.getOwnPropertyDescriptor(this, key);
            if (!desc || !('value' in desc)) continue;

            const value = desc.value;

            // 沿原型链查找是否存在 setter（可能是用户自定义的或 @Prop 生成的）
            let protoTarget: object = this as object;
            let setterDesc: PropertyDescriptor | undefined;
            while (protoTarget) {
                setterDesc = Object.getOwnPropertyDescriptor(protoTarget, key);
                if (setterDesc?.set) break;
                protoTarget = Object.getPrototypeOf(protoTarget);
            }

            if (setterDesc?.set) {
                // 删除自有数据属性，触发 setter
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
        const attrName = desc.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

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

        for (const [_attrName, desc] of manifest.attributeMap) {
            // 跳过非响应式
            if (desc.reactive === false) continue;

            const protoDesc = Object.getOwnPropertyDescriptor(this.constructor.prototype, desc.name);

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

    /* -------------------- $data -------------------- */
    get $data(): TData {
        return this.#data;
    }

    set $data(value: TData) {
        if (!isObject(value)) value = {} as TData;
        if ((value as unknown) === (this.#data as unknown)) return; // 引用相同则跳过

        this.#dispose?.();
        this.#initData(value);
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
                    // 处理单引号格式的数组字符串，如 "['a', 'b']" 转换为 '["a", "b"]'
                    const normalizedValue = value.replace(/'/g, '"');
                    const parsed = JSON.parse(normalizedValue);
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
        if (!this.#isActive) {
            // 元素未连接，不刷新
            this.#needsRefresh = true; // defer refresh
            return;
        }
        if (this.#updateScheduled || !this.#render) return;

        this.#updateScheduled = true;

        queueMicrotask(() => {
            this.#updateScheduled = false;
            this.#doRefresh();
        });
    }

    #doRefresh() {
        if (this.#isRefreshing || !this.#isActive) return;

        this.#isRefreshing = true;

        try {
            if (this.#isAttributeUpdate) this.beforeAttributesUpdate();
            this.beforeUpdate();
            this.#render.update();
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
                root.adoptedStyleSheets = [...root.adoptedStyleSheets, manifest.sheet];
            }
            return;
        }

        // 场景 B: 回退方案 (无 Shadow DOM 或 不支持 adoptedStyleSheets)
        const target = root instanceof ShadowRoot ? root : document.head;
        const styleId = `solely-style-${manifest.tagName}`;
        const isNonSD = !manifest.shadowDOM?.use;

        if (!target.querySelector(`#${styleId}`)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = manifest.styles;
            target.appendChild(styleEl);
        }

        // 非 Shadow DOM 模式：增加引用计数
        if (isNonSD) {
            const count = BaseElement.#styleRefCount.get(styleId) || 0;
            BaseElement.#styleRefCount.set(styleId, count + 1);
        }
    }

    /* -------------------- 生命周期 -------------------- */
    connectedCallback(): void {
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
            this.#installReactiveProps();

            // 遍历预设好的属性映射
            for (const [attrName, desc] of manifest.attributeMap) {
                const propName = desc.name; // 对应的驼峰或原始变量名

                if (this.hasAttribute(attrName)) {
                    const raw = this.getAttribute(attrName);
                    const value = this.#convertAttrValue(raw, desc.default, desc.type);
                    (this.$data as DataRecord)[propName] = value;
                } else if ('default' in desc) {
                    // 如果 HTML 没写，使用默认值
                    (this.$data as DataRecord)[propName] = desc.default;
                    // 对于布尔类型，如果默认值是 true，同步设置到 HTML 属性
                    if (desc.type === 'boolean' && desc.default === true) {
                        this.setAttribute(attrName, '');
                    }
                }
            }
        }

        // 自动升级所有自有数据属性（不需要手动声明 upgradeProps）
        this.#upgradeAllOwnDataProperties();

        if (this.#ir && !this.#render) this.#render = createRender(this.#ir, this.#root as HTMLElement, this);

        // 重新挂载强制刷新一次
        if (this.#needsRefresh) {
            this.#needsRefresh = false;
            this.#scheduleRefresh();
        }

        this.mounted();
        this.onInit?.();
    }

    disconnectedCallback(): void {
        this.#isActive = false;

        // 非 Shadow DOM 模式：清理样式引用
        const manifest = this.#manifest as InternalManifest;
        if (!manifest.shadowDOM?.use && manifest.styles) {
            const styleId = `solely-style-${manifest.tagName}`;
            const count = BaseElement.#styleRefCount.get(styleId) || 0;
            if (count <= 1) {
                document.head.querySelector(`#${styleId}`)?.remove();
                BaseElement.#styleRefCount.delete(styleId);
            } else {
                BaseElement.#styleRefCount.set(styleId, count - 1);
            }
        }

        this.unmounted();
    }
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue || !isObject(this.$data)) return;

        const manifest = this.#manifest as InternalManifest;
        // 1. 直接从 Map 拿到描述符，无需正则转换
        const desc = manifest.attributeMap?.get(name);
        if (!desc) return;

        const propName = desc.name;
        const oldDataValue = (this.$data as DataRecord)[propName];

        // 2. 转换值
        const next = this.#convertAttrValue(newValue, desc.default ?? oldDataValue, desc.type);

        // 3. 更新数据（触发响应式）
        (this.$data as DataRecord)[propName] = next;

        this.#isAttributeUpdate = true;
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

    /* -------------------- 钩子 -------------------- */
    public onInit(): void | Promise<void> {}

    public created(): void {}

    public mounted(): void {}

    public beforeUpdate(): void {}

    public updated(): void {}

    public unmounted(): void {}

    public attributeChanged(_name: string, _oldValue: unknown, _newValue: unknown): void {}

    public beforeAttributesUpdate(): void {}

    public afterAttributesUpdate(): void {}

    /* -------------------- DEV define 保护 -------------------- */
    static {
        if (IS_DEV && typeof customElements !== 'undefined') {
            const original = customElements.define;
            const checkedCtors = new WeakSet<CustomElementConstructor>();

            customElements.define = function (name, ctor, options) {
                if (BaseElement.isPrototypeOf(ctor) && !checkedCtors.has(ctor)) {
                    checkedCtors.add(ctor);
                    const proto = ctor.prototype;

                    const forbidden = [
                        'connectedCallback',
                        'disconnectedCallback',
                        'attributeChangedCallback',
                    ] as const;

                    for (const key of forbidden) {
                        if (proto[key] !== BaseElement.prototype[key]) {
                            console.error(`[${name}] 禁止重写 ${key}()，请使用框架钩子`);
                        }
                    }
                }

                return original.call(this, name, ctor, options);
            };
        }
    }
}

export default BaseElement;
