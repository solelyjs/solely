import { parseHtml, buildIR } from "@/compiler";
import { isObject } from "@/shared";
import { Manifest, PropDescriptor, PropType } from "./decorators";
import { createRender, IRRenderInstance, observe } from "@/runtime";

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
    #unobserve?: () => void;

    #isRefreshing = false;
    #updateScheduled = false;
    #isAttributeUpdate = false;

    #createdCalled = false;

    static upgradeProps?: readonly string[]; // 需要在元素定义前设置的属性列表（Upgrade Property）

    static #sheetCache = new Map<string, CSSStyleSheet>();

    /* -------------------- observedAttributes -------------------- */
    static #attrCache = new WeakMap<any, string[]>();

    static get observedAttributes(): string[] {

        if (BaseElement.#attrCache.has(this)) {
            return BaseElement.#attrCache.get(this)!;
        }

        const manifest: Manifest = (this as any)[MANIFEST_SYMBOL];

        if (!manifest?.props) {
            BaseElement.#attrCache.set(this, []);
            return [];
        }

        const attrs = manifest.props.map((p: any) => {
            const name = typeof p === "string" ? p : p.name;
            return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
        });

        BaseElement.#attrCache.set(this, attrs);

        return attrs;
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
        const { proxy, unobserve } = observe(data, (change) => {
            this.emit("change", {
                source: "state",
                ...change,
            });

            this.#scheduleRefresh();
        });

        this.#data = proxy as TData;
        this.#unobserve = unobserve;
    }

    #initTemplate(manifest: Manifest) {
        const template = manifest.template;

        if (typeof template === "string") {
            const ast = parseHtml(template);
            this.#ir = buildIR(ast, {
                source: template,
                filename: manifest.tagName,
            });
        }
    }

    /* -------------------- $data -------------------- */
    get $data(): TData {
        return this.#data;
    }

    set $data(value: TData) {
        if (!isObject(value)) value = {} as TData;

        this.#unobserve?.();
        this.#initData(value);
        this.#scheduleRefresh();
    }

    /* -------------------- Prop 工具 -------------------- */
    #getPropDescriptor(attrName: string): PropDescriptor | undefined {
        const props = this.#manifest.props;
        if (!props) return;

        const camel = attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

        const p = props.find((p: any) =>
            typeof p === "string" ? p === camel : p.name === camel
        );

        if (!p) return;

        if (typeof p === "string") {
            return { name: p };
        }

        return p;
    }

    #convertAttrValue(
        value: string | null,
        defaultValue: any,
        type?: PropType
    ) {
        if (value === null) return defaultValue;

        switch (type) {
            case "number": {
                const n = Number(value);
                return isNaN(n) ? defaultValue : n;
            }

            case "boolean":
                return value !== null && value !== "false";

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
        const manifest = this.#manifest;
        const styles = manifest.styles;

        if (!styles) return;

        const root = this.#root as any;

        /* ---------- Shadow DOM ---------- */

        if ("adoptedStyleSheets" in root) {

            if (root._styleInjected) return;

            /* DEV 模式清缓存（支持 HMR） */
            if (import.meta.env.DEV) {
                BaseElement.#sheetCache.delete(styles);
            }

            let sheet = BaseElement.#sheetCache.get(styles);

            if (!sheet) {
                sheet = new CSSStyleSheet();
                sheet.replaceSync(styles);
                BaseElement.#sheetCache.set(styles, sheet);
            }

            root.adoptedStyleSheets = [
                ...root.adoptedStyleSheets,
                sheet
            ];

            root._styleInjected = true;

            return;
        }

        /* ---------- fallback style ---------- */

        if (root.querySelector("style[data-manifest-style]")) return;

        const style = document.createElement("style");
        style.dataset.manifestStyle = "true";
        style.textContent = styles;

        root.appendChild(style);
    }

    /* -------------------- 生命周期 -------------------- */
    connectedCallback(): void {
        const ctor = this.constructor as typeof BaseElement & UpgradePropsConstructor;
        if (Array.isArray(ctor.upgradeProps)) {
            this.#upgradeProperties(ctor.upgradeProps);
        }

        this.#callCreatedOnce();

        const manifest = this.#manifest;

        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((n) => n && this.classList.add(n));

        /* ---------- style ---------- */
        this.#injectStyles();

        /* ---------- attribute → state ---------- */

        if (manifest.props && isObject(this.$data)) {
            for (const p of manifest.props as any[]) {
                const name = typeof p === "string" ? p : p.name;

                const desc = this.#getPropDescriptor(name);

                const key = name.replace(
                    /-([a-z])/g,
                    (_: any, c: string) => c.toUpperCase()
                );

                if (this.hasAttribute(name)) {
                    const raw = this.getAttribute(name);

                    const value = this.#convertAttrValue(
                        raw,
                        desc?.default,
                        desc?.type
                    );

                    (this.$data as any)[key] = value;

                } else if (desc && "default" in desc) {
                    (this.$data as any)[key] = desc.default;
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

        this.#unobserve?.();
        this.#unobserve = undefined;
    }

    attributeChangedCallback(
        name: string,
        oldValue: string | null,
        newValue: string | null
    ): void {
        if (oldValue === newValue || !isObject(this.$data)) return;

        const desc = this.#getPropDescriptor(name);

        const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

        const oldDataValue = (this.$data as any)[key];

        const next = this.#convertAttrValue(
            newValue,
            desc?.default ?? oldDataValue,
            desc?.type
        );

        (this.$data as any)[key] = next;

        this.#isAttributeUpdate = true;

        this.attributeChanged(name, oldDataValue, next);

        this.emit("change", {
            source: "attribute",
            name,
            oldValue: oldDataValue,
            newValue: next,
        });
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
