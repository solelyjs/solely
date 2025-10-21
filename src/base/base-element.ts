import { ASTNode, parseHtml, isObject, patch, runInAsyncQueue, observe } from "../utils";
import { Manifest } from "./decorators";

/**
 * 泛型接口
 * 外部组件可定义 $data 的结构类型（带智能提示）
 * 例如：class MyEl extends BaseElement<{ count: number; name: string }> {}
 */
declare interface BaseElement<TData = any> {
    _manifest: Manifest;
}

/**
 * BaseElement<TData>
 * -------------------------------------------------------
 * 核心功能：
 * ✅ 响应式数据系统（observe + Proxy）
 * ✅ 虚拟 DOM 渲染（patch）
 * ✅ 延迟样式注入（connectedCallback 阶段）
 * ✅ 生命周期钩子（created, mounted, updated, unmounted）
 * ✅ 属性同步 ($data <-> attribute)
 */
class BaseElement<TData extends object> extends HTMLElement {
    /** Web Components 标准方法：声明哪些属性变化会触发 attributeChangedCallback */
    static get observedAttributes() {
        const manifest = (this as any)._manifest || this.prototype._manifest;
        if (!manifest?.props) return [];
        return manifest.props.map((p: { name: any }) => typeof p === "string" ? p : p.name);
    }

    // ---------------------- 私有属性 ----------------------
    #data: TData;                    // 响应式数据（Proxy）
    #AST: ASTNode[] = [];            // 模板解析后的虚拟节点 AST
    #vNodes: ASTNode[] = [];         // 上一次渲染的虚拟节点
    #isRefreshing = false;           // 节流刷新，防止重复 patch
    #isMounted = false;              // 是否已挂载
    #root: Element | ShadowRoot;     // 渲染根节点（Shadow DOM 优先）
    #unobserve?: () => void;         // 停止数据监听函数
    // -----------------------------------------------------

