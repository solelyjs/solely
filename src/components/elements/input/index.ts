/**
 * Solely Input 组件
 * 基础输入框组件，支持多种类型和状态
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { parseBooleanAttribute } from '../../../shared/boolean';
import { oneOf } from '../../../shared/enum';
import {
    emitChange,
    effectiveDisabled,
    formValidity,
    formValidationMessage,
    checkFormValidity,
    reportFormValidity,
    handleFormAssociatedCallback,
    handleFormDisabledCallback,
    handleFormResetCallback,
    initFormAssociation,
    setCustomValidity as setControlCustomValidity,
    setFormDefault,
    syncAria,
    syncFormValue,
    syncValidity,
    type FormValidationResult,
} from '../../../shared/form-associated';
import type { InputInternalState, InputProps, InputRefs, InputSize, InputStatus } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** 消息区 id 自增序号，用于 aria-describedby */
let inputUid = 0;

/** 状态白名单：非法值回退到空状态，避免 is-error / aria-invalid 被拼写错误误触发 */
const INPUT_STATUSES: readonly InputStatus[] = ['error', 'warning', 'success', ''];

@CustomElement({
    tagName: 'solely-input',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'text' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'ariaLabel', type: 'string', default: '' },
        { name: 'name', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'defaultValue', type: 'string', default: '' },
        { name: 'placeholder', type: 'string', default: '' },
        { name: 'disabled', type: 'boolean', default: false, reflect: true },
        { name: 'readonly', type: 'boolean', default: false, reflect: true },
        { name: 'required', type: 'boolean', default: false, reflect: true },
        { name: 'invalidMessage', type: 'string', default: '' },
        { name: 'maxlength', type: 'number' },
        { name: 'minlength', type: 'number' },
        { name: 'clearable', type: 'boolean', default: false },
        { name: 'showPassword', type: 'boolean', default: false },
        // 兼容旧属性名 <solely-input showpassword>
        { name: 'showpassword', type: 'boolean' },
        { name: 'prefix', type: 'string', default: '' },
        { name: 'suffix', type: 'string', default: '' },
        { name: 'status', type: 'string', default: '' },
        { name: 'message', type: 'string', default: '' },
        { name: 'showCount', type: 'boolean', default: false },
        // 兼容旧属性名 <solely-input showcount>
        { name: 'showcount', type: 'boolean' },
        { name: 'rows', type: 'number', default: 3 },
        { name: 'autofocus', type: 'boolean', default: false },
        { name: 'selectAll', type: 'boolean', default: false },
        // 兼容旧属性名 <solely-input selectall>
        { name: 'selectall', type: 'boolean' },
        { name: 'copyable', type: 'boolean', default: false },
        { name: 'format', type: 'string', default: 'none' },
        { name: 'suggestions', type: 'array', default: [] },
        { name: 'block', type: 'boolean', default: false },
        { name: 'addonBefore', type: 'string', default: '' },
        { name: 'addonAfter', type: 'string', default: '' },
        { name: 'autosize', type: 'boolean', default: false },
        { name: 'autocomplete', type: 'string', default: '' },
        { name: 'inputmode', type: 'string', default: '' },
        { name: 'enterkeyhint', type: 'string', default: '' },
        { name: 'spellcheck', type: 'string', default: '' },
        { name: 'min', type: 'number' },
        { name: 'max', type: 'number' },
        { name: 'step', type: 'number' },
    ],
})
class SolelyInput extends BaseElement<InputProps & InputInternalState, InputRefs> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): InputSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 表单关联自定义元素（C-FORM-01）；必须声明在原始类上，装饰器生成的子类会自动继承 */
    static readonly formAssociated = true;

    /** @deprecated 旧属性名兼容，请使用 showPassword */
    get showpassword(): boolean {
        return !!this.$data.showPassword;
    }

    set showpassword(value: boolean) {
        this.$data.showPassword = !!value;
    }

    /** @deprecated 旧属性名兼容，请使用 showCount */
    get showcount(): boolean {
        return !!this.$data.showCount;
    }

    set showcount(value: boolean) {
        this.$data.showCount = !!value;
    }

    /** @deprecated 旧属性名兼容，请使用 selectAll */
    get selectall(): boolean {
        return !!this.$data.selectAll;
    }

    set selectall(value: boolean) {
        this.$data.selectAll = !!value;
    }

    /** 过滤后的搜索建议 */
    private _filteredSuggestions: string[] = [];
    /** 缓存输入框 DOM 引用 */
    private inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
    /** 搜索防抖定时器 */
    private searchDebounceTimer?: number;
    /** 聚焦时的值快照，供原生 change 事件计算 previousValue */
    private valueBeforeChange?: string;
    /** 消息区唯一 id（aria-describedby 目标） */
    private readonly _messageId = `solely-input-message-${++inputUid}`;

    /**
     * 接入表单关联基座（C-FORM-02 / C-FORM-09）
     */
    created(): void {
        initFormAssociation(this, {
            family: 'scalar',
            read: () => this.getValue(),
            write: (value, _silent) => this.setValue(String(value), true),
            // input 空值也要提交空字符串（§3.1），因此始终返回一条记录
            encode: value => [String(value)],
            name: () => this.formFieldName(),
            disabled: () => !!this.$data.disabled,
            required: () => !!this.$data.required,
            ariaTarget: () => this.getNativeControl(),
            tabTargets: () => this.getNativeControl(),
            anchors: () => {
                const control = this.getNativeControl();
                return control ? [control] : null;
            },
            validate: value => this.validateValue(String(value)),
            invalidMessage: () => this.$data.invalidMessage || '',
            messageContext: () => this.buildMessageContext(),
            hasVisualError: () => this.getStatus() === 'error',
            readDefault: () => this.readExplicitDefaultValue(),
            changeDetail: (value, previousValue, source) => ({
                name: this.formFieldName(),
                value,
                previousValue,
                source,
            }),
        });
    }

    formAssociatedCallback(): void {
        handleFormAssociatedCallback(this);
    }

    formResetCallback(): void {
        handleFormResetCallback(this);
    }

    formDisabledCallback(disabled: boolean): void {
        handleFormDisabledCallback(this, disabled);
    }

    /** 公开有效性代理（C-FORM-16） */
    get validity(): ValidityState {
        return formValidity(this);
    }

    get validationMessage(): string {
        return formValidationMessage(this);
    }

    /** disabled / readonly 时不参与约束校验 */
    get willValidate(): boolean {
        return !effectiveDisabled(this) && !this.$data.readonly;
    }

    checkValidity(): boolean {
        return checkFormValidity(this);
    }

    reportValidity(): boolean {
        return reportFormValidity(this);
    }

    setCustomValidity(message: string): void {
        setControlCustomValidity(this, message);
    }

    /**
     * 同步值 / 有效性 / ARIA（C-FORM-04）
     */
    private syncFormState(): void {
        syncFormValue(this);
        syncValidity(this);
        syncAria(this);
    }

    /** 获取 shadow DOM 内的原生输入控件 */
    private getNativeControl(): HTMLInputElement | HTMLTextAreaElement | null {
        if (this.inputElement?.isConnected) return this.inputElement;
        return (
            (this.shadowRoot?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null) ?? null
        );
    }

    /** 读取显式 defaultValue；未显式设置时返回 undefined，由基座捕获初始值 */
    private readExplicitDefaultValue(): string | undefined {
        const attr = this.getAttribute('default-value');
        if (attr !== null) return attr;
        const value = this.$data.defaultValue;
        return typeof value === 'string' && value !== '' ? value : undefined;
    }

    /** 字段名：property 优先，其次 attribute */
    private formFieldName(): string {
        return this.$data.name || this.getAttribute('name') || '';
    }

    /** 计算约束校验（C-FORM-18：只使用组件真正支持的标志） */
    private validateValue(value: string): FormValidationResult | null {
        if (this.$data.readonly) return null;

        const flags: ValidityStateFlags = {};
        const minlength = Number(this.$data.minlength);
        const maxlength = Number(this.$data.maxlength);

        if (this.$data.required && value === '') {
            flags.valueMissing = true;
        } else {
            if (minlength > 0 && value.length < minlength) flags.tooShort = true;
            if (maxlength > 0 && value.length > maxlength) flags.tooLong = true;
        }

        const nativeValidity = this.getNativeControl()?.validity;
        if (nativeValidity) {
            if (nativeValidity.typeMismatch) flags.typeMismatch = true;
            if (nativeValidity.patternMismatch) flags.patternMismatch = true;
            if (nativeValidity.badInput) flags.badInput = true;
        }

        const hasFlags = Object.values(flags).some(Boolean);
        if (!hasFlags) return null;

        const control = this.getNativeControl();
        return { flags, anchor: control ?? undefined };
    }

    /** 内置消息占位符 */
    private buildMessageContext(): Record<string, string | number> {
        const context: Record<string, string | number> = { type: this.$data.type };
        const minlength = Number(this.$data.minlength);
        const maxlength = Number(this.$data.maxlength);
        if (minlength > 0) context.minlength = minlength;
        if (maxlength > 0) context.maxlength = maxlength;
        return context;
    }

    /**
     * 获取过滤后的搜索建议（供模板使用）
     */
    get filteredSuggestions(): string[] {
        return this._filteredSuggestions;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
        this.inputElement = this.shadowRoot?.querySelector('input, textarea') as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null;
        if (this.$data.autofocus) {
            this.focus();
        }
        this.syncNativeAttributes();
        this.adjustAutosize();
    }

    unmounted(): void {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = undefined;
        }
    }

    /**
     * 每次状态变化后统一同步（含 name / required / status / readonly 等 attribute 路径）
     */
    updated(): void {
        this.syncNativeAttributes();
        this.syncFormState();
        this.adjustAutosize();
    }

    /**
     * 消息区 id：仅在展示 message 时交给 aria-describedby
     */
    getMessageId(): string | undefined {
        return this.$data.message ? this._messageId : undefined;
    }

    /**
     * 外层分组（addonBefore / addonAfter）class
     */
    getGroupClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.addonBefore) classes['form-control-group--addon-before'] = true;
        if (this.$data.addonAfter) classes['form-control-group--addon-after'] = true;
        return classes;
    }

    /**
     * 把 input / textarea 通用的原生属性透传到真实控件。
     * 走 setAttribute 而不是模板绑定，避免自定义元素属性名与 DOM property 命名差异。
     */
    private syncNativeAttributes(): void {
        const control = this.getNativeControl();
        if (!control) return;

        const stringAttrs: Array<[string, string]> = [
            ['autocomplete', this.$data.autocomplete],
            ['inputmode', this.$data.inputmode],
            ['enterkeyhint', this.$data.enterkeyhint],
        ];
        for (const [name, value] of stringAttrs) {
            if (value === '' || value == null) {
                control.removeAttribute(name);
            } else {
                control.setAttribute(name, value);
            }
        }

        const spellcheck = this.$data.spellcheck;
        if (spellcheck === '' || spellcheck == null) {
            if (control.hasAttribute('spellcheck')) control.removeAttribute('spellcheck');
        } else {
            control.setAttribute('spellcheck', spellcheck === 'false' ? 'false' : 'true');
        }

        const numberAttrs: Array<[string, unknown]> = [
            ['min', this.$data.min],
            ['max', this.$data.max],
            ['step', this.$data.step],
        ];
        for (const [name, value] of numberAttrs) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                control.setAttribute(name, String(value));
            } else {
                control.removeAttribute(name);
            }
        }
    }

    /**
     * textarea 随内容自动增高（autosize）
     */
    private adjustAutosize(): void {
        if (!this.$data.autosize || this.$data.type !== 'textarea') return;
        const control = this.getNativeControl();
        if (!control || control.tagName !== 'TEXTAREA') return;
        const textarea = control as HTMLTextAreaElement;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    /**
     * 检查是否有 prefix 插槽
     */
    hasPrefixSlot(): boolean {
        return this.querySelector('[slot="prefix"]') !== null;
    }

    /**
     * 检查是否有 suffix 插槽
     */
    hasSuffixSlot(): boolean {
        return this.querySelector('[slot="suffix"]') !== null;
    }

    /**
     * 模板与交互统一读取：作者 disabled 与 fieldset 级联禁用的合并结果。
     */
    isEffectivelyDisabled(): boolean {
        return effectiveDisabled(this);
    }

    /**
     * 右侧动作区是否存在任一装饰按钮（密码显示 / 复制 / 清空）。
     * 模板据此决定是否渲染 .form-control__actions 容器，
     * 避免容器为空时也占用 margin 与布局位置，导致输入框右内边距视觉不齐。
     */
    hasActions(): boolean {
        const disabled = this.isEffectivelyDisabled();
        const hasValue = !!this.$data.value;

        const withPassword = this.$data.type === 'password' && !!this.$data.showPassword;
        const withCopy = !!this.$data.copyable && hasValue && !disabled;
        const withClear = !!this.$data.clearable && hasValue && !this.$data.readonly && !disabled;

        return withPassword || withCopy || withClear;
    }

    /**
     * 归一化状态：只接受 error / warning / success，其它值一律视为“无状态”
     */
    getStatus(): InputStatus {
        return oneOf(this.$data.status, INPUT_STATUSES, '');
    }

    /**
     * 获取 wrapper class 对象
     */
    getWrapperClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['form-control--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['form-control--lg'] = true;
        }
        // 状态映射
        const status = this.getStatus();
        if (status === 'error') {
            classes['is-error'] = true;
        } else if (status === 'warning') {
            classes['is-warning'] = true;
        } else if (status === 'success') {
            classes['is-success'] = true;
        }
        if (this.$data.type === 'textarea') {
            classes['form-control--textarea'] = true;
        }
        if (this.$data.autosize && this.$data.type === 'textarea') {
            classes['form-control--autosize'] = true;
        }
        classes['is-focused'] = !!this.$data.focused;
        classes['is-disabled'] = this.isEffectivelyDisabled();
        classes['is-readonly'] = !!this.$data.readonly;
        classes['form-control--block'] = !!this.$data.block;
        return classes;
    }

    /**
     * 获取当前字符数
     */
    getCharCount(): number {
        return this.$data.value?.length || 0;
    }

    /**
     * 格式化输入值
     */
    formatValue(value: string): string {
        if (!value) return '';
        switch (this.$data.format) {
            case 'phone':
                // 手机号：138 1234 5678（3-4-4格式）
                return value.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3').trim();
            case 'bankcard':
                // 银行卡：1234 5678 9012 3456
                return value.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
            case 'idcard':
                // 身份证：123456 7890 1234 5678 90
                return value.replace(/(\d{6})(\d{4})(\d{4})(\d{4})(\d{0,4})/, '$1 $2 $3 $4 $5').trim();
            default:
                return value;
        }
    }

    /**
     * 反格式化（去除空格）
     */
    unformatValue(value: string): string {
        if (!value) return '';
        return value.replace(/\s/g, '');
    }

    /**
     * 输入事件处理
     */
    handleInput(event: InputEvent): void {
        const target = event.target as HTMLInputElement;
        let value = target.value;

        // 处理格式化
        if (this.$data.format !== 'none' && this.$data.type !== 'textarea') {
            const unformatted = this.unformatValue(value);
            const formatted = this.formatValue(unformatted);
            // 只有在值真正改变时才更新，避免循环触发 input
            if (formatted !== value) {
                target.value = formatted;
                value = formatted;
            }
        }

        this.$data.value = value;
        this.syncFormState();

        // 更新搜索建议
        if (this.$data.suggestions && this.$data.suggestions.length > 0) {
            this.updateSuggestions(value);
        }

        // input 是原生事件，不需要 emit
    }

    /**
     * 聚焦事件处理
     */
    handleFocus(_event: FocusEvent): void {
        this.$data.focused = true;
        // 记录聚焦前的值，原生 change 事件用它计算 previousValue
        this.valueBeforeChange = this.getValue();

        // 聚焦时全选
        if (this.$data.selectAll && this.$data.value) {
            this.select();
        }

        // focus 是原生事件，不需要 emit
    }

    /**
     * 失焦事件处理
     */
    handleBlur(_event: FocusEvent): void {
        this.$data.focused = false;
        // blur 是原生事件，不需要 emit
    }

    /**
     * 值改变事件处理（失焦或回车时触发）
     */
    handleChange(event: Event): void {
        // 原生 change 已由组件转换为统一 CustomEvent（C-FORM-23），阻止原始事件冒泡
        event.stopPropagation();

        const value = this.getValue();
        const previousValue = this.valueBeforeChange ?? value;
        this.valueBeforeChange = value;

        emitChange(this, {
            name: this.formFieldName(),
            value,
            previousValue,
            source: 'user',
        });
    }

    /**
     * 键盘事件处理
     */
    handleKeydown(event: KeyboardEvent): void {
        // keydown 是原生事件，不需要 emit

        if (event.key === 'Enter') {
            // 回车统一派发 press-enter；keydown 不可取消，不阻止默认行为
            this.emit('press-enter', {
                value: this.$data.value,
            });

            // search 类型额外派发 search 事件
            if (this.$data.type === 'search') {
                this.emit('search', {
                    value: this.$data.value,
                });
            }
        }
    }

    /**
     * 操作件键盘激活：Enter / Space 等价点击，禁用态不响应。
     */
    handleActionKeydown(event: KeyboardEvent, action: 'clear' | 'password' | 'copy'): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (this.isEffectivelyDisabled()) return;
        event.preventDefault();
        if (action === 'clear') this.handleClear();
        else if (action === 'password') this.togglePassword();
        else void this.handleCopy();
    }

    /**
     * 联想项键盘激活
     */
    handleSuggestionKeydown(event: KeyboardEvent, suggestion: string): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.selectSuggestion(suggestion);
    }

    /**
     * 清除输入
     */
    handleClear(): void {
        if (this.isEffectivelyDisabled() || this.$data.readonly) return;
        this.$data.value = '';
        this.syncFormState();

        // 派发原生 clear 事件
        this.dispatchEvent(
            new Event('clear', {
                bubbles: true,
                composed: true,
            }),
        );

        // 聚焦输入框
        this.focus();
    }

    /**
     * 切换密码显示
     */
    togglePassword(): void {
        if (this.isEffectivelyDisabled()) return;
        this.$data.passwordVisible = !this.$data.passwordVisible;
    }

    /**
     * 复制内容
     */
    async handleCopy(): Promise<void> {
        if (this.isEffectivelyDisabled()) return;
        try {
            const value = this.unformatValue(this.$data.value);
            await navigator.clipboard.writeText(value);
            this.emit('copy', { value });
        } catch (err) {
            this.emit('copy-error', { error: err });
        }
    }

    /**
     * 更新搜索建议（带防抖）
     */
    updateSuggestions(value: string): void {
        // 清除之前的定时器
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        // 防抖 300ms
        this.searchDebounceTimer = setTimeout(() => {
            this._updateSuggestionsImpl(value);
            this.searchDebounceTimer = undefined;
        }, 300) as unknown as number;
    }

    /**
     * 实际更新搜索建议的实现
     */
    private _updateSuggestionsImpl(value: string): void {
        if (!value || !this.$data.suggestions) {
            this._filteredSuggestions = [];
            this.refresh();
            return;
        }
        this._filteredSuggestions = this.$data.suggestions.filter(item =>
            item.toLowerCase().includes(value.toLowerCase()),
        );
        this.refresh();
    }

    /**
     * 选择建议
     */
    selectSuggestion(suggestion: string): void {
        // 禁用 / 字段集级联禁用时建议项不可改值（列表可能仍残留在 DOM 中）
        if (this.isEffectivelyDisabled()) return;

        const previousValue = this.getValue();
        this.$data.value = suggestion;
        this._filteredSuggestions = [];
        this.syncFormState();
        this.refresh();
        // input 是原生事件，不需要手动派发；change 由统一入口派发
        emitChange(this, {
            name: this.formFieldName(),
            value: this.getValue(),
            previousValue,
            source: 'user',
        });
    }

    /**
     * 聚焦输入框
     */
    public focus(): void {
        const el = this.inputElement || this.shadowRoot?.querySelector('input, textarea');
        el?.focus();
        this.$data.focused = true;
    }

    /**
     * 失焦输入框
     */
    public blur(): void {
        const el = this.inputElement || this.shadowRoot?.querySelector('input, textarea');
        el?.blur();
        this.$data.focused = false;
    }

    /**
     * 设置值
     * @param value - 新值
     * @param silent - 为 true 时不派发 change 事件（与 select/slider 等同类组件保持一致）
     */
    public setValue(value: string, silent = false): void {
        const previousValue = this.getValue();
        this.$data.value = value;
        this.syncFormState();

        if (!silent) {
            emitChange(this, {
                name: this.formFieldName(),
                value: this.getValue(),
                previousValue,
                source: 'api',
            });
        }
    }

    /**
     * 获取值
     */
    public getValue(): string {
        return this.unformatValue(this.$data.value);
    }

    /**
     * value 属性 getter
     */
    get value(): string {
        return this.getValue();
    }

    /**
     * value 属性 setter
     *
     * 契约 D3：property 赋值一律静默，需要事件时显式调用 `setValue(value, false)`。
     */
    set value(val: string) {
        this.setValue(val, true);
    }

    /**
     * defaultValue：property 写入时同步 form reset 目标。
     *
     * property → attribute 的镜像会被基座的 reflectingAttrs 保护跳过
     * attributeChangedCallback，组件钩子拿不到这次变更，必须在 setter 中直连。
     */
    get defaultValue(): string {
        return this.$data.defaultValue;
    }

    set defaultValue(val: string) {
        this.$data.defaultValue = val;
        // 框架初始化 / attribute 同步写入时由 attributeChanged 钩子或 readDefault 负责，
        // 不能在这里提前捕获重置目标，否则默认空串会覆盖 value 的初始值
        if (!this.isSyncingProps) setFormDefault(this, val || '');
    }

    /**
     * 读取多个别名属性，任一为 true 即返回 true。
     * 显式 "false" / "0" 会被解析为 false，与框架属性语义一致。
     */
    private readBooleanAlias(...names: string[]): boolean {
        return names.some(name => parseBooleanAttribute(this.getAttribute(name)));
    }

    /**
     * attribute 写入后的状态校正
     *
     * 新旧属性名（show-password/showpassword 等）任一为 true 即视为 true，
     * 两个都为 false（含显式 "false"/"0"、或都被移除）才置为 false。
     */
    attributeChanged(name: string, _oldValue: unknown, _newValue: unknown): void {
        switch (name) {
            case 'show-password':
            case 'showpassword':
                this.$data.showPassword = this.readBooleanAlias('show-password', 'showpassword');
                break;
            case 'show-count':
            case 'showcount':
                this.$data.showCount = this.readBooleanAlias('show-count', 'showcount');
                break;
            case 'select-all':
            case 'selectall':
                this.$data.selectAll = this.readBooleanAlias('select-all', 'selectall');
                break;
            case 'default-value':
                // C-FORM-09：显式设置 defaultValue 时立即替换重置目标
                setFormDefault(this, this.$data.defaultValue || '');
                break;
            default:
                break;
        }
    }

    /**
     * 选择文本
     */
    public select(): void {
        const el = this.inputElement || this.shadowRoot?.querySelector('input, textarea');
        el?.select();
    }
}

export default SolelyInput;
export { SolelyInput };
