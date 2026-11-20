/**
 * Solely 表单关联基座（0.8.0）
 *
 * 契约来源：`docs/architecture/contracts.md`（表单部分）；完整编号版见本地审计材料 `docs/internal/design-contracts.md`（不入库）。
 *
 * 本模块只提供“装配 + 同步”能力，不包含任何组件特化逻辑，也不注册到 `src/shared/index.ts`：
 * 它是组件内部工具，不是公开 API。
 *
 * 使用方式（组件在 `created()` 中调用，禁止在构造函数中调用）：
 *
 * ```ts
 * created(): void {
 *     initFormAssociation(this, {
 *         family: 'scalar',
 *         read: () => this.getValue(),
 *         write: (value, silent) => this.setValue(value as string, silent),
 *         encode: value => [String(value)],
 *         defaultValue: () => this.defaultValue,
 *         anchors: () => [this.$refs.input],
 *         disabled: () => this.$data.disabled,
 *         required: () => this.$data.required,
 *     });
 * }
 * ```
 */

/** change 事件的来源；静默路径（属性赋值 / 初始化）不派发事件，因此不会出现 `undefined` */
export type ChangeSource = 'user' | 'api' | 'reset';

/** 值族：决定 FormData 写入方式与默认比较规则 */
export type FormValueFamily = 'scalar' | 'boolean' | 'multiple';

/** 标量 detail：input / select 单选 / slider / rate / radio-group */
export interface ScalarChangeDetail<T = unknown> {
    name: string;
    value: T;
    previousValue: T;
    source: ChangeSource;
}

/** 布尔 detail：checkbox / switch / radio（value 保留原始值，不做 `'on'` 归一化） */
export interface BooleanChangeDetail {
    name: string;
    value: string;
    checked: boolean;
    previousChecked: boolean;
    source: ChangeSource;
}

/** 多值 detail：select multiple / 未来 tree */
export interface MultipleChangeDetail {
    name: string;
    value: string[];
    previousValue: string[];
    source: ChangeSource;
}

export type FormChangeDetail = ScalarChangeDetail | BooleanChangeDetail | MultipleChangeDetail;

/** 组件自身计算出的校验结果；返回 `null` 表示有效 */
export interface FormValidationResult {
    /** 只使用组件真正支持的标志（C-FORM-18） */
    flags: ValidityStateFlags;
    /** 显式消息；未提供时回退到 `invalidMessage` → 内置默认消息（D9） */
    message?: string;
    /** 校验锚点；必须与组件在同一个 shadow tree（C-FORM-17） */
    anchor?: HTMLElement;
}

/**
 * 组件与基座之间的适配器。
 *
 * 基座不读取组件的任何私有字段，所有值语义都由适配器提供，
 * 从而避免 `form-associated.ts` 反向依赖具体组件。
 */
export interface FormAdapter<T = unknown> {
    /** 值族；决定单值/多值与 `'' → 'on'` 归一化策略 */
    family: FormValueFamily;

    /** 读取当前值（必须与宿主 `value` / `checked` getter 保持一致） */
    read(): T;

    /**
     * 重置写回当前值。基座固定以 `silent = true` 调用（C-FORM-10），
     * 实现必须保证零事件。
     */
    write?(value: T, silent: true): void;

    /**
     * 生成 FormData 条目。
     * - 返回 `null` 或 `[]`：不产生提交条目（未选中 / 空选择）。
     * - 空字符串是否提交由组件决定：`input` 空值应返回 `['']`（§3.1），
     *   `select` 空值应返回 `null`。
     * - `family = 'boolean'` 时，基座会把条目中的 `''` 归一化为 `'on'`（D4），
     *   但 change detail 中的 `value` 仍是原始 `''`。
     */
    encode(value: T): string[] | null;

    /** 字段名；默认读取宿主的 `name` attribute（其次读取同名 property） */
    name?(): string;

    /** 作者声明的 disabled；**不包含** formDisabled（C-FORM-12） */
    disabled?(): boolean;

    /** required；用于 `aria-required` 与 valueMissing 判定 */
    required?(): boolean;

    /** ARIA 属性承载元素；默认宿主本身 */
    ariaTarget?(): Element | Element[] | null;

    /** 禁用时移出 Tab 序的元素；默认复用 `ariaTarget` */
    tabTargets?(): Element | Element[] | null;

    /** 校验锚点候选；默认复用 `ariaTarget` */
    anchors?(): HTMLElement[] | null;