    /**
     * 构造函数
     * -------------------------------------------------------
     * 初始化模板、响应式数据和渲染根节点。
     * 样式注入延迟到 connectedCallback 阶段。
     */
    constructor(initialData: TData = {} as TData) {
        super();

        const manifest = this._manifest || {};

        // 设置渲染根节点
        this.#root = manifest.shadowDOM?.use
            ? this.attachShadow({ mode: manifest.shadowDOM.mode || "open" })
            : this;

        // 初始化响应式数据（observe 返回 Proxy + 取消监听函数）
        // 🔹 必须在 parseHtml 前执行，确保模板解析时访问 this.$data 就是 Proxy
        const { proxy, unobserve } = observe(initialData, () => this.#refresh());
        this.#data = proxy as TData;
        this.#unobserve = unobserve;

        // 解析模板字符串为虚拟节点 AST
        if (manifest.template && typeof manifest.template === "string") {
            this.#AST = parseHtml(this, manifest.template);
        }

        // // 生命周期钩子：组件创建完成
        // this.created();
        // 🔹 延迟调用 created()，确保子类字段已初始化
        Promise.resolve().then(() => this.created());
    }

    // ---------------------- $data getter/setter ----------------------

    /** 获取当前组件数据 */
    public get $data(): TData {
        return this.#data;
    }

    /** 更新组件数据 */
    public set $data(value: TData) {
        if (!isObject(value)) value = {} as TData;

        if (this.#unobserve) this.#unobserve(); // 先停止旧的监听
        const { proxy, unobserve } = observe(value, () => this.#refresh());
        this.#data = proxy as TData;
        this.#unobserve = unobserve;

        this.#refresh(); // 立即刷新一次，防止初次数据未渲染
    }

    // ---------------------- 渲染核心逻辑 ----------------------

    /** 内部刷新函数，由 observe() 或外部调用触发 */
    #refresh(): void {
        if (this.#isRefreshing) return;
        this.#isRefreshing = true;

        runInAsyncQueue(() => {
            if (!this.isConnected) {
                this.#isRefreshing = false;
                return;
            }

            this.beforeUpdate();

            // 虚拟 DOM diff + patch
            this.#vNodes = patch(this.#root, this.#AST, this.#vNodes);
            this.#isRefreshing = false;

            // 生命周期：挂载 / 更新
            if (!this.#isMounted) {
                this.#isMounted = true;
                this.mounted();
                this.onInit?.();
            } else {
                this.updated();
            }
        });
    }

    /**
     * 手动刷新组件
     * 外部可调用，用于数据未触发 observe 或强制刷新
     */
    public refresh(): void {
        this.#refresh();
    }

    // ---------------------- 属性类型转换工具 ----------------------
    #convertAttrValue(value: string | null, defaultValue: any, forcedType?: 'number' | 'boolean' | 'object' | 'string') {
        if (value === null) return defaultValue;
        const type = forcedType || typeof defaultValue;
        switch (type) {
            case 'number':
                const num = Number(value);
                return isNaN(num) ? defaultValue : num;
            case 'boolean':
                return value === 'true';
            case 'object':
                try { return JSON.parse(value); } catch { return defaultValue; }
            default:
                return value;
        }
    }

    // ---------------------- Web Components 生命周期 ----------------------

    connectedCallback(): void {
        const manifest = this._manifest || {};

        // 自动添加类名
        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((name) => name && this.classList.add(name));

        // 延迟注入样式
        if (manifest.styles && !this.#root.querySelector("style[data-manifest-style]")) {
            const styleEl = document.createElement("style");
            styleEl.setAttribute("data-manifest-style", "true");
            styleEl.textContent = manifest.styles;
            this.#root.appendChild(styleEl);
        }

        // HTML 属性同步到 $data
        if (manifest.props && isObject(this.$data)) {
            for (const prop of manifest.props) {
                const key = typeof prop === "string" ? prop : prop.name;
                const type = typeof prop === "object" && 'type' in prop ? prop.type : undefined;
                const dataKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                const defaultValue = (this.$data as Record<string, any>)[dataKey];
                if (this.hasAttribute(key)) {
                    const attrValue = this.getAttribute(key);
                    (this.$data as Record<string, any>)[dataKey] = this.#convertAttrValue(attrValue, defaultValue, type as any);
                }
            }
        }

        // 首次渲染
        this.#refresh();
    }

    disconnectedCallback(): void {
        if (!this.isConnected) return;
        this.unmounted();
        this.#unobserve?.();
        this.#unobserve = undefined;
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue === newValue || !isObject(this.$data)) return;
        const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const defaultValue = (this.$data as Record<string, any>)[key];
        (this.$data as Record<string, any>)[key] = this.#convertAttrValue(newValue, defaultValue);
    }

    // ---------------------- 自定义生命周期钩子 ----------------------

    /** 兼容旧组件的初始化钩子（首次 mounted 后调用） */
    public onInit(): void | Promise<void> { }

    /** 组件创建完成（构造函数结束时调用） */
    public created(): void { }

    /** 组件首次挂载到 DOM 后调用 */
    public mounted(): void { }

    /** 每次更新前调用 */
    public beforeUpdate(): void { }

    /** 每次更新完成后调用 */
    public updated(): void { }

    /** 组件从 DOM 中卸载时调用 */
    public unmounted(): void { }

    // ---------------------- 开发期友好提示 ----------------------
    static {
        if (import.meta.env.DEV) {
            const originalDefine = customElements.define;
            customElements.define = function (name, ctor, options) {
                if (BaseElement.isPrototypeOf(ctor)) {
                    const proto = ctor.prototype;
                    for (const key of ["connectedCallback", "disconnectedCallback"] as const) {
                        const baseMethod = BaseElement.prototype[key];
                        if (proto[key] !== baseMethod) {
                            console.warn(
                                `[dev-warning] <${name}> 继承自 BaseElement，但重写了 ${key}()。\n` +
                                `建议使用生命周期钩子 created()/mounted()/unmounted()，避免破坏内部样式注入和内存管理。`
                            );
                        }
                    }
                }
                return originalDefine.call(this, name, ctor, options);
            };
        }
    }
}

export default BaseElement;
