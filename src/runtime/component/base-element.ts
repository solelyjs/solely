import { isObject } from "@/shared";
import { InternalManifest, Manifest, PropDescriptor, PropType } from "./decorators";
import { createRender, IRRenderInstance } from "../renderer";
import { observe } from "../reactivity";
import { ChangeItem } from "../reactivity/observe";

const MANIFEST_SYMBOL: unique symbol = Symbol.for("solely.manifest");

/* -------------------- 类型定义 -------------------- */
declare interface BaseElement<TData = any> {
    /**
       * 通过 ref 属性获取的 DOM 元素引用集合
       * - 键：模板中写的 ref="xxx" 的名字
       * - 值：对应的 DOM 元素（通常是 HTMLElement 或 SVGElement）
       */
    $refs: Record<string, HTMLElement | SVGElement | any>;
}

interface ManifestConstructor {
    [MANIFEST_SYMBOL]?: Manifest;
}

interface UpgradePropsConstructor {
    upgradeProps?: readonly string[];
}

/* -------------------- 实现 -------------------- */
class BaseElement<TData extends object = any> extends HTMLElement {
    #manifest: Manifest;
    #render!: IRRenderInstance;
    #ir: any;
    #data!: TData;
    #root!: Element | ShadowRoot;
    #dispose?: () => void;

    #isRefreshing = false;
    #updateScheduled = false;
    #isAttributeUpdate = false;

    #createdCalled = false;

    static upgradeProps?: readonly string[]; // 需要在元素定义前设置的属性列表（Upgrade Property）

    /* -------------------- observedAttributes -------------------- */
    static get observedAttributes(): string[] {
        const manifest = (this as any)[MANIFEST_SYMBOL] as InternalManifest;
        if (!manifest?.propMap) return [];

        // 直接从预处理好的 Map 中获取所有 kebab-case 的键
        return Array.from(manifest.propMap.keys());
    }

    /* -------------------- 构造 -------------------- */
    constructor(initialData: TData = {} as TData) {
        super();

        const ctor = this.constructor as typeof BaseElement & ManifestConstructor;

        this.#manifest = ctor[MANIFEST_SYMBOL] || { tagName: "base-element" };
        const manifest = this.#manifest;

        this.#root = manifest.shadowDOM?.use
            ? this.attachShadow({ mode: manifest.shadowDOM.mode || "open" })
            : this;

        this.#initData(initialData);
        this.#initTemplate(manifest);

        queueMicrotask(() => this.#callCreatedOnce());
    }

    // 升级属性（Upgrade Property）, 保障在元素被定义前设置的属性能正确触发响应式更新
    #upgradeProperties(props: string[]) {
        for (const prop of props) {
            if (this.hasOwnProperty(prop)) {
                const value = (this as any)[prop];
                delete (this as any)[prop];
                (this as any)[prop] = value;
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

                const desc = manifest.propMap?.get(
                    propKey.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
                ) || Array.from(manifest.propMap?.values() || []).find(d => d.name === propKey);

                if (desc?.reflect) {
                    this.#reflectToAttribute(desc, newValue);
                }
            }

            this.emit("change", {
                source: "state",
                ...change,
            });

            this.#scheduleRefresh();
        });