    /** 计算约束校验；只在未禁用时调用（C-FORM-17） */
    validate?(value: T): FormValidationResult | null;

    /** valueMissing 的组件级默认消息（checkbox/switch/select 用各自文案） */
    missingMessage?(): string;

    /** `invalidMessage` 属性值；覆盖所有内置消息 */
    invalidMessage?(): string;

    /** 内置消息占位符替换（如 `{minlength}` / `{type}`）；未提供时保留占位符 */
    messageContext?(): Record<string, string | number>;

    /** 视觉错误态（如 `status === 'error'`），并入 `aria-invalid`（C-FORM-20） */
    hasVisualError?(): boolean;

    /** 显式重置目标；返回 `undefined` 表示未显式设置，由基座在首轮微任务捕获（C-FORM-09） */
    readDefault?(): T | undefined;

    /** 生成 change detail；标量族缺省时基座可直接构造，布尔/多值族必须提供 */
    changeDetail?(value: T, previousValue: T, source: ChangeSource): FormChangeDetail;
}

/** 内置中文默认消息（D9：0.8.0 不引入 locale，后续只替换本常量） */
export const FORM_VALIDATION_MESSAGES = {
    valueMissing: '请填写此项',
    valueMissingCheckbox: '请勾选此项',
    valueMissingSelect: '请选择一项',
    tooShort: '至少输入 {minlength} 个字符',
    tooLong: '最多输入 {maxlength} 个字符',
    typeMismatch: '请输入有效的{type}',
    patternMismatch: '输入格式不正确',
    badInput: '请输入有效内容',
} as const;

/** 内部状态：按元素缓存，保证 attachInternals 与重置目标只初始化一次 */
interface FormAssociationState {
    adapter: FormAdapter<unknown>;
    internals: ElementInternals | null;
    formDisabled: boolean;
    resetValue: unknown;
    resetCaptured: boolean;
    customMessage: string;
    tabSnapshots: Map<Element, string | null>;
}

const states = new WeakMap<HTMLElement, FormAssociationState>();
const internalsCache = new WeakMap<HTMLElement, ElementInternals | null>();

const DEFAULT_FLAG_ORDER: (keyof ValidityStateFlags)[] = [
    'valueMissing',
    'tooShort',
    'tooLong',
    'patternMismatch',
    'typeMismatch',
    'badInput',
];

function describeElement(el: HTMLElement): string {
    return `<${(el.tagName || 'element').toLowerCase()}>`;
}

function warn(el: HTMLElement, message: string): void {
    // 契约 C-FORM-02 要求 attachInternals 失败时必须 warn，不能静默降级。
    console.warn(`[${describeElement(el)}] ${message}`);
}

/* -------------------- internals -------------------- */

/**
 * `attachInternals()` 的唯一入口（C-FORM-02）。
 *
 * - 每个元素只调用一次，结果（包括失败时的 `null`）缓存在 `WeakMap`。
 * - 禁止在构造函数中调用；组件必须在 `created()` 里通过 `initFormAssociation` 进入。
 * - 失败时告警并降级为“不参与表单”，后续同步函数均为安全空操作。
 */
