/**
 * Solely Checkbox 组件
 * 复选框组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { oneOf } from '../../../shared/enum';
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
import type { CheckboxProps, CheckboxRefs, CheckboxSize, CheckboxType } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** 颜色类型白名单：非法值回退到 primary，避免产出无样式的 checkbox--xxx 类 */
const CHECKBOX_TYPES: readonly CheckboxType[] = ['primary', 'success', 'warning', 'error'];

@CustomElement({
    tagName: 'solely-checkbox',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'defaultChecked', type: 'boolean', default: false },
        { name: 'indeterminate', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false, reflect: true },
        { name: 'required', type: 'boolean', default: false, reflect: true },
        { name: 'content', type: 'string', default: '' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'block', type: 'boolean', default: false },
        { name: 'name', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'invalidMessage', type: 'string', default: '' },
        { name: 'ariaLabel', type: 'string', default: '' },
    ],
    model: { prop: 'checked', event: 'change' },
})
class SolelyCheckbox extends BaseElement<CheckboxProps, CheckboxRefs> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): CheckboxSize {
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

    /** 承载 role="checkbox" 的元素 */
    private getControlElement(): HTMLElement | null {
        return (this.shadowRoot?.querySelector('.checkbox') as HTMLElement | null) ?? null;
    }

    /**
     * 模板与视觉统一读取：作者 disabled 与 fieldset 级联禁用的合并结果。
     */
    isEffectivelyDisabled(): boolean {
        return effectiveDisabled(this);
    }

    /**
     * 获取 checkbox class 对象
     */
    getCheckboxClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        const size = this.$data.size || 'medium';
        const type = oneOf(this.$data.type, CHECKBOX_TYPES, 'primary');

        // 尺寸映射
        if (size === 'small') {
            classes['checkbox--sm'] = true;
        } else if (size === 'large') {
            classes['checkbox--lg'] = true;
        } else {
            classes['checkbox--md'] = true;
        }
        classes[`checkbox--${type}`] = true;
        classes['is-checked'] = !!this.$data.checked;
        classes['is-indeterminate'] = !!this.$data.indeterminate;
        classes['is-disabled'] = this.isEffectivelyDisabled();
        classes['checkbox--block'] = !!this.$data.block;

        return classes;
    }

    /**
     * 焦点顺序：禁用时从 Tab 序列中移除，避免“可聚焦但不可操作”
     */
    getTabIndex(): string {
        // 返回字符串而非数字：数字 -1 与非聚焦元素的默认 tabIndex 相同，
        // 渲染层会认为“无变化”而不写 attribute；字符串可确保 tabindex="-1" 真正落到 DOM。
        return effectiveDisabled(this) ? '-1' : '0';
    }

    /**
     * 点击事件处理
     */
    handleClick(_event: Event): void {
        if (effectiveDisabled(this)) {
            return;
        }

        this.toggle();
    }

    /**
     * 键盘事件处理
     */
    handleKeyDown(event: KeyboardEvent): void {
        if (effectiveDisabled(this)) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleClick(event);
        }
    }

    /**
     * 切换选中状态
     */
    toggle(): void {
        if (effectiveDisabled(this)) {
            return;
        }

        // 半选状态下点击应确定变为选中，避免受底层 checked 值影响而出现“点击后意外取消”的行为
        const previousChecked = !!this.$data.checked;
        const wasIndeterminate = !!this.$data.indeterminate;
        this.clearIndeterminate();
        this.$data.checked = wasIndeterminate ? true : !this.$data.checked;

        this.syncFormState();
        this.emitCheckedChange(previousChecked, 'user');
    }

    /** 派发统一 change（值未变化时不派发，C-FORM-21 / C-FORM-26） */
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
     * 设置选中状态
     * @param checked - 新状态
     * @param silent - 为 true 时不派发 change（重置与 property 赋值走静默路径）
     */
    setChecked(checked: boolean, silent = false): void {
        // 仅更新选中状态，不再隐式清除 indeterminate；
        // 半选是独立受控状态，只有用户点击（toggle）或显式 setIndeterminate(false) 才清除
        const previousChecked = !!this.$data.checked;
        this.$data.checked = !!checked;
        this.syncFormState();

        if (!silent) {
            this.emitCheckedChange(previousChecked, 'api');
        }
    }

    /**
     * 清除半选状态，并同步移除宿主上的 indeterminate 属性，避免属性与内部状态不一致
     */
    private clearIndeterminate(): void {
        this.$data.indeterminate = false;
        if (this.hasAttribute('indeterminate')) {
            this.removeAttribute('indeterminate');
        }
    }

    /**
     * 获取选中状态
     */
    getChecked(): boolean {
        return this.$data.checked;
    }

    /**
     * checked 属性的 getter
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
     * 设置半选状态
     */
    setIndeterminate(indeterminate: boolean): void {
        if (indeterminate) {
            this.$data.indeterminate = true;
        } else {
            this.clearIndeterminate();
        }
    }

    /**
     * 聚焦到复选框
     */
    focus(): void {
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            checkboxEl.focus();
        }
    }

    /**
     * 从复选框移除焦点
     */
    blur(): void {
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            checkboxEl.blur();
        }
    }

    /**
     * 组件挂载后的生命周期钩子
     */
    mounted(): void {
        this.refresh();
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
        const checkboxEl = this.shadowRoot?.querySelector('.checkbox') as HTMLElement;
        if (checkboxEl) {
            const ariaChecked = this.$data.indeterminate ? 'mixed' : this.$data.checked ? 'true' : 'false';
            checkboxEl.setAttribute('aria-checked', ariaChecked);
            // 与模板保持一致：fieldset 级联禁用也要反映到 aria-disabled
            checkboxEl.setAttribute('aria-disabled', this.isEffectivelyDisabled() ? 'true' : 'false');
        }
    }
}

export default SolelyCheckbox;
export { SolelyCheckbox };
