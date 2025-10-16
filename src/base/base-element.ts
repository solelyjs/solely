import { ASTNode, parseHtml, isObject, patch, runInAsyncQueue, observe } from "../utils";
import { Manifest } from "./decorators";



/**
 * 泛型接口：
 * 外部组件可定义 $data 的结构类型（带自动智能提示）
 * 例如：class MyEl extends BaseElement<{ count: number; name: string }> {}
 */
declare interface BaseElement<TData = any> {
    _manifest: Manifest;
}

/**
 * BaseElement<TData>
 * -------------------------------------------------------
 * ✅ 响应式数据系统（observe）
 * ✅ 虚拟 DOM 渲染（patch）
 * ✅ 延迟样式注入（connectedCallback 阶段）
 * ✅ 生命周期钩子（created, mounted, updated, unmounted）
 * ✅ 属性同步 ($data <-> attribute)
 */
class BaseElement<TData extends object> extends HTMLElement {
    /**
     * Web Components 标准静态方法：
     * 声明哪些属性变化会触发 attributeChangedCallback。
     */
    static get observedAttributes() {
        const manifest = (this as any)._manifest || this.prototype._manifest;
        if (!manifest?.props) return [];
        return manifest.props.map((p: { name: any; }) => typeof p === "string" ? p : p.name);
    }

    // #region 私有属性
    #data: TData;                    // 响应式数据（Proxy）
    #AST: ASTNode[] = [];            // 模板 AST
    #vNodes: ASTNode[] = [];         // 上次渲染的虚拟节点
    #isRefreshing = false;           // 防止重复渲染
    #isMounted = false;              // 是否已挂载
    #root: Element | ShadowRoot;     // 渲染根节点
    #unobserve?: () => void;         // 停止数据监听的函数
    // #endregion

