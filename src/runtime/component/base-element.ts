import { camelToKebab, IS_DEV, isObject, SOLELY_VERSION } from '../../shared';
import { parseBooleanAttribute } from '../../shared/boolean';
import { InternalManifest, Manifest, PropDescriptor, PropType } from './decorators';
import { createRender, IRRenderInstance } from '../renderer';
import { observe } from '../reactivity';
import { ChangeItem } from '../reactivity/observe';
import { IRRoot } from '@/types';

const MANIFEST_SYMBOL: unique symbol = Symbol.for('solely.manifest');

/**
 * Node/SSR 环境没有 HTMLElement。若模块顶层直接 `extends HTMLElement`，
 * `import 'solely'` 会在求值阶段抛 `ReferenceError: HTMLElement is not defined`。
 * 这里退化为空基类：浏览器环境仍是原生 HTMLElement（行为不变），
 * Node 环境仅保证「可导入」，实例化与渲染仍需 DOM。
 */
const HTMLElementBase: typeof HTMLElement =
    typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

/**
 * 克隆 props 的默认值
 *
 * `props[].default` 定义在 manifest 上，如果直接使用，object/array 会被所有实例共享：
 * 一个实例修改后其它实例可见，甚至污染后续新建实例的初始值。这里按实例克隆一份。
 * 原始值（string/number/boolean/null）直接返回，无额外开销。
 */
function cloneDefaultValue<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;

    const clone = (globalThis as { structuredClone?: <V>(input: V) => V }).structuredClone;
    if (typeof clone === 'function') {
        try {
            return clone(value);
        } catch {
            // 含函数、DOM 节点等无法结构化克隆的值退回 JSON。
            // 注意：JSON 兜底会丢弃函数值（默认值里放函数属罕见用法）
        }
    }

    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        // 循环引用等无法克隆：保持原值，至少不破坏现有行为
        return value;
    }
}

/**
 * 解析 props 的默认值
 *
 * `default` 为函数时视为工厂：以当前元素实例为参数求值后再按实例克隆。
 * 用于语言环境（如 not-found 文案）或依赖其它 prop 的默认值（如 slider.value）。
 */
function resolveDefaultValue(value: unknown, host: unknown): unknown {
    const resolved = typeof value === 'function' ? (value as (host: unknown) => unknown)(host) : value;
    return cloneDefaultValue(resolved);
}

/**
 * property → attribute 镜像时排除的 prop 名单
 *
 * 这些 prop 由组件自行管理 attribute 语义（例如 input/select 在用户交互中
 * 维护 value），框架若在 property 写入后回写 attribute，会覆盖组件的写入，
 * 或在输入过程中产生高频 attribute 抖动。
 */
const MIRROR_EXCLUDED_PROPS = new Set(['value', 'checked']);

/**
 * 把写入值规整为 manifest 声明的类型
 *
 * attribute 路径的转换见 `#convertAttrValue`；property 路径（`el.rows = '4'`）
 * 过去完全不做转换，导致同一个 prop 因写法不同而得到不同类型。这里让两条路径
 * 共用同一套语义：
 * - `number`：数字字符串转 number，无法转换时保留原值（不静默改成默认值）。
 * - `boolean`：`'false' / '0'`（trim、大小写不敏感）→ false，`''` 及其他字符串 → true（HTML 语义）。
 * - `array` / `object`：字符串按 JSON 解析，解析失败保留原值。
 * - `string`：number/boolean 转字符串，其余原样保留。
 *
 * 已是目标类型的值原样返回，因此对 attribute 路径的重复调用是幂等的。
 */
