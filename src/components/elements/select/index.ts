/**
 * Solely Select 组件
 * 下拉选择器组件，支持 options 属性和插槽两种方式
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { parseBooleanAttribute } from '../../../shared/boolean';
import { toRaw } from '../../../runtime/reactivity';
import { computePosition, observePosition } from '../../../shared/floating/position';
import { registerOverlay, type OverlayHandle } from '../../../shared/floating/overlay-stack';
import {
    checkFormValidity,
    effectiveDisabled,
    emitChange,
    formValidity,
    formValidationMessage,
    handleFormAssociatedCallback,
    handleFormDisabledCallback,
    handleFormResetCallback,
    initFormAssociation,
    reportFormValidity,
    setCustomValidity as setControlCustomValidity,
    setFormDefault,
    syncAria,
    syncFormValue,
    syncValidity,
    FORM_VALIDATION_MESSAGES,
    type ChangeSource,
    type FormAdapter,
    type FormValidationResult,
} from '../../../shared/form-associated';
import type { SelectProps, SelectOption as SelectOptionType, SelectMethods, SelectValue, SelectSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
// 注册声明式选项 <solely-select-option>，用户只引入 select 即可使用
import './option';

/** 用于生成 shadow DOM 内部唯一的 id（listbox / option） */
let selectInstanceCounter = 0;

/** 挂载了已渲染选项引用的内容节点，避免高亮移动时重复重建 DOM */
type OptionContentWithRef = HTMLElement & { __solelyOptionRef?: SelectOptionType };