export function attachInternals(el: HTMLElement): ElementInternals | null {
    if (internalsCache.has(el)) {
        return internalsCache.get(el) ?? null;
    }

    let internals: ElementInternals | null = null;
    const attach = (el as HTMLElement & { attachInternals?: () => ElementInternals }).attachInternals;

    if (typeof attach !== 'function') {
        warn(el, '当前环境不支持 attachInternals()，表单关联已降级为不参与表单。');
    } else {
        try {
            internals = attach.call(el);
        } catch (error) {
            warn(
                el,
                `attachInternals() 调用失败，表单关联已降级为不参与表单：${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            internals = null;
        }
    }

    internalsCache.set(el, internals);
    return internals;
}

/** 读取已缓存的 internals；不会触发 attachInternals */
function getCachedInternals(el: HTMLElement): ElementInternals | null {
    return internalsCache.get(el) ?? null;
}

/**
 * 获取表单 owner（C-FORM-03 的 form owner 语义）。
 *
 * 优先级：
 * 1. `ElementInternals.form`（浏览器维护，支持 `form="id"` 与动态换 form）；
 * 2. 回退到同一 tree 内最近的 `<form>` 祖先。
 *
 * 回退路径刻意不跨 shadow 边界：原生表单关联本身就只在同一 tree 内成立，
 * 跨 shadow 的 `<form>` 不属于该元素的 form owner。
 */
export function getFormOwner(el: HTMLElement): HTMLFormElement | null {
    const internals = getCachedInternals(el);
    if (internals) {
        const form = internals.form;
        if (form) return form;
    }

    return el.closest('form');
}

function supportsFormValue(internals: ElementInternals | null): internals is ElementInternals {
    return !!internals && typeof (internals as { setFormValue?: unknown }).setFormValue === 'function';
}

function supportsValidity(internals: ElementInternals | null): internals is ElementInternals {
    return !!internals && typeof (internals as { setValidity?: unknown }).setValidity === 'function';
}

/* -------------------- 基础工具 -------------------- */

function toElements(targets: Element | Element[] | null | undefined): Element[] {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : [targets];
}

function resolveName(el: HTMLElement, adapter: FormAdapter<unknown>): string {
    if (adapter.name) {
        const name = adapter.name();
        if (typeof name === 'string') return name;
    }

    const attr = el.getAttribute('name');
    if (attr !== null) return attr;

    const prop = (el as HTMLElement & { name?: unknown }).name;
    return typeof prop === 'string' ? prop : '';
}

/**
 * 有效禁用态（C-FORM-12）：作者 disabled 与 formDisabled 的 OR。
 *
 * 只读取适配器提供的作者态，**绝不**把 formDisabled 写回组件的 disabled。
 */
export function effectiveDisabled(el: HTMLElement): boolean {
    const state = states.get(el);
    if (!state) return false;

    return !!state.adapter.disabled?.() || state.formDisabled;
}

/* -------------------- 值同步 -------------------- */

/**
 * 同步提交值（C-FORM-05 / C-FORM-06 / C-FORM-07）。
 *
 * - 未初始化 / 环境不支持 `setFormValue`：安全空操作（jsdom 属于此列）。
 * - `name` 为空：不产生条目，但仍参与校验（C-FORM-01 注）。
 * - `effectiveDisabled`：`setFormValue(null)`。
 * - 单值：`setFormValue(entry[0], null)`。
 * - 多值：`new FormData()` 逐条 `append(name, value)` 后 `setFormValue(fd, null)`。
 * - 布尔族：条目中的 `''` 归一化为 `'on'`，仅发生在 FormData 边界。
 */
export function syncFormValue(el: HTMLElement): void {
    const state = states.get(el);
    if (!state || !supportsFormValue(state.internals)) return;

    const name = resolveName(el, state.adapter);
    const value = state.adapter.read();

    if (effectiveDisabled(el) || !name) {
        state.internals.setFormValue(null, null);
        return;
    }

    let entries = state.adapter.encode(value);
    if (!entries || entries.length === 0) {
        state.internals.setFormValue(null, null);
        return;
    }

    if (state.adapter.family === 'boolean') {
        entries = entries.map(entry => (entry === '' ? 'on' : entry));
    }

    if (state.adapter.family === 'multiple') {
        const formData = new FormData();
        for (const entry of entries) {
            formData.append(name, entry);
        }
        state.internals.setFormValue(formData, null);
        return;
    }

    state.internals.setFormValue(entries[0], null);
}

function firstFailingFlag(flags: ValidityStateFlags): keyof ValidityStateFlags | null {
    for (const flag of DEFAULT_FLAG_ORDER) {
        if (flags[flag]) return flag;
    }
    return null;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
    );
}

function resolveValidationMessage(state: FormAssociationState, flags: ValidityStateFlags, explicit?: string): string {
    const adapter = state.adapter;
    const invalidMessage = adapter.invalidMessage?.();
    const flag = firstFailingFlag(flags);

    if (explicit) return explicit;
    if (invalidMessage) return invalidMessage;
    if (!flag) return '';

    const template =
        flag === 'valueMissing'
            ? adapter.missingMessage?.() || FORM_VALIDATION_MESSAGES.valueMissing
            : FORM_VALIDATION_MESSAGES[flag as keyof typeof FORM_VALIDATION_MESSAGES] || '';

    return interpolate(template, adapter.messageContext?.());
}

function resolveAnchor(state: FormAssociationState, explicit?: HTMLElement): HTMLElement | undefined {
    if (explicit) return explicit;

    const anchors = state.adapter.anchors?.();
    if (anchors && anchors.length > 0) return anchors[0];

    const targets = toElements(state.adapter.ariaTarget?.());
    return targets.length > 0 ? (targets[0] as HTMLElement) : undefined;
}

/**
 * 同步约束校验（C-FORM-17 / C-FORM-18 / C-FORM-19）。
 *
 * 自定义消息通过 `setCustomValidity` 保存在基座状态中，再与组件标志合并，
 * 避免 `setValidity({})` 覆盖用户消息（原生 `setCustomValidity` 不存在于 ElementInternals）。
 * 禁用时按 C-FORM-13 清空标志，但保留自定义消息，重新启用后恢复。
 */
export function syncValidity(el: HTMLElement): void {
    const state = states.get(el);
    if (!state || !supportsValidity(state.internals)) return;

    if (effectiveDisabled(el)) {
        state.internals.setValidity({});
        return;
    }

    const value = state.adapter.read();
    const result = state.adapter.validate?.(value) ?? null;

    const flags: ValidityStateFlags = { ...(result?.flags ?? {}) };
    if (state.customMessage) flags.customError = true;

    // 不能只检查固定标志位：rangeUnderflow / rangeOverflow / stepMismatch 等
    // 由组件自行上报的标志同样需要参与校验，否则会被 setValidity({}) 静默清空。
    const hasFlags = Object.values(flags).some(Boolean);
    if (!hasFlags) {
        state.internals.setValidity({});
        return;
    }

    const message = state.customMessage || resolveValidationMessage(state, flags, result?.message);
    const anchor = resolveAnchor(state, result?.anchor);

    state.internals.setValidity(flags, message, anchor);
}

/**
 * 设置自定义错误消息（组件 `setCustomValidity()` 委托到这里）。
 *
 * 传空字符串清除。消息优先级：自定义消息 > `invalidMessage` > 内置默认（C-FORM-19）。
 */
export function setCustomValidity(el: HTMLElement, message: string): void {
    const state = states.get(el);
    if (!state) {
        warn(el, 'setCustomValidity() 必须在 initFormAssociation() 之后调用。');
        return;
    }

    state.customMessage = typeof message === 'string' ? message : '';
    syncValidity(el);
}

/* -------------------- ARIA -------------------- */

function isInvalid(state: FormAssociationState): boolean {
    // `ValidityState` 标准字段是 `valid`；契约文中的 `validity.invalid` 不是 DOM 标准字段。
    // 两者都兼容，避免替身实现（测试 / 旧解释器）只提供其中之一时失效。
    const validity = state.internals?.validity as (ValidityState & { invalid?: boolean }) | undefined;
    let invalid = false;
    if (validity) {
        if (typeof validity.invalid === 'boolean') {
            invalid = validity.invalid;
        } else if (typeof validity.valid === 'boolean') {
            invalid = !validity.valid;
        }
    }
    return invalid || !!state.adapter.hasVisualError?.();
}

/**
 * 同步 ARIA（C-FORM-20）。
 *
 * - `aria-required`：适配器 `required()`。
 * - `aria-invalid`：`internals.validity.invalid` 或视觉错误态。
 * - `aria-disabled`：`effectiveDisabled`。
 *
 * 只写属性，不派发事件；默认作用在宿主上，组件可通过 `ariaTarget` 指定承载 `role` 的节点。
 */
export function syncAria(el: HTMLElement): void {
    const state = states.get(el);
    if (!state) return;

    const targets = toElements(state.adapter.ariaTarget?.() ?? el);
    if (targets.length === 0) return;

    const required = !!state.adapter.required?.();
    const disabled = effectiveDisabled(el);
    const invalid = isInvalid(state);

    for (const target of targets) {
        target.setAttribute('aria-required', required ? 'true' : 'false');
        target.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        target.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    }
}

/* -------------------- 事件 -------------------- */

function isBooleanDetail(detail: FormChangeDetail): detail is BooleanChangeDetail {
    return typeof (detail as BooleanChangeDetail).checked === 'boolean';
}

function isMultipleDetail(detail: FormChangeDetail): detail is MultipleChangeDetail {
    return Array.isArray((detail as MultipleChangeDetail).value);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, index) => Object.is(item, b[index]));
}

/**
 * 统一派发 `change`（C-FORM-23）。
 *
 * - 值未变化时**绝不派发**（C-FORM-21）；按 detail 形状判断值族并比较：
 *   布尔比较 `checked`，多值按顺序逐项比较，标量用 `Object.is`。
 * - 事件由宿主派发：`CustomEvent`、`bubbles: true`、`composed: true`、`cancelable: false`。
 * - `source` 由调用方决定，基座不做推断：
 *   - `'user'`：用户交互（点击 / 输入 / 键盘 / 拖拽）；
 *   - `'api'`：显式 `setValue(v, false)` / `setChecked(v, false)`；
 *   - `'reset'`：仅由 `formResetCallback` → `resetFormControl` 使用。
 * - 返回是否真正派发，便于组件短路后续逻辑。
 */
export function emitChange(el: HTMLElement, detail: FormChangeDetail): boolean {
    if (!detail || !detail.source) return false;

    if (isBooleanDetail(detail)) {
        if (detail.checked === detail.previousChecked) return false;
    } else if (isMultipleDetail(detail)) {
        if (arraysEqual(detail.value, detail.previousValue)) return false;
    } else if (Object.is(detail.value, detail.previousValue)) {
        return false;
    }

    el.dispatchEvent(
        new CustomEvent('change', {
            detail,
            bubbles: true,
            composed: true,
            cancelable: false,
        }),
    );
    return true;
}

/* -------------------- 生命周期委托 -------------------- */

function buildChangeDetail(
    el: HTMLElement,
    state: FormAssociationState,
    previousValue: unknown,
    value: unknown,
    source: ChangeSource,
): FormChangeDetail | null {
    if (state.adapter.changeDetail) {
        return state.adapter.changeDetail(value, previousValue, source);
    }

    // 标量族可由基座直接构造；布尔/多值族语义依赖组件字段，必须由适配器提供。
    if (state.adapter.family === 'scalar') {
        return {
            name: resolveName(el, state.adapter),
            value,
            previousValue,
            source,
        };
    }

    return null;
}

function ensureResetValue(state: FormAssociationState): unknown {
    if (!state.resetCaptured) {
        state.resetValue = state.adapter.read();
        state.resetCaptured = true;
    }
    return state.resetValue;
}

/**
 * 重置（C-FORM-10 / C-FORM-11）。
 *
 * 时序：读取重置目标 → silent 写回 → syncFormValue → syncValidity → syncAria →
 * 值确实变化时派发一次 `change`（`source: 'reset'`）。
 * 不派发 `input`；禁用态也写回并按需派发（受控数据需要同步）。
 */
export function resetFormControl(el: HTMLElement): void {
    const state = states.get(el);
    if (!state) return;

    const adapter = state.adapter;
    if (!adapter.write) {
        warn(el, '重置需要适配器提供 write()；本次 formResetCallback 被忽略。');
        return;
    }

    const previousValue = adapter.read();
    const target = ensureResetValue(state);

    adapter.write(target, true);
    state.customMessage = '';

    syncFormValue(el);
    syncValidity(el);
    syncAria(el);

    const detail = buildChangeDetail(el, state, previousValue, adapter.read(), 'reset');
    if (detail) emitChange(el, detail);
}

function lockTabOrder(state: FormAssociationState): void {
    const targets = toElements(state.adapter.tabTargets?.() ?? state.adapter.ariaTarget?.() ?? null);

    for (const target of targets) {
        if (!state.tabSnapshots.has(target)) {
            state.tabSnapshots.set(target, target.getAttribute('tabindex'));
        }
        target.setAttribute('tabindex', '-1');
    }
}

function restoreTabOrder(state: FormAssociationState): void {
    for (const [target, previous] of state.tabSnapshots) {
        if (previous === null) {
            target.removeAttribute('tabindex');
        } else {
            target.setAttribute('tabindex', previous);
        }
    }
    state.tabSnapshots.clear();
}

/**
 * 禁用级联（C-FORM-13）。
 *
 * - 只记录 `formDisabled`，**不写回**作者 `disabled`，因此 fieldset 重新启用后可恢复。
 * - 禁用：`setFormValue(null)`、`setValidity({})`、`aria-disabled="true"`、承载交互元素 `tabindex="-1"`。
 * - 启用：恢复 `tabindex`，重新同步值 / 有效性 / ARIA。
 * - 不清空值，不派发 `change`。
 */
export function setFormDisabled(el: HTMLElement, disabled: boolean): void {
    const state = states.get(el);
    if (!state) return;

    state.formDisabled = !!disabled;

    if (effectiveDisabled(el)) {
        if (supportsFormValue(state.internals)) state.internals.setFormValue(null, null);
        if (supportsValidity(state.internals)) state.internals.setValidity({});
        syncAria(el);
        lockTabOrder(state);
        refreshForDisabled(el);
        return;
    }

    restoreTabOrder(state);
    syncFormValue(el);
    syncValidity(el);
    syncAria(el);
    refreshForDisabled(el);
}

/**
 * fieldset 级禁用改变后重跑一次渲染，让模板里读取 `effectiveDisabled()` 的
 * 原生 disabled / is-disabled 类名与内核同一步生效（shadow 内部控件不会被 fieldset 自动禁用）。
 */
function refreshForDisabled(el: HTMLElement): void {
    const refresh = (el as HTMLElement & { refresh?: () => void }).refresh;
    if (typeof refresh === 'function') refresh.call(el);
}

/** `formAssociatedCallback` 的委托骨架（C-FORM-03）：换 form owner 后重算提交值与有效性 */
export function handleFormAssociatedCallback(el: HTMLElement): void {
    syncFormValue(el);
    syncValidity(el);
}

/** `formResetCallback` 的委托骨架 */
export function handleFormResetCallback(el: HTMLElement): void {
    resetFormControl(el);
}

/** `formDisabledCallback` 的委托骨架 */
export function handleFormDisabledCallback(el: HTMLElement, disabled: boolean): void {
    setFormDisabled(el, disabled);
}

/* -------------------- 装配 -------------------- */

/**
 * 统一装配（C-FORM-02 / C-FORM-09）。
 *
 * 组件必须在 `created()` 中调用，**禁止在构造函数中调用**。
 *
 * 职责：
 * 1. 调用一次 `attachInternals()` 并缓存结果；
 * 2. 建立适配器状态；
 * 3. 初始化重置目标：显式 `readDefault()` 立即生效，否则在首个 microtask
 *    （首轮属性同步结束后的最小安全点）捕获一次当前值，之后不再随交互变化；
 * 4. 在同一 microtask 完成首次 `syncFormValue → syncValidity → syncAria`。
 *
 * 重复调用会告警并保留第一次的适配器。
 */
export function initFormAssociation<T>(el: HTMLElement, adapter: FormAdapter<T>): void {
    if (states.has(el)) {
        warn(el, 'initFormAssociation() 重复调用；已保留首次装配的适配器。');
        return;
    }

    const internals = attachInternals(el);
    const state: FormAssociationState = {
        adapter: adapter as FormAdapter<unknown>,
        internals,
        formDisabled: false,
        resetValue: undefined,
        resetCaptured: false,
        customMessage: '',
        tabSnapshots: new Map(),
    };
    states.set(el, state);

    const explicitDefault = adapter.readDefault?.();
    if (explicitDefault !== undefined) {
        state.resetValue = explicitDefault;
        state.resetCaptured = true;
    }

    queueMicrotask(() => {
        // 元素可能已 init 失败或已被重新装配（防御性检查，避免写旧状态）
        if (states.get(el) !== state) return;

        if (!state.resetCaptured) {
            state.resetValue = state.adapter.read();
            state.resetCaptured = true;
        }

        syncFormValue(el);
        syncValidity(el);
        syncAria(el);
    });
}

/**
 * 显式更新重置目标（C-FORM-09：`defaultValue` / `defaultChecked` 被赋值时立即替换）。
 *
 * 只更新重置目标，不同步当前值、不派发事件。
 */
export function setFormDefault<T>(el: HTMLElement, value: T): void {
    const state = states.get(el);
    if (!state) return;

    state.resetValue = value;
    state.resetCaptured = true;
}

/* -------------------- 公开 API 代理 -------------------- */

/** 无 internals 或宿主未同步时的只读快照，避免公开 API 返回 undefined（C-FORM-16 降级） */
const EMPTY_VALIDITY: ValidityState = {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valid: true,
    valueMissing: false,
};

/** 代理 `internals.validity`；jsdom 等环境没有该字段时返回全 false 快照 */
export function formValidity(el: HTMLElement): ValidityState {
    return getCachedInternals(el)?.validity ?? EMPTY_VALIDITY;
}

/** 代理 `internals.validationMessage` */
export function formValidationMessage(el: HTMLElement): string {
    const message = getCachedInternals(el)?.validationMessage;
    return typeof message === 'string' ? message : '';
}

/** 代理 `internals.checkValidity()`；环境不支持时视为有效 */
export function checkFormValidity(el: HTMLElement): boolean {
    const internals = getCachedInternals(el);
    return typeof internals?.checkValidity === 'function' ? internals.checkValidity() : true;
}

/** 代理 `internals.reportValidity()`；环境不支持时视为有效 */
export function reportFormValidity(el: HTMLElement): boolean {
    const internals = getCachedInternals(el);
    return typeof internals?.reportValidity === 'function' ? internals.reportValidity() : true;
}