function normalizePropValue(desc: PropDescriptor, value: unknown): unknown {
    if (value === null || value === undefined) return value;

    switch (desc.type) {
        case 'number': {
            if (typeof value === 'string') {
                if (value.trim() === '') return value;
                const n = Number(value);
                if (Number.isNaN(n)) {
                    if (IS_DEV) {
                        console.warn(`[Solely] number prop 收到非法字符串 "${value}"，已保留原值。`);
                    }
                    return value;
                }
                return n;
            }
            return value;
        }

        case 'boolean': {
            if (typeof value === 'string') {
                const s = value.trim().toLowerCase();
                // 空字符串是 HTML 布尔属性的标准写法（disabled=""）：与 attribute 路径一致，视为 true
                return s !== 'false' && s !== '0';
            }
            return Boolean(value);
        }

        case 'array': {
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) return parsed;
                } catch {
                    // 解析失败：保留原值，由组件或调用方决定如何处理
                }
            }
            return value;
        }

        case 'object': {
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (isObject(parsed)) return parsed;
                } catch {
                    // 同上
                }
            }
            return value;
        }

        case 'string':
            return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;

        default:
            return value;
    }
}

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
    extends HTMLElementBase
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

    // 框架驱动写入 prop 的嵌套深度（初始化默认值 / attribute → state / 属性升级）
    #propSyncDepth = 0;

    #createdCalled = false;
    #isActive = false;
    #needsRefresh = false;
    #propsInstalled = false;
    /** 是否已经历过首次连接：重挂载时不再重放 attribute → state */
    #hasConnected = false;

    // reflect ↔ attributeChangedCallback 循环保护
    #reflectingAttrs = new Set<string>();

    // attributeChanged 钩子执行期间抑制 property → attribute 镜像
    // 钩子内部可能为「属性别名」重建 $data（如 input 的 show-password/showpassword），
    // 若此时镜像回去会把组件刚移除的 attribute 重新写回，造成双属性互相复活。
    #attributeHookDepth = 0;

    // dispose 后禁止 reconnect
    #disposed = false;

    // 样式注入标记（防止 connect → disconnect → dispose 重复释放）
    #styleAttached = false;

    // 非 Shadow DOM 样式引用计数（用于组件卸载时清理）
    static #styleRefCount = new Map<string, number>();

    // 已作为组件初始数据使用过的对象（用于发现跨实例共享同一数据对象）
    static #usedDataObjects = new WeakSet<object>();

    // 用户自定义访问器缓存：prop name -> 原型链上的访问器描述符（无则为 null）
    #customAccessors = new Map<string, PropertyDescriptor | null>();

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
        while (proto && proto !== HTMLElementBase.prototype) {
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
                // 属性升级发生在挂载阶段，属于框架写入：保持静默，避免组件 setter 误派发事件
                this.#propSyncDepth++;
                try {
                    // 挂载前写入的值同样要按 manifest 类型规整（与 property 写入一致）
                    const propDesc = (this.#manifest as InternalManifest).propMap?.get(key);
                    (this as DataRecord)[key] = propDesc ? normalizePropValue(propDesc, value) : value;
                } finally {
                    this.#propSyncDepth--;
                }
            }
        }
    }

    /* -------------------- 初始化 -------------------- */
    #initData(data: TData) {
        if (IS_DEV && data && typeof data === 'object') {
            if (BaseElement.#usedDataObjects.has(data)) {
                console.warn(
                    `[Solely] <${this.#manifest.tagName}>: 该初始数据对象已被其他实例使用，` +
                        `$data 会共享同一响应式代理（改一个实例会同时触发另一个实例刷新）。` +
                        `如需实例隔离，请为每个实例传入新对象。`,
                );
            }
            BaseElement.#usedDataObjects.add(data);
        }

        const { proxy, dispose } = observe(data, (change: ChangeItem) => {
            // 只有顶层属性变更才允许镜像到 attribute。
            // 嵌套对象的变更会冒泡到 $data，但 payload.key 仍是子字段名；
            // 若直接用 key 查 propMap，`options[0].disabled = true` 会给宿主加上 disabled。
            const changePath = (change as { path?: Array<string | number> }).path;
            const isTopLevelChange = !Array.isArray(changePath) || changePath.length <= 1;

            if ((change.type === 'set' || change.type === 'array-replace') && isTopLevelChange) {
                const { key, newValue } = change;

                const manifest = this.#manifest as InternalManifest;
                const propKey = String(key);

                const desc = manifest.propMap?.get(propKey);

                if (desc) {
                    if (desc.reflect === true) {
                        // 显式声明 reflect：保持原有行为（含 object/array 的 JSON 反射）
                        this.#reflectToAttribute(desc, newValue);
                    } else if (
                        this.#propSyncDepth === 0 &&
                        this.#attributeHookDepth === 0 &&
                        this.#shouldMirrorAttribute(desc)
                    ) {
                        // 用户/property 写入：按默认规则镜像 attribute
                        this.#mirrorToAttribute(desc, newValue);
                    }
                }
            }

            if (this.#manifest.dataChangeEvent !== false) {
                this.emit('dataChange', {
                    ...change,
                });
            }

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

    /**
     * 判断某个 prop 在 property 写入后是否镜像回 attribute（默认镜像规则）
     *
     * attribute 与 property 两条写值路径不对称时，`el.name = 'x'` 只写 property，
     * 导致 `querySelectorAll('[name]')`、`getAttribute('name')` 等 attribute 视角的
     * 消费者（radio 分组、外部选择器、DevTools/SSR 调试）看不到这个值。
     *
     * 不镜像清单（新增组件时无需重复判断）：
     * 1. `reflect: false`：manifest 显式关闭反射（优先级最高）。
     * 2. `object` / `array`：复杂类型不把 JSON 写回 attribute，避免每次赋值产生大字符串，
     *    以及深层字段变更引发整段序列化。
     * 3. `MIRROR_EXCLUDED_PROPS`（当前为 `value` / `checked`）：由组件自行管理 attribute 语义。
     * 4. 框架驱动的写入（`#propSyncDepth > 0`）：初始化默认值、attribute → state、属性升级
     *    都以 attribute 为源头，再镜像回去会让所有带空字符串默认值的 prop 凭空多出空
     *    attribute，也可能覆盖用户手写的 attribute。该条件在调用处判断。
     * 5. 说明：`null` / `undefined` **不**属于排除项——`#mirrorToAttribute` 会移除同名
     *    attribute，保证「清空 property」时 DOM 与内部状态一致（F-10 / U-08）。
     * 6. `attributeChanged` 钩子执行期间（`#attributeHookDepth > 0`）：钩子可能基于
     *    attribute 组合重建 $data（属性别名），此时镜像会把组件刚移除的 attribute 写回。
     *    该条件同样在调用处判断。
     */
    #shouldMirrorAttribute(desc: PropDescriptor): boolean {
        if (desc.reflect === false) return false;
        if (desc.type === 'object' || desc.type === 'array') return false;
        return !MIRROR_EXCLUDED_PROPS.has(desc.name);
    }

    /**
     * 把 property 值镜像到 attribute
     *
     * 写入期间占用 `#reflectingAttrs`，`attributeChangedCallback` 会直接返回，
     * 因此不会形成 property → attribute → property 的回环，也不会重复触发
     * `attributeChanged` 钩子。
     */
    #mirrorToAttribute(desc: PropDescriptor, value: unknown) {
        const attrName = camelToKebab(desc.name);
        if (this.#reflectingAttrs.has(attrName)) return;

        this.#reflectingAttrs.add(attrName);
        try {
            // F-10 / U-08：清空 property 时同步移除镜像 attribute，保证 DOM 与内部状态一致，
            // 与显式 reflect 的 #reflectToAttribute 对齐；写入期间 reflectingAttrs 防止回环。
            if (value === null || value === undefined) {
                if (this.hasAttribute(attrName)) this.removeAttribute(attrName);
                return;
            }
            if (desc.type === 'boolean') {
                // HTML 布尔属性语义：false = 属性不存在
                if (value) {
                    this.setAttribute(attrName, '');
                } else {
                    this.removeAttribute(attrName);
                }
                return;
            }

            const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            this.setAttribute(attrName, strValue);
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

    /**
     * 查找用户在原型链上为某个 prop 定义的访问器（getter/setter）
     * 结果缓存，避免每次属性同步都遍历原型链
     */
    #getCustomAccessor(name: string): PropertyDescriptor | null {
        const cached = this.#customAccessors.get(name);
        if (cached !== undefined) return cached;

        let result: PropertyDescriptor | null = null;
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== HTMLElementBase.prototype) {
            const desc = Object.getOwnPropertyDescriptor(proto, name);
            if (desc) {
                result = desc.get || desc.set ? desc : null;
                break;
            }
            proto = Object.getPrototypeOf(proto);
        }

        this.#customAccessors.set(name, result);
        return result;
    }

    /**
     * 写入 prop 值
     * - 用户自定义了 setter：走 setter，保证其校验/格式化/派生逻辑不被绕过
     * - 否则：直接写入 $data
     *
     * 写入前按 manifest 声明的类型规整，保证 attribute 路径（初始化默认值、
     * attribute → state、属性升级）与 property 路径拿到同一种类型的值。
     */
    #writeProp(desc: PropDescriptor, value: unknown) {
        const next = normalizePropValue(desc, value);

        this.#propSyncDepth++;
        try {
            const accessor = this.#getCustomAccessor(desc.name);
            if (accessor?.set) {
                (this as Record<string, unknown>)[desc.name] = next;
            } else {
                (this.$data as DataRecord)[desc.name] = next;
            }
        } finally {
            this.#propSyncDepth--;
        }
    }

    /**
     * 框架是否正在同步 prop（组件初始化默认值、attribute → state、属性升级）
     *
     * 组件自定义 setter 可据此区分「框架写入」与「用户显式赋值」：
     * 初始化阶段应保持静默，避免挂载时派发 change 等事件。
     */
    protected get isSyncingProps(): boolean {
        return this.#propSyncDepth > 0;
    }

    #installReactiveProps() {
        const manifest = this.#manifest as InternalManifest;
        if (!manifest.attributeMap) return;

        for (const [, desc] of manifest.attributeMap) {
            // 跳过非响应式
            if (desc.reactive === false) continue;

            // 在覆盖前，先取出实例上可能存在的自有数据属性值。
            // 必须在自定义 accessor 分支之前处理，否则挂载期默认值会写入该自有属性，
            // 随后属性升级读到的是已被覆盖的默认值。
            const instanceDesc = Object.getOwnPropertyDescriptor(this, desc.name);
            if (instanceDesc && 'value' in instanceDesc) {
                // 先规整类型，与 property 写入路径一致
                const preAssigned = normalizePropValue(desc, instanceDesc.value);
                delete this[desc.name as keyof this];

                if (this.#getCustomAccessor(desc.name)?.set) {
                    // 先把原始值落库，保证后续默认值逻辑识别「用户已赋值」；
                    // 再走 setter 规范化，避免额外探测 setter 是否写入了 $data。
                    this.#propSyncDepth++;
                    try {
                        (this.$data as DataRecord)[desc.name] = preAssigned;
                    } finally {
                        this.#propSyncDepth--;
                    }
                    this.#writeProp(desc, preAssigned);
                } else {
                    (this.$data as DataRecord)[desc.name] = preAssigned;
                }
            }

            // 用户自定义 getter/setter：保持用户实现，不覆盖
            if (this.#getCustomAccessor(desc.name)) {
                continue;
            }

            // 无用户自定义：生成标准 getter/setter
            Object.defineProperty(this, desc.name, {
                get: () => (this.$data as DataRecord)[desc.name],
                set: val => {
                    // property 写入也走类型规整：el.rows = '4' 应得到 number 4
                    (this.$data as DataRecord)[desc.name] = normalizePropValue(desc, val);
                },
                configurable: true,
                enumerable: true,
            });
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

    #convertAttrValue(value: string | null, defaultValue: unknown, type?: PropType, attrName?: string) {
        if (value === null) {
            // 属性被移除：布尔回退到 default（未声明则 false，HTML 语义）；
            // 非布尔回退到 default（未声明则 undefined，F-10 清空语义）
            if (type === 'boolean') {
                return parseBooleanAttribute(null, typeof defaultValue === 'boolean' ? defaultValue : false);
            }
            return defaultValue;
        }

        switch (type) {
            case 'boolean':
                // 与 property 路径的 normalizePropValue 对齐：
                // "false" / "0"（大小写不敏感、trim 后）表示 false，
                // "" 及其他字符串仍按 HTML 语义视为 true。
                return parseBooleanAttribute(value);

            case 'number': {
                const n = Number(value);
                if (isNaN(n)) {
                    // 非法数字（如 count="99+"）不再静默回落，开发模式给出可定位的警告
                    this.warn(true, `attribute ${attrName ?? ''}="${value}" 不是合法数字，已回落到默认值 / 保留原值。`);
                    return defaultValue;
                }
                return n;
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
            // 不在 connectedCallback 中抛错：异常会冒泡到 appendChild/insertBefore 的调用方，
            // 把一次误操作放大成整棵渲染失败。这里只告警并移除。
            if (IS_DEV) {
                console.error(`[Solely] <${this.tagName.toLowerCase()}> has been disposed and cannot be reconnected.`);
            }
            this.remove();
            return;
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

            // 只在首次连接时重放 attribute → state。
            // 重挂载时 attribute 仍是初始值，重放会用旧值覆盖运行态
            // （例如 input 用户输入后 DOM 被移动/虚拟列表回收再挂回）。
            // 断开期间的 attribute 变更已由 attributeChangedCallback 同步。
            if (!this.#hasConnected) {
                for (const [attrName, desc] of manifest.attributeMap) {
                    const propName = desc.name; // 对应的驼峰或原始变量名

                    if (this.hasAttribute(attrName)) {
                        const raw = this.getAttribute(attrName);
                        const value = this.#convertAttrValue(
                            raw,
                            resolveDefaultValue(desc.default, this),
                            desc.type,
                            attrName,
                        );
                        this.#writeProp(desc, value);
                    } else if ('default' in desc) {
                        // 只有在 property 没有被设置过（比如通过 s-model）的情况下才使用默认值
                        // 检查 $data 中是否已经有值（非 undefined），有则保留，无则使用默认值
                        const currentValue = (this.$data as DataRecord)[propName];
                        if (currentValue === undefined) {
                            this.#writeProp(desc, resolveDefaultValue(desc.default, this));
                            // 对于布尔类型，如果默认值是 true，同步设置到 HTML 属性
                            if (desc.type === 'boolean' && desc.default === true) {
                                this.setAttribute(attrName, '');
                            }
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

        this.#hasConnected = true;
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
        // F-10：属性移除时回落到声明的默认值；未声明 default 的非布尔 prop 回落到
        // undefined（真正清空），不再沿用旧值；布尔属性未声明 default 时回落 false。
        // 属性存在但解析失败（如 number="abc"）时仍保留旧值，避免非法字符串误清空状态。
        const hasDefault = desc.default !== undefined;
        const resolvedDefault = hasDefault ? resolveDefaultValue(desc.default, this) : undefined;
        let fallback: unknown;
        if (newValue === null) {
            fallback = hasDefault ? resolvedDefault : desc.type === 'boolean' ? false : undefined;
        } else {
            fallback = hasDefault ? resolvedDefault : oldDataValue;
        }
        const next = this.#convertAttrValue(newValue, fallback, desc.type, name);

        // 3. 避免 primitive 类型的无意义更新（object/array 不适用 deep comparison）
        if (oldDataValue === next) return;

        // 4. 标记 attribute 更新（必须在赋值前设置，避免 observe → scheduleRefresh 先于标记执行）
        this.#isAttributeUpdate = true;
        // 走 #writeProp：用户自定义 setter 的 prop 不会被绕过
        this.#writeProp(desc, next);

        // 自定义 setter 可能不写 $data（这是支持的用法）：此时不会触发 observe，
        // 也就不会排队刷新。必须复位标记，否则下一次普通刷新会误触发属性生命周期钩子。
        if ((this.$data as DataRecord)[propName] === oldDataValue) {
            this.#isAttributeUpdate = false;
        }
        // 说明：这里假设 setter 同步写入 $data。若 setter 异步写入，复位后那次写入会走普通刷新，
        // 不再归类为 attribute 更新（不会悬挂，也不会误触发属性钩子）。

        // 钩子内可能基于 attribute 组合重建 $data（属性别名等），此时不应镜像回 attribute，
        // 否则会把组件刚移除的 attribute 重新写回（show-password/showpassword 会互相复活）。
        this.#attributeHookDepth++;
        try {
            this.attributeChanged(name, oldDataValue, next);
        } finally {
            this.#attributeHookDepth--;
        }
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