@CustomElement({
    tagName: 'solely-select',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'string', default: '' },
        { name: 'placeholder', type: 'string', default: '请选择' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'clearable', type: 'boolean', default: false },
        { name: 'options', type: 'array', default: [] },
        { name: 'multiple', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
        { name: 'name', type: 'string', default: '' },
        { name: 'required', type: 'boolean', default: false, reflect: true },
        { name: 'defaultValue', type: 'string', default: '' },
        { name: 'invalidMessage', type: 'string', default: '' },
    ],
})
class SolelySelect
    extends BaseElement<
        SelectProps & {
            focused: boolean;
            isOpen: boolean;
            closing: boolean;
            selectedLabel: string;
            parsedOptions: SelectOptionType[];
            dropdownPlacement: 'top' | 'bottom';
            useSlot: boolean; // 是否使用插槽
            slotOptions: Array<{
                value: string;
                label: string;
                disabled: boolean;
                isGroup?: boolean;
                element: Element;
            }>;
            hasHeaderSlot: boolean;
            hasFooterSlot: boolean;
            activeIndex: number;
        }
    >
    implements SelectMethods
{
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): SelectSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 表单关联自定义元素（C-FORM-01） */
    static readonly formAssociated = true;

    clickOutsideHandler?: (event: MouseEvent) => void;
    slotObserver?: MutationObserver;
    private closeTimer?: number;
    private readonly instanceId = ++selectInstanceCounter;
    /** 显式调用 setOptions() 后锁定为 options 数据源，重新挂载时不再被 slot 覆盖 */
    private optionsSource: 'auto' | 'options' = 'auto';
    /** setOptions() 设置的选项，重新挂载后优先于 options 属性 */
    private manualOptions?: SelectOptionType[];
    /** 首次挂载完成后，属性变更才视为显式覆盖 */
    private initialized = false;
    /** 上次参与解析的 options 引用，用于发现 property 方式的异步赋值 */
    private lastParsedOptions?: unknown;
    /**
     * 程序化 open() 所在的点击事件尚未结束时，忽略 document 的外部点击判定。
     * 否则外部按钮在 click 里调用 open()，同一事件冒泡到 document 会立刻把下拉关掉。
     */
    private ignoreOutsideClick = false;
    /** 解除 ignoreOutsideClick 的定时器（等整次点击派发结束） */
    private ignoreOutsideClickTimer?: ReturnType<typeof setTimeout>;
    private _dropdown?: HTMLElement;
    private _overlay?: OverlayHandle;
    private _stopObserve?: () => void;

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问
     * 多选时返回数组
     */
    get value(): SelectValue {
        return this.$data.value ?? '';
    }

    /**
     * 写入 value。disabled 只阻止用户交互，不阻止程序化同步，
     * 避免外部值与内部值出现分叉。
     */
    set value(newValue: SelectValue) {
        // property 写回必须静默：变更事件只由用户交互或显式 setValue 触发
        this.setValue(newValue, true);
    }

    /**
     * defaultValue：property 写入时同步 form reset 目标。
     *
     * property → attribute 的镜像不会触发 attributeChanged 钩子，
     * 因此不能只依赖 attributeChanged 中的 setFormDefault。
     */
    get defaultValue(): SelectValue {
        return this.$data.defaultValue ?? '';
    }

    set defaultValue(newValue: SelectValue) {
        this.$data.defaultValue = newValue as string;
        // 框架初始化 / attribute 同步写入由 attributeChanged 钩子或 readDefault 负责
        if (!this.isSyncingProps && this.initialized) setFormDefault(this, this.normalizeValue(newValue));
    }

    /**
     * 多选开关。切换为多选时把已有的单值归一化为数组。
     */
    get multiple(): boolean {
        return !!this.$data.multiple;
    }

    set multiple(newValue: boolean) {
        this.$data.multiple = !!newValue;
        this.$data.value = this.normalizeValue(this.$data.value);
        this.syncSelectedLabel();
        this.syncSlotSelection();
    }

    created(): void {
        if (this.$data.focused === undefined) this.$data.focused = false;
        if (this.$data.isOpen === undefined) this.$data.isOpen = false;
        if (this.$data.closing === undefined) this.$data.closing = false;
        if (this.$data.selectedLabel === undefined) this.$data.selectedLabel = '';
        if (this.$data.parsedOptions === undefined) this.$data.parsedOptions = [];
        if (this.$data.slotOptions === undefined) this.$data.slotOptions = [];
        if (this.$data.hasHeaderSlot === undefined) this.$data.hasHeaderSlot = false;
        if (this.$data.hasFooterSlot === undefined) this.$data.hasFooterSlot = false;
        if (this.$data.activeIndex === undefined) this.$data.activeIndex = -1;
        if (this.$data.dropdownPlacement === undefined) this.$data.dropdownPlacement = 'bottom';

        const adapter: FormAdapter<SelectValue> = {
            family: 'scalar',
            read: () => this.getValue(),
            write: (value, _silent) => this.setValue(value as SelectValue, true),
            // select 空值不产生提交条目；单选/多选都按字符串数组编码
            encode: value => {
                const values = Array.isArray(value) ? value : value ? [String(value)] : [];
                return values.length > 0 ? values.map(item => String(item)) : null;
            },
            name: () => this.formFieldName(),
            disabled: () => !!this.$data.disabled,
            required: () => !!this.$data.required,
            ariaTarget: () => this.getTriggerElement(),
            tabTargets: () => this.getTriggerElement(),
            anchors: () => {
                const trigger = this.getTriggerElement();
                return trigger ? [trigger] : null;
            },
            validate: value => this.validateValue(value),
            missingMessage: () => FORM_VALIDATION_MESSAGES.valueMissingSelect,
            invalidMessage: () => this.$data.invalidMessage || '',
            readDefault: () => this.readExplicitDefaultValue(),
            changeDetail: (value, previousValue, source) => ({
                name: this.formFieldName(),
                value: Array.isArray(value) ? value.map(String) : String(value ?? ''),
                previousValue: Array.isArray(previousValue) ? previousValue.map(String) : String(previousValue ?? ''),
                source,
            }),
        };

        // multiple 可在运行时切换：用 getter 保证每次同步都读取最新值族
        Object.defineProperty(adapter, 'family', {
            configurable: true,
            enumerable: true,
            get: () => (this.multiple ? 'multiple' : 'scalar'),
        });

        initFormAssociation(this, adapter);
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

    get willValidate(): boolean {
        return !effectiveDisabled(this);
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

    /** 同步提交值 / 有效性 / ARIA（C-FORM-04） */
    private syncFormState(): void {
        syncFormValue(this);
        syncValidity(this);
        syncAria(this);
    }

    /** 字段名：property 优先，其次 attribute */
    private formFieldName(): string {
        return this.$data.name || this.getAttribute('name') || '';
    }

    /** 承载 role="combobox" 的触发区 */
    private getTriggerElement(): HTMLElement | null {
        return (this.shadowRoot?.querySelector('.select') as HTMLElement | null) ?? null;
    }

    /** 触发区的 aria-disabled（包含 formDisabled） */
    getAriaDisabled(): string {
        return effectiveDisabled(this) ? 'true' : 'false';
    }

    getTabindex(): string {
        return effectiveDisabled(this) ? '-1' : '0';
    }

    /** required 且未选择任何值时判定 valueMissing */
    private validateValue(value: SelectValue): FormValidationResult | null {
        if (!this.$data.required) return null;
        const empty = Array.isArray(value) ? value.length === 0 : String(value ?? '') === '';
        if (!empty) return null;

        const trigger = this.getTriggerElement();
        return { flags: { valueMissing: true }, anchor: trigger ?? undefined };
    }

    /** 读取显式 defaultValue；未显式设置时返回 undefined，由基座捕获初始值 */
    private readExplicitDefaultValue(): SelectValue | undefined {
        const attr = this.getAttribute('default-value');
        if (attr !== null) return this.normalizeValue(attr);
        const value = this.$data.defaultValue;
        if (typeof value === 'string' && value !== '') return this.normalizeValue(value);
        return undefined;
    }

    /**
     * 获取 select class 对象
     */
    getSelectClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['select--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['select--lg'] = true;
        } else {
            classes['select--md'] = true;
        }
        classes['is-disabled'] = effectiveDisabled(this);
        classes['is-focused'] = !!this.$data.focused;
        classes['is-open'] = !!this.$data.isOpen;
        classes['use-slot'] = this.$data.useSlot;
        classes['select--multiple'] = !!this.$data.multiple;
        return classes;
    }

    /**
     * 获取 dropdown class 对象
     */
    getDropdownClasses(): Record<string, boolean> {
        return {
            'select__dropdown--closing': !!this.$data.closing,
            'select__dropdown--top': this.$data.dropdownPlacement === 'top',
            'select__dropdown--bottom': this.$data.dropdownPlacement === 'bottom',
        };
    }

    /**
     * 获取 option class 对象
     */
    getOptionClasses(
        option: SelectOptionType | { value: string; disabled?: boolean; isGroup?: boolean },
        index = -1,
    ): Record<string, boolean> {
        const isGroup = !!option.isGroup;
        return {
            'select__option--selected': !isGroup && this.isSelected(option.value),
            'select__option--highlighted': !isGroup && index >= 0 && index === this.$data.activeIndex,
            'select__option--disabled': !isGroup && !!option.disabled,
            'select__option--group': isGroup,
            'select__group-label': isGroup,
        };
    }

    /** 当前值是否命中给定选项值 */
    isSelected(value: string): boolean {
        return this.getSelectedValues().includes(String(value));
    }

    /** 当前选中的所有值（单选取值数组长度为 1） */
    getSelectedValues(): string[] {
        const value = this.$data.value;
        if (this.$data.multiple) {
            if (Array.isArray(value)) return value.map(String);
            return value ? [String(value)] : [];
        }
        if (Array.isArray(value)) return value.length ? [String(value[0])] : [];
        return value ? [String(value)] : [];
    }

    /** 将外部写入值归一化为内部存储结构 */
    normalizeValue(value: SelectValue | null | undefined): SelectValue {
        if (this.$data.multiple) {
            if (Array.isArray(value)) return this.uniqueValues(value.map(String));
            if (value === null || value === undefined || value === '') return [];
            const text = String(value).trim();
            if (text.startsWith('[')) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) return this.uniqueValues(parsed.map(String));
                } catch {
                    // 非合法 JSON 时按普通字符串处理
                }
            }
            const values = text.includes(',') ? text.split(',') : [text];
            return this.uniqueValues(values.map(item => item.trim()).filter(Boolean));
        }
        if (Array.isArray(value)) return value.length ? String(value[0]) : '';
        return value === null || value === undefined ? '' : String(value);
    }

    /** 多选值去重，保持首次出现顺序 */
    private uniqueValues(values: string[]): string[] {
        return Array.from(new Set(values));
    }

    /**
     * 用浮层基座的纯函数定位下拉层。
     * 以实际测量高度参与 flip/shift，不再写死 256px；fixed 坐标系避免被祖先 overflow 裁剪。
     */
    private positionDropdown(): void {
        const dropdown = this._dropdown;
        if (!dropdown || !dropdown.isConnected) return;

        const anchorRect = this.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const result = computePosition(
            anchorRect,
            {
                // 入场动画可能带 transform，getBoundingClientRect() 会返回变换后的尺寸；
                // 定位统一用布局尺寸，避免首次 flip/shift 按错误尺寸钳制。
                width: dropdown.offsetWidth || dropdownRect.width,
                height: dropdown.offsetHeight || dropdownRect.height,
            },
            {
                placement: 'bottom',
                // fixed 可用区域不含滚动条；jsdom 的 clientWidth 为 0，回退到 innerWidth
                viewport: {
                    width: document.documentElement.clientWidth || window.innerWidth,
                    height: document.documentElement.clientHeight || window.innerHeight,
                },
                offset: 4,
                boundaryPadding: 8,
                flip: true,
                shift: true,
                strategy: 'fixed',
            },
        );

        const side = result.placement.startsWith('top') ? 'top' : 'bottom';
        dropdown.classList.toggle('select__dropdown--top', side === 'top');
        dropdown.classList.toggle('select__dropdown--bottom', side !== 'top');

        dropdown.style.position = 'fixed';
        dropdown.style.top = `${result.top}px`;
        dropdown.style.left = `${result.left}px`;
        dropdown.style.bottom = 'auto';
        dropdown.style.right = 'auto';
        // 脱离宿主后 100% 等于视口宽度，必须按宿主实际宽度写入
        dropdown.style.minWidth = `${anchorRect.width}px`;
    }

    /** 登记下拉浮层（z-index + Esc）并订阅重定位 */
    private setupDropdown(): void {
        const dropdown = this.shadowRoot?.querySelector('.select__dropdown') as HTMLElement | null;
        if (!dropdown) {
            this.teardownDropdown();
            return;
        }

        if (this._dropdown === dropdown) {
            // 关闭动画期间 observe 已被解绑，重新打开时需要恢复定位订阅
            if (!this._stopObserve) {
                this._stopObserve = observePosition({
                    anchor: this,
                    floating: dropdown,
                    update: () => this.positionDropdown(),
                    onAnchorLost: () => this.close(),
                });
            }
            this.positionDropdown();
            return;
        }

        this.teardownDropdown();
        this._dropdown = dropdown;

        this._overlay = registerOverlay({
            kind: 'dropdown',
            container: dropdown,
            trigger: this,
            escClosable: true,
            trapFocus: false,
            lockScroll: false,
            inertBackground: false,
            autoFocus: false,
            returnFocus: false,
            onEscape: () => this.close(),
        });
        this._overlay.activate();

        this.positionDropdown();

        this._stopObserve = observePosition({
            anchor: this,
            floating: dropdown,
            update: () => this.positionDropdown(),
            onAnchorLost: () => this.close(),
        });
    }

    private teardownDropdown(): void {
        this._stopObserve?.();
        this._stopObserve = undefined;
        this._overlay?.deactivate();
        this._overlay?.dispose();
        this._overlay = undefined;
        this._dropdown = undefined;
    }

    /** 是否为声明式选项子组件 */
    private isDeclarativeOptionElement(el: Element): boolean {
        return el.tagName.toLowerCase() === 'solely-select-option';
    }

    /**
     * 读取插槽选项的值。
     * 声明式组件读 `value`，兼容写法读 `data-value`。
     */
    private getSlotOptionValue(el: Element): string {
        const attr = this.isDeclarativeOptionElement(el) ? 'value' : 'data-value';
        return el.getAttribute(attr) ?? '';
    }

    /**
     * 读取插槽选项的标签。
     * 标签优先级：声明式 `label` / 兼容 `data-label` > 元素文本内容。
     */
    private getSlotOptionLabel(el: Element): string {
        const attr = this.isDeclarativeOptionElement(el) ? 'label' : 'data-label';
        return el.getAttribute(attr) || el.textContent?.trim() || '';
    }

    /**
     * 从插槽收集选项
     */
    collectSlotOptions(): void {
        // 获取直接子元素（排除 shadow root 的内部元素）
        const children = Array.from(this.children);

        // 检查是否有 header/footer 具名插槽
        this.$data.hasHeaderSlot = children.some(el => el.getAttribute('slot') === 'header');
        this.$data.hasFooterSlot = children.some(el => el.getAttribute('slot') === 'footer');

        // setOptions() 已显式锁定 options 数据源，slot 变化不再抢占
        if (this.optionsSource === 'options') {
            this.$data.useSlot = false;
            // 清理插槽元素上可能残留的无障碍状态
            this.syncSlotSelection();
            return;
        }

        // 获取所有选项元素（排除具名插槽元素）
        // 声明式 <solely-select-option> 与兼容的 [data-value] 裸元素同等对待
        const optionChildren = children.filter(
            el => !el.getAttribute('slot') && (el.hasAttribute('data-value') || this.isDeclarativeOptionElement(el)),
        );

        if (optionChildren.length === 0) {
            this.$data.useSlot = false;
            // 回退到 options 属性数据源
            this.parseOptions();
            // 清理插槽元素上可能残留的无障碍状态
            this.syncSlotSelection();
            return;
        }

        this.$data.useSlot = true;
        this.$data.slotOptions = optionChildren.map(el => {
            return {
                value: this.getSlotOptionValue(el),
                label: this.getSlotOptionLabel(el),
                disabled: parseBooleanAttribute(el.getAttribute('disabled')),
                isGroup: el.hasAttribute('data-group') ? true : undefined,
                element: el,
            };
        });

        // 更新选中的标签与插槽选中态
        this.syncSelectedLabel();
        this.syncSlotSelection();
    }

    mounted(): void {
        this.$data.value = this.normalizeValue(this.$data.value);

        // 先同步尝试收集插槽（如果子元素已存在）
        this.collectSlotOptions();

        // 如果插槽没有提供选项，才走 props options 逻辑
        if (!this.$data.useSlot) {
            if (this.optionsSource === 'options' && this.manualOptions) {
                this.$data.options = this.manualOptions;
            }
            this.parseOptions();
        }

        // 监听插槽变化（后续动态增删）
        this.setupSlotObserver();

        // 点击外部关闭
        this.clickOutsideHandler = (event: MouseEvent) => {
            // 外部按钮在 click 中调用 open() 时，同一事件随后会冒泡到 document：
            // 需跳过这一次判定，否则下拉会被立即关闭
            if (this.ignoreOutsideClick) return;
            const path = event.composedPath();
            if (!path.some(el => el === this)) {
                this.closeDropdown();
            }
        };
        document.addEventListener('click', this.clickOutsideHandler);
        this.syncValueContent();
        this.syncOptionContents();
        this.syncFormState();
        this.initialized = true;
    }

    /**
     * 设置插槽观察器
     */
    setupSlotObserver(): void {
        // 不再需要 setTimeout，因为 mounted 里已经同步收集过了
        this.slotObserver = new MutationObserver(() => {
            this.collectSlotOptions();
        });
        this.slotObserver.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-value', 'data-label', 'data-group', 'disabled', 'slot', 'value', 'label'],
        });
    }

    unmounted(): void {
        if (this.clickOutsideHandler) {
            document.removeEventListener('click', this.clickOutsideHandler);
        }
        if (this.slotObserver) {
            this.slotObserver.disconnect();
        }
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = undefined;
        }
        if (this.ignoreOutsideClickTimer) {
            clearTimeout(this.ignoreOutsideClickTimer);
            this.ignoreOutsideClickTimer = undefined;
        }
        this.ignoreOutsideClick = false;
        this.teardownDropdown();
    }

    /**
     * 数据更新后同步标签、插槽选中态与高亮
     */
    updated(): void {
        // options 是数组，不会镜像 attribute；插槽模式下不解析 options，与 mounted 条件对齐
        if (!this.$data.useSlot && this.$data.options !== this.lastParsedOptions) {
            this.parseOptions();
        }
        this.syncSelectedLabel();
        this.syncSlotSelection();
        this.syncValueContent();
        this.syncOptionContents();
        this.syncFormState();
        if (this.$data.isOpen) {
            this.setupDropdown();
        } else {
            this.teardownDropdown();
        }
    }

    /** 渲染一份选项内容：图标 + 文本，或 render() 的自定义结果 */
    private renderOptionContent(container: HTMLElement, option: SelectOptionType): void {
        const render = option.render;
        if (typeof render === 'function') {
            const result = render(option);
            if (result instanceof Element) {
                container.appendChild(result.cloneNode(true));
                return;
            }
            if (result !== undefined && result !== null && String(result).length > 0) {
                container.textContent = String(result);
                return;
            }
        }

        const rawIcon = typeof option.icon === 'function' ? option.icon(option) : option.icon;
        if (rawIcon) {
            const iconWrap = document.createElement('span');
            iconWrap.className = 'select__option-icon';
            iconWrap.setAttribute('part', 'option-icon');
            iconWrap.setAttribute('aria-hidden', 'true');
            if (typeof rawIcon === 'string') {
                const classes = rawIcon.split(/\s+/).filter(Boolean);
                if (classes.length) {
                    iconWrap.classList.add(...classes);
                    // 同时把类名暴露为 part，外部可用 ::part(icon-xxx) 直接命中；
                    // 类名模式本身只在样式已注入组件 shadow 时生效（见 types 注释）。
                    const partNames = classes.filter(name => /^[a-zA-Z_][\w-]*$/.test(name));
                    if (partNames.length) {
                        iconWrap.setAttribute('part', `option-icon ${partNames.join(' ')}`);
                    }
                }
            } else if (rawIcon instanceof Element) {
                iconWrap.appendChild(rawIcon.cloneNode(true));
            }
            container.appendChild(iconWrap);
        }

        const label = document.createElement('span');
        label.className = 'select__option-label';
        label.setAttribute('part', 'option-label');
        label.textContent = option.label || option.value;
        container.appendChild(label);
    }

    /** 找到某个值对应的选项条目（插槽模式下附带原始元素） */
    private findOptionEntry(value: string): (SelectOptionType & { element?: Element }) | undefined {
        if (this.$data.useSlot) {
            return this.$data.slotOptions.find(
                option => !option.isGroup && String(option.value) === value,
            ) as SelectOptionType & { element?: Element };
        }
        return this.$data.parsedOptions.find(option => !option.isGroup && String(option.value) === value);
    }

    /** 把插槽选项的可视内容克隆到触发区，保证选中前后观感一致 */
    private cloneSlotContent(container: HTMLElement, element: Element, fallback: string): void {
        // 插槽元素存放在响应式数据中，取回后可能是 Proxy；
        // 原生 DOM getter/方法必须以原始节点为 receiver，否则会抛 Illegal invocation
        const raw = toRaw(element);
        const children = Array.from(raw.childNodes);
        if (children.length === 0) {
            container.textContent = fallback;
            return;
        }
        children.forEach(node => container.appendChild(node.cloneNode(true)));
    }

    /** 同步下拉选项的可视内容（图标 / 自定义渲染） */
    private syncOptionContents(): void {
        if (this.$data.useSlot) return;
        const options = this.$data.parsedOptions;
        const nodes = this.shadowRoot?.querySelectorAll('.select__option');
        if (!nodes) return;

        nodes.forEach((node, index) => {
            const option = options[index];
            if (!option) return;
            const container = node.querySelector('.select__option-content') as OptionContentWithRef | null;
            if (!container) return;

            // 选项对象引用未变化、且可见字段也一致时才跳过：
            // 原地修改 label/value/icon/disabled 时引用不变，但必须重渲染
            const iconSignature = typeof option.icon === 'string' ? option.icon : '';
            const signature = [option.label ?? '', option.value ?? '', option.disabled ? '1' : '0', iconSignature].join(
                '\u0000',
            );
            if (container.__solelyOptionRef === option && container.dataset.optionSignature === signature) return;
            container.__solelyOptionRef = option;
            container.dataset.optionSignature = signature;
            container.textContent = '';

            if (option.isGroup) {
                container.textContent = option.label || option.value;
            } else {
                this.renderOptionContent(container, option);
            }
        });
    }

    /** 同步触发区的已选内容：单选复用选项内容，多选渲染为标签 */
    private syncValueContent(): void {
        const container = this.shadowRoot?.querySelector('.select__value-content') as HTMLElement | null;
        if (!container) return;

        container.textContent = '';
        const values = this.getSelectedValues();
        if (values.length === 0) return;

        values.forEach(value => {
            const target = this.$data.multiple ? document.createElement('span') : container;
            if (this.$data.multiple) target.className = 'select__tag';

            const entry = this.findOptionEntry(value);
            if (entry) {
                if (entry.element) {
                    this.cloneSlotContent(target, entry.element, value);
                } else {
                    this.renderOptionContent(target, entry);
                }
            } else {
                // 兜底：找不到选项时展示原始值，不出现空白
                target.textContent = value;
            }

            if (this.$data.multiple) container.appendChild(target);
        });
    }

    /**
     * options 属性在挂载后发生变化时重新解析
     *
     * 数据源优先级：options 属性（显式设置时）> setOptions() > 插槽。
     * - 设置/修改 options 属性：以属性为准，丢弃 setOptions() 的锁定；
     * - 移除 options 属性：若存在 setOptions() 锁定则恢复它，否则回到自动数据源（插槽优先）。
     */
    attributeChanged(name: string): void {
        if (name === 'default-value' && this.initialized) {
            // C-FORM-09：显式设置 defaultValue 时立即替换重置目标
            setFormDefault(this, this.normalizeValue(this.$data.defaultValue));
            return;
        }
        if (name !== 'options' || !this.initialized) return;

        if (this.hasAttribute('options')) {
            // 属性显式变更后，以最新属性为准，不再恢复 setOptions() 的旧值
            this.manualOptions = undefined;
            this.optionsSource = 'options';
            this.$data.useSlot = false;
            this.parseOptions();
            this.syncSlotSelection();
            return;
        }

        if (this.manualOptions) {
            // 属性被移除，恢复 setOptions() 的锁定结果
            this.optionsSource = 'options';
            this.$data.options = this.manualOptions;
            this.$data.useSlot = false;
            this.parseOptions();
            this.syncSlotSelection();
            return;
        }

        // 没有 setOptions() 锁定时回到自动数据源：有插槽用插槽，否则用空 options
        this.optionsSource = 'auto';
        this.collectSlotOptions();
        if (!this.$data.useSlot) {
            this.parseOptions();
        }
    }

    /**
     * 获取当前选中值对应的标签（支持多选）
     * @param fallbackToValue 找不到选项时是否回退为原始值
     */
    private getLabelsForValues(values: string[], fallbackToValue = false): string[] {
        const source: Array<{ value: string; label: string; isGroup?: boolean }> =
            (this.$data.useSlot ? this.$data.slotOptions : this.$data.parsedOptions) ?? [];
        const selectableSource = source.filter(option => !option.isGroup);
        return values
            .map(value => {
                const label = selectableSource.find(opt => String(opt.value) === value)?.label;
                if (label) return label;
                return fallbackToValue ? value : undefined;
            })
            .filter((label): label is string => !!label);
    }

    /**
     * 解析选项
     */
    parseOptions(): void {
        const options = this.$data.options;
        // 同步已解析引用：mounted 解析后，首次 updated 不应再重复解析
        this.lastParsedOptions = options;
        this.$data.parsedOptions = Array.isArray(options) ? options : [];
        this.syncSelectedLabel(); // 直接更新选中的标签
    }

    /**
     * 更新选中的标签
     * 多选时以顿号连接；值在另一数据源中不存在时保留原标签，避免混用时被静默清空
     */
    syncSelectedLabel(): void {
        const values = this.getSelectedValues();
        // options 数据源找不到标签时回退为原始值，避免"值还在、标签为空"
        const labels = this.getLabelsForValues(values, !this.$data.useSlot);

        if (labels.length > 0) {
            this.$data.selectedLabel = labels.join('、');
        } else if (values.length === 0) {
            this.$data.selectedLabel = '';
        }
        // useSlot 且新数据源找不到对应标签时保留旧标签
    }

    /**
     * 清理插槽元素上由组件写入的无障碍/选中状态
     */
    private cleanupSlotOptionState(el: HTMLElement): void {
        el.removeAttribute('data-selected');
        el.removeAttribute('data-highlighted');
        el.removeAttribute('aria-selected');
        if (el.getAttribute('role') === 'option' || el.getAttribute('role') === 'presentation') {
            el.removeAttribute('role');
        }
        const generatedPrefix = `${this.getListboxId()}-slot-option-`;
        if (el.id.startsWith(generatedPrefix)) {
            el.removeAttribute('id');
        }
    }

    /**
     * 同步插槽选项的选中/高亮/ARIA 状态
     */
    private syncSlotSelection(): void {
        if (!this.$data.useSlot) {
            // 回到 options 模式时清理插槽上的临时状态
            Array.from(this.children)
                .filter(el => el.hasAttribute('data-value') || this.isDeclarativeOptionElement(el))
                .forEach(el => this.cleanupSlotOptionState(el as HTMLElement));
            return;
        }

        this.$data.slotOptions.forEach((option, index) => {
            // 必须回到原始 DOM 节点：Proxy 接收原生 getter/方法会抛 Illegal invocation
            const el = toRaw(option.element) as HTMLElement;
            // 分组标题是结构性节点，不应具有 option 语义
            if (option.isGroup) {
                this.cleanupSlotOptionState(el);
                return;
            }
            if (!el.id) {
                el.id = `${this.getListboxId()}-slot-option-${index}`;
            }
            el.setAttribute('role', 'option');
            el.setAttribute('aria-selected', this.isSelected(option.value) ? 'true' : 'false');
            if (this.isSelected(option.value)) {
                el.setAttribute('data-selected', '');
            } else {
                el.removeAttribute('data-selected');
            }
            if (index === this.$data.activeIndex) {
                el.setAttribute('data-highlighted', '');
            } else {
                el.removeAttribute('data-highlighted');
            }
        });
    }

    /** listbox 的 id（shadow DOM 内唯一） */
    getListboxId(): string {
        return `solely-select-${this.instanceId}-listbox`;
    }

    /** 关闭态不下发 aria-controls */
    getAriaControls(): string | null {
        return this.$data.isOpen ? this.getListboxId() : null;
    }

    /** options 模式下某个选项的 id */
    getOptionId(_option: SelectOptionType, index: number): string {
        return `${this.getListboxId()}-option-${index}`;
    }

    /** 当前高亮选项的 id，用于 aria-activedescendant；关闭或无可选项时为 null */
    getActiveDescendantId(): string | null {
        if (!this.$data.isOpen) return null;
        const options = this.getAllOptions();
        const index = this.$data.activeIndex;
        if (index < 0 || index >= options.length) return null;
        if (!this.isSelectableOption(options[index])) return null;
        if (this.$data.useSlot) {
            const entry = this.$data.slotOptions[index];
            return entry ? toRaw(entry.element).id || null : null;
        }
        return this.getOptionId(options[index], index);
    }

    /** 数据源中的全部选项（含分组标题），索引与模板/插槽一一对应 */
    private getAllOptions(): SelectOptionType[] {
        if (this.$data.useSlot) {
            return this.$data.slotOptions.map(({ value, label, disabled, isGroup }) => ({
                value,
                label,
                disabled,
                isGroup,
            }));
        }
        return this.$data.parsedOptions;
    }

    /** 分组标题与禁用项不可导航/不可选中 */
    private isSelectableOption(option: SelectOptionType): boolean {
        return !option.isGroup && !option.disabled;
    }

    /** 对外可见的选项集合（分组标题不是合法选项） */
    private getSelectableOptions(): SelectOptionType[] {
        return this.getAllOptions().filter(option => !option.isGroup);
    }

    /** 第一个/最后一个可导航项 */
    private findBoundarySelectableIndex(boundary: 'first' | 'last'): number {
        const options = this.getAllOptions();
        if (boundary === 'first') {
            return options.findIndex(option => this.isSelectableOption(option));
        }
        for (let index = options.length - 1; index >= 0; index--) {
            if (this.isSelectableOption(options[index])) return index;
        }
        return -1;
    }

    /** 把键盘高亮定位到已选项（没有则定位到第一个可选项） */
    private syncActiveIndexToSelection(): void {
        const options = this.getAllOptions();
        const selected = this.getSelectedValues();
        let index = options.findIndex(
            option => this.isSelectableOption(option) && selected.includes(String(option.value)),
        );
        if (index < 0) {
            index = options.findIndex(option => this.isSelectableOption(option));
        }
        this.$data.activeIndex = index;
    }

    /** 上下移动高亮（跳过禁用项/分组标题并循环） */
    private moveActive(delta: 1 | -1): void {
        const options = this.getAllOptions();
        if (options.length === 0) return;

        let index = this.$data.activeIndex;
        // 打开后 activeIndex 为 -1：向上移动应从末项起算，否则会跳过最后一项
        if (index < 0) index = delta > 0 ? -1 : options.length;
        for (let step = 0; step < options.length; step++) {
            index = (index + delta + options.length) % options.length;
            if (this.isSelectableOption(options[index])) {
                this.$data.activeIndex = index;
                this.syncSlotSelection();
                return;
            }
        }
    }

    /** 选中当前高亮项 */
    private selectActive(): void {
        const options = this.getAllOptions();
        const option = options[this.$data.activeIndex];
        if (!option || !this.isSelectableOption(option)) return;
        this.applySelection(String(option.value), !!option.disabled);
    }

    /** 首字母跳转（跳过禁用项/分组标题） */
    private searchByChar(char: string): void {
        const options = this.getAllOptions();
        if (options.length === 0) return;

        const lower = char.toLowerCase();
        const start = this.$data.activeIndex;
        for (let step = 1; step <= options.length; step++) {
            const index = (start + step + options.length) % options.length;
            const option = options[index];
            const label = String(option.label ?? option.value ?? '');
            if (this.isSelectableOption(option) && label.trim().toLowerCase().startsWith(lower)) {
                this.$data.activeIndex = index;
                this.syncSlotSelection();
                return;
            }
        }
    }

    /** 让组合框容器获得焦点 */
    private focusTrigger(): void {
        const trigger = this.shadowRoot?.querySelector('.select') as HTMLElement | null;
        trigger?.focus();
    }

    /**
     * 点击事件处理
     * 下拉内容区（含空白处）的点击不应触发开合，避免多选时误关
     */
    handleClick(event?: Event): void {
        if (effectiveDisabled(this)) return;

        const target = event?.target as Node | null;
        if (target) {
            const dropdown = this.shadowRoot?.querySelector('.select__dropdown');
            if (dropdown?.contains(target)) return;
            // 插槽内容是 light DOM，直接作为宿主子节点存在
            if (target !== this && this.contains(target)) return;
        }

        const willOpen = !this.$data.isOpen;
        if (willOpen) {
            this.open();
        } else {
            this.close();
        }
    }

    /**
     * 键盘操作
     * ArrowDown/ArrowUp 打开并移动高亮，Enter 选中，Escape 关闭，空格开合，字符首字母跳转
     */
    handleKeydown(event: Event): void {
        if (effectiveDisabled(this)) return;
        const keyboardEvent = event as KeyboardEvent;
        const key = keyboardEvent.key;

        // 只处理来自触发器区域的按键，避免 header 内的输入框等冒泡事件误触
        const target = keyboardEvent.target as Node | null;
        const root = this.shadowRoot?.querySelector('.select');
        const selector = this.shadowRoot?.querySelector('.select__selector');
        if (!target || (target !== root && target !== selector && !selector?.contains(target))) {
            return;
        }

        // Tab 移出焦点：下拉层不参与 Tab 陷阱，需主动收起，避免浮层悬挂
        if (key === 'Tab') {
            if (this.$data.isOpen) this.close();
            return;
        }

        if (key === 'ArrowDown' || key === 'ArrowUp') {
            keyboardEvent.preventDefault();
            if (!this.$data.isOpen) {
                this.open();
                // 打开后默认无高亮：ArrowDown 落到第一个可选项，ArrowUp 落到最后一个
                if (key === 'ArrowUp') {
                    this.$data.activeIndex = this.findBoundarySelectableIndex('last');
                } else {
                    this.moveActive(1);
                }
                this.syncSlotSelection();
            } else {
                this.moveActive(key === 'ArrowDown' ? 1 : -1);
            }
            return;
        }

        if (key === 'Enter') {
            keyboardEvent.preventDefault();
            if (this.$data.isOpen) {
                this.selectActive();
            } else {
                this.open();
            }
            return;
        }

        if (key === ' ') {
            keyboardEvent.preventDefault();
            if (this.$data.isOpen) {
                this.close();
            } else {
                this.open();
            }
            return;
        }

        if (key === 'Escape') {
            if (this.$data.isOpen) {
                keyboardEvent.preventDefault();
                this.close();
            }
            return;
        }

        if (this.$data.isOpen && (key === 'Home' || key === 'End')) {
            keyboardEvent.preventDefault();
            const index = this.findBoundarySelectableIndex(key === 'Home' ? 'first' : 'last');
            if (index >= 0) {
                this.$data.activeIndex = index;
                this.syncSlotSelection();
            }
            return;
        }

        // 单字符首字母跳转（可选能力）
        if (
            this.$data.isOpen &&
            key.length === 1 &&
            key !== ' ' &&
            !keyboardEvent.ctrlKey &&
            !keyboardEvent.metaKey &&
            !keyboardEvent.altKey
        ) {
            keyboardEvent.preventDefault();
            this.searchByChar(key);
        }
    }

    /** 打开下拉菜单（已打开时保留当前高亮，不重置） */
    public open(): void {
        if (effectiveDisabled(this)) return;
        // 跳过本次点击冒泡到 document 的外部关闭判定。
        // 不能用微任务：浏览器会在同一事件的监听器之间清空微任务队列，
        // 必须等到整次点击派发结束（下一个宏任务）再解除。
        this.ignoreOutsideClick = true;
        if (this.ignoreOutsideClickTimer) clearTimeout(this.ignoreOutsideClickTimer);
        this.ignoreOutsideClickTimer = setTimeout(() => {
            this.ignoreOutsideClick = false;
            this.ignoreOutsideClickTimer = undefined;
        }, 0);
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = undefined;
        }
        if (this.$data.isOpen) {
            this.$data.closing = false;
            this.$data.focused = true;
            // 若正处在收起动画中，浮层已 deactivate，需要重新入栈并恢复定位订阅
            if (this._overlay) {
                this._overlay.activate();
                if (this._dropdown && !this._stopObserve) this.setupDropdown();
            } else {
                this.setupDropdown();
            }
            return;
        }
        this.teardownDropdown();
        this.$data.isOpen = true;
        this.$data.closing = false;
        this.$data.focused = true;
        // 打开时默认不把键盘高亮落到已选项上，避免选中态与 hover/高亮态混淆；
        // 键盘打开时再由 ArrowDown/ArrowUp 显式移动高亮。
        this.$data.activeIndex = -1;
        this.syncSlotSelection();
        this.focusTrigger();
    }

    /** 关闭下拉菜单（立即关闭，不播放收起动画） */
    public close(): void {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = undefined;
        }
        // 同一 tick 内 open() → close() 时，不能把保护留给下一次外部点击
        if (this.ignoreOutsideClickTimer) {
            clearTimeout(this.ignoreOutsideClickTimer);
            this.ignoreOutsideClickTimer = undefined;
        }
        this.ignoreOutsideClick = false;
        this.teardownDropdown();
        this.$data.isOpen = false;
        this.$data.closing = false;
        this.$data.focused = false;
        this.$data.activeIndex = -1;
    }

    /**
     * 选择选项（来自 options 属性）
     */
    handleSelect(option: SelectOptionType, event: Event): void {
        // 阻止冒泡到 .select 的 handleClick，否则多选时会被立即切回关闭状态
        event.stopPropagation();
        if (option.isGroup) return;
        this.applySelection(String(option.value), !!option.disabled);
    }

    /**
     * 处理插槽选项点击
     */
    handleSlotClick(event: Event): void {
        const target = event.target as HTMLElement;
        const optionEl = target.closest('[data-value], solely-select-option') as HTMLElement | null;

        if (!optionEl) return;

        // 阻止冒泡到 .select 的 handleClick
        event.stopPropagation();

        // 检查是否是分组标题（data-group 属性）
        const isGroup = optionEl.hasAttribute('data-group');
        if (isGroup) {
            // 分组标题不可选中
            return;
        }

        const value = this.getSlotOptionValue(optionEl);
        const disabled = parseBooleanAttribute(optionEl.getAttribute('disabled'));
        this.applySelection(value, disabled);
    }

    /**
     * 统一的选择落地逻辑（options / slot / 键盘共用）
     * 只有值真正变化时才派发 change
     */
    private applySelection(value: string, optionDisabled: boolean): void {
        if (optionDisabled || effectiveDisabled(this)) return;

        if (this.$data.multiple) {
            const current = this.getSelectedValues();
            const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
            this.setValue(next, false, 'user');
            this.$data.activeIndex = this.getAllOptions().findIndex(option => String(option.value) === value);
            this.syncSlotSelection();
            return;
        }

        this.setValue(value, false, 'user');
        this.closeDropdown();
    }

    /**
     * 处理 header/footer 点击，阻止事件冒泡避免关闭下拉框
     */
    handleHeaderFooterClick(event: Event): void {
        event.stopPropagation();
    }

    /** 清空选择（值确实存在时派发 clear + change） */
    private clearValue(): void {
        if (this.getSelectedValues().length === 0) return;

        const previous = this.$data.value;
        this.setValue(this.$data.multiple ? [] : '', true);
        // 框架初始化/属性同步阶段不派发任何事件
        if (this.isSyncingProps) return;
        this.dispatchEvent(
            new Event('clear', {
                bubbles: true,
                composed: true,
            }),
        );
        this.dispatchChange(previous, 'user');
    }

    /**
     * 清除选择按钮
     */
    handleClear(event: Event): void {
        if (effectiveDisabled(this)) return;
        event.stopPropagation();
        this.clearValue();
    }

    /** 清除按钮键盘激活：Enter / Space 等价点击 */
    handleClearKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleClear(event);
    }

    /** 清空选择（公开方法） */
    public clear(): void {
        this.clearValue();
    }

    /**
     * 关闭下拉菜单（带收起动画，用于选择/点击外部）
     */
    closeDropdown(): void {
        if (!this.$data.isOpen || this.closeTimer) return;

        // 收起动画开始即出栈，Esc/Tab 不再作用于正在消失的下拉层
        this._overlay?.deactivate();
        this._stopObserve?.();
        this._stopObserve = undefined;

        this.$data.closing = true;
        this.closeTimer = setTimeout(() => {
            this.$data.isOpen = false;
            this.$data.closing = false;
            this.$data.focused = false;
            this.$data.activeIndex = -1;
            this.closeTimer = undefined;
            this.teardownDropdown();
        }, 200) as unknown as number;
    }

    /**
     * 设置值
     * 只有值真正变化时才派发 change；silent 或初始化/属性同步阶段不派发
     */
    public setValue(value: SelectValue, silent = false, source: ChangeSource = 'api'): void {
        const previous = this.$data.value;
        const next = this.normalizeValue(value);
        const changed = !this.valuesEqual(previous, next);
        this.$data.value = next;

        // 多选切换后，原高亮位置可能失效
        if (this.$data.isOpen) {
            this.syncActiveIndexToSelection();
        }
        this.syncSelectedLabel();
        this.syncSlotSelection();
        this.syncFormState();

        if (!silent && changed && !this.isSyncingProps) {
            this.dispatchChange(previous, source);
        }
    }

    /** 判断两个值在语义上是否相同（数组按顺序比较） */
    private valuesEqual(a: SelectValue | undefined, b: SelectValue): boolean {
        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b)) return false;
            return a.length === b.length && a.every((item, index) => item === b[index]);
        }
        return (a ?? '') === (b ?? '');
    }

    /**
     * 获取值（多选返回数组）
     */
    public getValue(): SelectValue {
        return this.$data.value ?? '';
    }

    /**
     * 设置选项
     * 显式覆盖插槽数据源，重新挂载后也不会被 slot 覆盖
     */
    public setOptions(options: SelectOptionType[]): void {
        this.optionsSource = 'options';
        this.manualOptions = options;
        this.$data.options = options;
        this.$data.useSlot = false;
        this.parseOptions();
        this.syncSlotSelection();
    }

    /** 获取当前数据源的全部选项（保留 icon / render 等扩展字段） */
    public getOptions(): SelectOptionType[] {
        return this.getSelectableOptions().map(option => {
            const result: SelectOptionType = {
                label: option.label,
                value: option.value,
                disabled: option.disabled,
                isGroup: option.isGroup,
            };
            if ('icon' in option) result.icon = option.icon;
            if ('render' in option) result.render = option.render;
            return result;
        });
    }

    /** 派发 change（统一 CustomEvent 契约，带 name/value/previousValue/source） */
    private dispatchChange(previousValue: SelectValue = '', source: ChangeSource = 'user'): void {
        const value = this.getValue();
        const name = this.formFieldName();
        const toArray = (input: SelectValue): string[] =>
            Array.isArray(input) ? input.map(String) : input ? [String(input)] : [];

        if (Array.isArray(value) || Array.isArray(previousValue)) {
            emitChange(this, { name, value: toArray(value), previousValue: toArray(previousValue), source });
            return;
        }
        emitChange(this, {
            name,
            value: String(value ?? ''),
            previousValue: String(previousValue ?? ''),
            source,
        });
    }
}

export default SolelySelect;
export { SolelySelect };
