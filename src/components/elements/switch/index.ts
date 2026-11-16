import { BaseElement, CustomElement } from '../../../runtime/component';
import {
    emitChange,
    effectiveDisabled,
    formValidity,
    formValidationMessage,
    checkFormValidity,
    reportFormValidity,
    FORM_VALIDATION_MESSAGES,
    handleFormAssociatedCallback,
    handleFormDisabledCallback,
    handleFormResetCallback,
    initFormAssociation,
    setCustomValidity as setControlCustomValidity,
    setFormDefault,
    syncAria,
    syncFormValue,
    syncValidity,
} from '../../../shared/form-associated';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { oneOf } from '../../../shared/enum';
import type { SwitchProps, SwitchRefs, SwitchSize, SwitchType } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** 颜色类型白名单：非法值回退到 primary，避免产出无样式的 switch--xxx 类 */
const SWITCH_TYPES: readonly SwitchType[] = ['primary', 'success', 'warning', 'error'];

@CustomElement({
    tagName: 'solely-switch',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'defaultChecked', type: 'boolean', default: false },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'disabled', type: 'boolean', default: false, reflect: true },
        { name: 'required', type: 'boolean', default: false, reflect: true },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'checkedChildren', type: 'string', default: '' },
        { name: 'unCheckedChildren', type: 'string', default: '' },
        { name: 'name', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'invalidMessage', type: 'string', default: '' },
        { name: 'ariaLabel', type: 'string', default: '开关' },
    ],
    model: { prop: 'checked', event: 'change' },
})
class SolelySwitch extends BaseElement<SwitchProps, SwitchRefs> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): SwitchSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 表单关联自定义元素（C-FORM-01） */
    static readonly formAssociated = true;

    /**
     * 接入表单关联基座（C-FORM-02 / C-FORM-09）
     */
    created(): void {
        initFormAssociation(this, {
            family: 'boolean',
            read: () => !!this.$data.checked,
            write: (value, _silent) => this.setChecked(!!value, true),
            // 未选中不产生条目；选中且 value 为空时基座会归一化为 'on'（D4）
            encode: value => (value ? [this.$data.value || ''] : null),
            name: () => this.$data.name || this.getAttribute('name') || '',
            disabled: () => !!this.$data.disabled,
            required: () => !!this.$data.required,
            ariaTarget: () => this.getControlElement(),
            tabTargets: () => this.getControlElement(),
            anchors: () => {
                const control = this.getControlElement();
                return control ? [control] : null;
            },
            validate: value =>
                this.$data.required && !value
                    ? { flags: { valueMissing: true }, anchor: this.getControlElement() ?? undefined }
                    : null,
            missingMessage: () => FORM_VALIDATION_MESSAGES.valueMissingCheckbox,
            invalidMessage: () => this.$data.invalidMessage || '',
            readDefault: () => (this.$data.defaultChecked ? true : undefined),
            changeDetail: (value, previousValue, source) => ({
                name: this.$data.name || this.getAttribute('name') || '',
                value: this.$data.value,
                checked: value,
                previousChecked: previousValue,
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

    /** 同步值 / 有效性 / ARIA（C-FORM-04） */
    private syncFormState(): void {
        syncFormValue(this);
        syncValidity(this);
        syncAria(this);
    }

    /** 承载 role="switch" 的元素 */
    private getControlElement(): HTMLElement | null {
        return (this.shadowRoot?.querySelector('.switch') as HTMLElement | null) ?? null;
    }

    /**
     * 模板与视觉统一读取：作者 disabled 与 fieldset 级联禁用的合并结果。
     */
    isEffectivelyDisabled(): boolean {
        return effectiveDisabled(this);
    }

    /**
     * 获取 Switch 的 CSS 类名
     */
    getSwitchClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        const size = this.$data.size || 'medium';
        const type = oneOf(this.$data.type, SWITCH_TYPES, 'primary');

        // 尺寸映射
        if (size === 'small') {
            classes['switch--sm'] = true;
        } else if (size === 'large') {
            classes['switch--lg'] = true;
        } else {
            classes['switch--md'] = true;
        }
        classes[`switch--${type}`] = true;
        classes['is-checked'] = !!this.$data.checked;
        classes['is-disabled'] = this.isEffectivelyDisabled();
        classes['is-loading'] = !!this.$data.loading;

        return classes;
    }

    /**
     * 焦点顺序：禁用或加载中时从 Tab 序列中移除
     */
    getTabIndex(): string {
        // 返回字符串而非数字：数字 -1 与非聚焦元素的默认 tabIndex 相同，
        // 渲染层会认为“无变化”而不写 attribute；字符串可确保 tabindex="-1" 真正落到 DOM。
        return effectiveDisabled(this) || this.$data.loading ? '-1' : '0';
    }

    /**
     * 处理点击事件
     */
    handleClick(): void {
        if (effectiveDisabled(this) || this.$data.loading) {
            return;
        }

        this.toggle();
    }

    /**
     * 处理键盘事件
     */
    handleKeyDown(event: KeyboardEvent): void {
        if (effectiveDisabled(this) || this.$data.loading) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.toggle();
        }
    }

    /**
     * 切换开关状态
     * 用户交互时调用，会检查 disabled/loading 并派发事件
     */
    toggle(): void {
        if (effectiveDisabled(this) || this.$data.loading) {
            return;
        }
        const previousChecked = !!this.$data.checked;
        this.$data.checked = !this.$data.checked;
        this.syncFormState();
        this.emitCheckedChange(previousChecked, 'user');
    }

    /** 派发统一 change（值未变化时不派发，C-FORM-21） */
    private emitCheckedChange(previousChecked: boolean, source: 'user' | 'api' | 'reset'): void {
        emitChange(this, {
            name: this.$data.name || this.getAttribute('name') || '',
            value: this.$data.value,
            checked: !!this.$data.checked,
            previousChecked,
            source,
        });
    }

    /**
     * 设置开关状态
     * @param checked - 新的开关状态
     * @param silent - 为 true 时不派发 change（重置与 property 赋值走静默路径）
     */
    setChecked(checked: boolean, silent = false): void {
        const previousChecked = !!this.$data.checked;
        this.$data.checked = !!checked;
        this.syncFormState();

        if (!silent) {
            this.emitCheckedChange(previousChecked, 'api');
        }
    }

    /**
     * 获取当前开关状态
     * @returns 当前开关状态
     */
    getChecked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 getter
     * 允许通过 element.checked 访问状态
     */
    get checked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 setter
     * 契约 D3：property 赋值静默，需要事件时显式调用 setChecked(value, false)
     */
    set checked(value: boolean) {
        this.setChecked(value, true);
    }

    /**
     * 聚焦到开关
     */
    focus(): void {
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.focus();
        }
    }

    /**
     * 从开关移除焦点
     */
    blur(): void {
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.blur();
        }
    }

    /**
     * 检查是否有 checked 插槽
     */
    hasCheckedSlot(): boolean {
        return this.querySelector('[slot="checked"]') !== null;
    }

    /**
     * 检查是否有 unchecked 插槽
     */
    hasUncheckedSlot(): boolean {
        return this.querySelector('[slot="unchecked"]') !== null;
    }

    /**
     * 组件挂载后的生命周期钩子
     */
    mounted(): void {
        this.refresh();
        // 可以在这里添加额外的初始化逻辑
        this.updateAriaAttributes();
    }

    /**
     * 组件更新后的生命周期钩子
     */
    updated(): void {
        this.updateAriaAttributes();
        // 放在 updateAriaAttributes 之后，确保 aria-disabled 采用 effectiveDisabled
        this.syncFormState();
    }

    /**
     * attribute 写入后的状态校正
     */
    attributeChanged(name: string): void {
        if (name === 'default-checked') {
            // C-FORM-09：显式设置 defaultChecked 时立即替换重置目标
            setFormDefault(this, !!this.$data.defaultChecked);
        }
    }

    /**
     * 更新 ARIA 属性
     */
    private updateAriaAttributes(): void {
        const switchEl = this.shadowRoot?.querySelector('.switch') as HTMLElement;
        if (switchEl) {
            switchEl.setAttribute('aria-checked', this.$data.checked ? 'true' : 'false');
            // 与模板保持一致：fieldset 级联禁用也要反映到 aria-disabled
            switchEl.setAttribute('aria-disabled', this.isEffectivelyDisabled() ? 'true' : 'false');
            // loading 是异步忙态，用 aria-busy 表达而不是 disabled
            switchEl.setAttribute('aria-busy', this.$data.loading ? 'true' : 'false');
        }
    }
}

export { SolelySwitch };
export default SolelySwitch;