    /**
     * 构造函数
     * -------------------------------------------------------
     * 初始化模板、数据代理、渲染根节点。
     * 🚫 注意：样式不会在此阶段注入（延迟到 connectedCallback）。
     */
    constructor(initialData: TData = {} as TData) {
        super();

        const manifest = this._manifest || {};

        // 1️⃣ 设置渲染根节点（Shadow DOM 优先）
        this.#root = manifest.shadowDOM?.use
            ? this.attachShadow({ mode: manifest.shadowDOM.mode || "open" })
            : this;

        // 2️⃣ 将模板字符串解析为虚拟节点 AST
        if (manifest.template && typeof manifest.template === "string") {
            this.#AST = parseHtml(this, manifest.template);
        }

        // 3️⃣ 初始化响应式数据（observe 返回 Proxy + 取消函数）
        const { proxy, unobserve } = observe(initialData, () => this.#refresh());
        this.#data = proxy as TData;
        this.#unobserve = unobserve;

        // 生命周期钩子：组件创建完成
        this.created();
    }

    // #region 响应式数据访问器

    /** 获取当前组件数据 */
    public get $data(): TData {
        return this.#data;
    }

    /**
     * 更新组件数据。
     * -------------------------------------------------------
     * ✅ 优化：不销毁 Proxy，只合并新旧数据。
     * ✅ 保证响应式链保持有效。
     */
    public set $data(newData: TData) {
        if (!isObject(this.#data) || !isObject(newData)) {
            console.error("BaseElement: $data must be an object.");
            return;
        }

        const current = this.#data as Record<string, any>;
        const incoming = newData as Record<string, any>;

        // 删除旧 key（新数据中不存在的）
        for (const key of Object.keys(current)) {
            if (!(key in incoming)) delete current[key];
        }

        // 添加或更新新 key
        for (const key of Object.keys(incoming)) {
            if (current[key] !== incoming[key]) current[key] = incoming[key];
        }
    }

    // #endregion

    // #region 渲染核心逻辑

    /**
     * 内部刷新函数：
     * -------------------------------------------------------
     * 由 observe() 自动触发。
     * 使用 runInAsyncQueue 实现批量异步更新。
     */
    #refresh(): void {
        if (this.#isRefreshing) return;
        this.#isRefreshing = true;

        runInAsyncQueue(() => {
            // 若组件已被移出 DOM，跳过刷新
            if (!this.isConnected) {
                this.#isRefreshing = false;
                return;
            }

            // 生命周期：更新前
            this.beforeUpdate();

            // 虚拟 DOM diff & patch
            this.#vNodes = patch(this.#root, this.#AST, this.#vNodes);
            this.#isRefreshing = false;

            // 生命周期：挂载 / 更新
            if (!this.#isMounted) {
                this.#isMounted = true;
                this.mounted();

                // ✅ 保留旧的 onInit 生命周期钩子，兼容老组件
                this.onInit?.();
            } else {
                this.updated();
            }
        });
    }

    // #endregion

    // #region 类型转换工具
    #convertAttrValue(value: string | null, defaultValue: any, forcedType?: 'number' | 'boolean' | 'object' | 'string') {
        if (value === null) return defaultValue;
        //  根据 defaultValue 类型推断
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
    // #endregion    


    // #region Web Components 生命周期

    /**
     * 元素首次插入文档时调用。
     * -------------------------------------------------------
     * 1️⃣ 自动添加类名
     * 2️⃣ 延迟注入样式（确保 Shadow DOM 生效）
     * 3️⃣ 首次触发渲染
     */
    connectedCallback(): void {
        const manifest = this._manifest || {};

        // 自动添加类名
        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((name) => name && this.classList.add(name));

        // 延迟注入样式（仅注入一次）
        if (manifest.styles && !this.#root.querySelector("style[data-manifest-style]")) {
            const styleEl = document.createElement("style");
            styleEl.setAttribute("data-manifest-style", "true");
            styleEl.textContent = manifest.styles;
            this.#root.appendChild(styleEl);
        }

        // HTML 属性同步到 $data，并自动类型转换
        if (manifest.props && isObject(this.$data)) {
            for (const prop of manifest.props) {
                const key = typeof prop === "string" ? prop : prop.name;
                const type = typeof prop === "object" && 'type' in prop ? prop.type : undefined;
                // 转换属性名 user-id → userId
                const dataKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                const defaultValue = (this.$data as Record<string, any>)[dataKey];
                if (this.hasAttribute(key)) {
                    const attrValue = this.getAttribute(key);
                    (this.$data as Record<string, any>)[dataKey] = this.#convertAttrValue(attrValue, defaultValue, type as any);
                }
            }
        }

        // 执行首次渲染
        this.#refresh();
    }

    /**
     * 元素从文档中移除时调用。
     * -------------------------------------------------------
     * 1️⃣ 调用卸载钩子
     * 2️⃣ 停止数据监听，防止内存泄漏
     */
    disconnectedCallback(): void {
        if (!this.isConnected) return;
        this.unmounted();
        this.#unobserve?.();
        this.#unobserve = undefined;
    }

    /**
     * 当监听的属性变化时触发。
     * -------------------------------------------------------
     * 自动将 HTML attribute 同步到 $data。
     */
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue === newValue || !isObject(this.$data)) return;

        // 转换属性名 user-id → userId
        const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const defaultValue = (this.$data as Record<string, any>)[key];
        (this.$data as Record<string, any>)[key] = this.#convertAttrValue(newValue, defaultValue);
    }

    // #endregion

    // #region 自定义生命周期钩子


    /** 兼容旧组件的初始化钩子（首次 mounted 后调用） */
    public onInit(): void | Promise<void> { }

    /** 组件创建完成（constructor 结束时） */
    public created(): void { }

    /** 组件首次挂载到 DOM 后 */
    public mounted(): void { }

    /** 每次更新前 */
    public beforeUpdate(): void { }

    /** 每次更新完成后 */
    public updated(): void { }

    /** 组件从 DOM 中卸载时 */
    public unmounted(): void { }

    // #endregion


    // #region 开发期友好提示（改进版）
    static {
        if (import.meta.env.DEV) {
            // 监听自定义元素注册（在注册时检查继承结构）
            const originalDefine = customElements.define;
            customElements.define = function (name, ctor, options) {
                if (BaseElement.isPrototypeOf(ctor)) {
                    const proto = ctor.prototype;

                    // 检查是否覆盖了关键回调
                    for (const key of ["connectedCallback", "disconnectedCallback"] as const) {
                        const baseMethod = BaseElement.prototype[key];
                        if (proto[key] !== baseMethod) {
                            console.warn(
                                `[dev-warning] <${name}> 继承自 BaseElement，但重写了 ${key}()。\n` +
                                `👉 建议使用生命周期钩子 created()/mounted()/unmounted() 来实现逻辑，\n` +
                                `以避免破坏 BaseElement 内部的样式注入和内存管理机制。`
                            );
                        }
                    }
                }

                // 调用原始 define
                return originalDefine.call(this, name, ctor, options);
            };
        }
    }
    // #endregion

}

export default BaseElement;