        this.#data = proxy as TData;
        this.#dispose = dispose;
    }

    #reflectToAttribute(desc: PropDescriptor, value: any) {
        const attrName = desc.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

        if (desc.type === "boolean") {
            if (value) {
                this.setAttribute(attrName, "");
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

    /* -------------------- $data -------------------- */
    get $data(): TData {
        return this.#data;
    }

    set $data(value: TData) {
        if (!isObject(value)) value = {} as TData;

        this.#dispose?.();
        this.#initData(value);
        this.#scheduleRefresh();
    }

    #convertAttrValue(
        value: string | null,
        defaultValue: any,
        type?: PropType
    ) {
        if (value === null) {
            // 对于布尔值，不存在即为 false (除非默认值强制为 true)
            return type === "boolean" ? (defaultValue ?? false) : defaultValue;
        }

        switch (type) {
            case "boolean":
                // 只要属性存在（value 不为 null），在 HTML 语义下就是 true
                // 这里的 value 可能是 "" (例如 <my-el active>) 或 "active"
                return true;

            case "number": {
                const n = Number(value);
                return isNaN(n) ? defaultValue : n;
            }

            case "object":
                try {
                    return JSON.parse(value);
                } catch {
                    return defaultValue;
                }

            default:
                return value;
        }
    }

    /* -------------------- 刷新调度 -------------------- */
    #scheduleRefresh() {
        if (this.#updateScheduled || !this.#render) return;

        this.#updateScheduled = true;

        queueMicrotask(() => {
            this.#updateScheduled = false;
            this.#doRefresh();
        });
    }

    #doRefresh() {
        if (this.#isRefreshing || !this.isConnected) return;

        this.#isRefreshing = true;

        if (this.#isAttributeUpdate) this.beforeAttributesUpdate();

        this.beforeUpdate();
        this.#render.update();
        this.updated();

        if (this.#isAttributeUpdate) {
            this.afterAttributesUpdate();
            this.#isAttributeUpdate = false;
        }

        this.#isRefreshing = false;
    }

    public refresh(): void {
        this.#scheduleRefresh();
    }

    #injectStyles() {
        const manifest = this.#manifest as InternalManifest;
        if (!manifest.styles) return;

        const root = this.#root;

        // 场景 A: 存在预生成的 sheet 且使用 Shadow DOM
        if (manifest.sheet && root instanceof ShadowRoot && "adoptedStyleSheets" in root) {
            // 避免重复添加
            if (!root.adoptedStyleSheets.includes(manifest.sheet)) {
                root.adoptedStyleSheets = [...root.adoptedStyleSheets, manifest.sheet];
            }
            return;
        }

        // 场景 B: 回退方案 (无 Shadow DOM 或 不支持 adoptedStyleSheets)
        const target = (root instanceof ShadowRoot) ? root : document.head;
        const styleId = `solely-style-${manifest.tagName}`;

        if (!target.querySelector(`#${styleId}`)) {
            const styleEl = document.createElement("style");
            styleEl.id = styleId;
            styleEl.textContent = manifest.styles;
            target.appendChild(styleEl);
        }
    }

    /* -------------------- 生命周期 -------------------- */
    connectedCallback(): void {
        const ctor = this.constructor as typeof BaseElement & UpgradePropsConstructor;
        const userUpgradeProps = ctor.upgradeProps;

        // 构建升级属性列表，确保 $data 始终被包含
        let finalUpgradeProps: string[];
        if (Array.isArray(userUpgradeProps)) {
            finalUpgradeProps = userUpgradeProps.includes('$data')
                ? userUpgradeProps
                : [...userUpgradeProps, '$data'];
        } else {
            finalUpgradeProps = ['$data'];
        }

        this.#upgradeProperties(finalUpgradeProps);

        this.#callCreatedOnce();

        const manifest = this.#manifest as InternalManifest;

        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((n) => n && this.classList.add(n));

        /* ---------- style ---------- */
        this.#injectStyles();

        /* ---------- attribute → state ---------- */

        if (manifest.propMap && isObject(this.$data)) {
            // 遍历预设好的属性映射
            for (const [attrName, desc] of manifest.propMap) {
                const propName = desc.name; // 对应的驼峰或原始变量名

                if (this.hasAttribute(attrName)) {
                    const raw = this.getAttribute(attrName);
                    const value = this.#convertAttrValue(raw, desc.default, desc.type);
                    (this.$data as any)[propName] = value;
                } else if ("default" in desc) {
                    // 如果 HTML 没写，使用默认值
                    (this.$data as any)[propName] = desc.default;
                }
            }
        }

        if (this.#ir)
            this.#render = createRender(
                this.#ir,
                this.#root as HTMLElement,
                this
            );

        this.mounted();
        this.onInit?.();
    }

    disconnectedCallback(): void {
        this.unmounted();

        // 清理响应式
        this.#dispose?.();
        this.#dispose = undefined;

        // 销毁渲染实例
        this.#render?.destroy?.();
        this.#render = null as any;
    }
    attributeChangedCallback(
        name: string,
        oldValue: string | null,
        newValue: string | null
    ): void {
        if (oldValue === newValue || !isObject(this.$data)) return;

        const manifest = this.#manifest as InternalManifest;
        // 1. 直接从 Map 拿到描述符，无需正则转换
        const desc = manifest.propMap?.get(name);
        if (!desc) return;

        const propName = desc.name;
        const oldDataValue = (this.$data as any)[propName];

        // 2. 转换值
        const next = this.#convertAttrValue(
            newValue,
            desc.default ?? oldDataValue,
            desc.type
        );

        // 3. 更新数据（触发响应式）
        (this.$data as any)[propName] = next;

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
    public emit(
        eventName: string,
        detail?: any,
        options?: Partial<CustomEventInit>
    ) {
        this.dispatchEvent(
            new CustomEvent(eventName, {
                bubbles: true,
                composed: true,
                detail,
                ...options,
            })
        );
    }

    /* -------------------- 钩子 -------------------- */
    public onInit(): void | Promise<void> { }

    public created(): void { }

    public mounted(): void { }

    public beforeUpdate(): void { }

    public updated(): void { }

    public unmounted(): void { }

    public attributeChanged(
        _name: string,
        _oldValue: any,
        _newValue: any
    ): void { }

    public beforeAttributesUpdate(): void { }

    public afterAttributesUpdate(): void { }

    /* -------------------- DEV define 保护 -------------------- */
    static #patched = false;

    static {
        if (import.meta.env.DEV && !BaseElement.#patched) {
            BaseElement.#patched = true;

            const original = customElements.define;

            customElements.define = function (name, ctor, options) {
                if (BaseElement.isPrototypeOf(ctor)) {
                    const proto = ctor.prototype;

                    const forbidden = [
                        "connectedCallback",
                        "disconnectedCallback",
                        "attributeChangedCallback",
                    ] as const;

                    for (const key of forbidden) {
                        if (proto[key] !== BaseElement.prototype[key]) {
                            console.error(
                                `[${name}] 禁止重写 ${key}()，请使用框架钩子`
                            );
                        }
                    }
                }

                return original.call(this, name, ctor, options);
            };
        }
    }
}

export default BaseElement;
