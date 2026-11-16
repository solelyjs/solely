/**
 * Solely Radio 组件
 * 单选框组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
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
} from '../../../shared/form-associated';
import { oneOf } from '../../../shared/enum';
import type { RadioProps, RadioType } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** 颜色类型白名单：非法值回退到 primary，避免产出无样式的 radio--xxx 类 */
const RADIO_TYPES: readonly RadioType[] = ['primary', 'success', 'warning', 'error'];

/**
 * 所有已创建的 radio 实例（弱引用，避免阻止元素回收）
 *
 * 用于在按 name 分组时同时发现「只写了 property（el.name = 'g'）」
 * 和「只写了 attribute（name="g"）」的实例。
 *
 * 注意：不能做成 class 的 static private 字段。类装饰器会返回新的子类并重新绑定类名，
 * 方法内的类名引用会指向装饰后的子类，从而丢失原类的 private brand。
 */
const radioInstances = new Set<WeakRef<SolelyRadio>>();

/** 显式分组容器选择器：role="radiogroup" 或 data-radio-group */
const RADIO_GROUP_SELECTOR = '[role="radiogroup"], [data-radio-group]';

@CustomElement({
    tagName: 'solely-radio',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'checked', type: 'boolean', default: false },
        { name: 'defaultChecked', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false, reflect: true },
        { name: 'content', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'name', type: 'string', default: '' },
        // 显式分组：同 group 值的 radio 互斥，无需依赖 name
        { name: 'group', type: 'string', default: '' },
        { name: 'block', type: 'boolean', default: false },
        { name: 'ariaLabel', type: 'string', default: '' },
    ],
    model: { prop: 'checked', event: 'change' },
})
class SolelyRadio extends BaseElement<RadioProps> {
    /** 表单关联自定义元素（C-FORM-01） */
    static readonly formAssociated = true;

    created(): void {
        radioInstances.add(new WeakRef(this));

        initFormAssociation(this, {
            family: 'boolean',
            read: () => !!this.$data.checked,
            write: (value, _silent) => this.setChecked(!!value, true),
            // 未选中不产生条目；选中且 value 为空时基座会归一化为 'on'
            encode: value => (value ? [this.$data.value || ''] : null),
            name: () => this.resolveFieldName(),
            disabled: () => !!this.$data.disabled,
            ariaTarget: () => this.getControlElement(),
            tabTargets: () => this.getControlElement(),
            anchors: () => {
                const control = this.getControlElement();
                return control ? [control] : null;
            },
            readDefault: () => (this.$data.defaultChecked ? true : undefined),
            changeDetail: (value, previousValue, source) => ({
                name: this.resolveFieldName(),
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

    /** 承载 role="radio" 的元素 */
    private getControlElement(): HTMLElement | null {
        return (this.shadowRoot?.querySelector('.radio') as HTMLElement | null) ?? null;
    }

    /** 显式分组容器 */
    private getGroupContainer(): HTMLElement | null {
        return (this.closest(RADIO_GROUP_SELECTOR) as HTMLElement | null) ?? null;
    }

    /** 提交字段名：自身 name → 分组容器 name → 显式 group */
    private resolveFieldName(): string {
        return (
            (this.$data.name as string) ||
            this.getAttribute('name') ||
            this.getGroupContainer()?.getAttribute('name') ||
            (this.$data.group as string) ||
            ''
        );
    }

    /**
     * 获取 checked 属性（允许外部通过 event.target.checked 访问）
     */
    get checked(): boolean {
        return this.$data.checked;
    }

    /**
     * 设置 checked 属性
     * 契约 D3：property 赋值静默，需要事件时显式调用 setChecked(value, false)
     */
    set checked(value: boolean) {
        this.setChecked(value, true);
    }

    /**
     * 获取 value 属性（允许外部通过 event.target.value 访问）
     */
    get value(): string {
        return this.$data.value;
    }

    /**
     * 设置 value 属性
     */
    set value(val: string) {
        this.$data.value = val;
        this.syncFormState();
    }

    /**
     * 模板与视觉统一读取：作者 disabled 与 fieldset 级联禁用的合并结果。
     */
    isEffectivelyDisabled(): boolean {
        return effectiveDisabled(this);
    }

    /**
     * 获取 radio class 对象
     */
    getRadioClasses(): Record<string, boolean> {
        return {
            'is-checked': !!this.$data.checked,
            'is-disabled': this.isEffectivelyDisabled(),
            [`radio--${oneOf(this.$data.type, RADIO_TYPES, 'primary')}`]: true,
            'radio--block': !!this.$data.block,
        };
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        // 初始即存在多个 checked 时进行去重（DOM 顺序靠后者生效，与原生 radio 行为一致）
        if (this.$data.checked) {
            this.uncheckSameNameRadios();
        }
        this.refresh();
        this.updateAriaAttributes();
    }

    updated(): void {
        this.updateAriaAttributes();
        this.updateGroupTabIndex();
        // 放在 ARIA 更新之后，确保 aria-disabled 采用 effectiveDisabled
        this.syncFormState();
    }

    private updateAriaAttributes(): void {
        const radioEl = this.getControlElement();
        if (radioEl) {
            radioEl.setAttribute('aria-checked', this.$data.checked ? 'true' : 'false');
            radioEl.setAttribute('aria-disabled', effectiveDisabled(this) ? 'true' : 'false');
        }
    }

    /**
     * 点击事件处理
     */
    handleClick(_event: Event): void {
        if (effectiveDisabled(this) || this.$data.checked) return;

        this.commitSelection('user');
    }

    handleKeyDown(event: KeyboardEvent): void {
        if (effectiveDisabled(this)) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!this.$data.checked) this.commitSelection('user');
            return;
        }

        if (
            event.key === 'ArrowRight' ||
            event.key === 'ArrowDown' ||
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowUp'
        ) {
            // 只有显式分组内的 radio 才响应方向键（C-FORM-RG 的 roving tabindex 语义）
            const members = this.getGroupMembers();
            // 禁用项不参与遍历：跳过而不是聚焦并选中它们
            const eligible = members.filter(member => !effectiveDisabled(member));
            if (eligible.length <= 1) return;

            event.preventDefault();
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const current = eligible.indexOf(this);
            const start = current === -1 ? 0 : current;
            const next = eligible[(start + step + eligible.length) % eligible.length];

            next.focus();
            if (!next.$data.checked) next.commitSelection('user');
        }
    }

    /**
     * 提交选中（用户交互或 API）
     */
    private commitSelection(source: 'user' | 'api'): void {
        const previousChecked = !!this.$data.checked;
        this.uncheckSameNameRadios();
        this.$data.checked = true;
        this.syncFormState();
        this.updateGroupTabIndex();

        emitChange(this, {
            name: this.resolveFieldName(),
            value: this.$data.value,
            checked: true,
            previousChecked,
            source,
        });
    }

    /**
     * 获取分组名称
     *
     * 同时读取 $data（property 写法）与 attribute（模板写法），两者混用时以 $data 为准，
     * 这保证 el.name = 'g' 与 name="g" 两种写法可以互相识别为同一组。
     */
    private getGroupName(): string {
        return (this.$data.name as string) || this.getAttribute('name') || '';
    }

    /**
     * 分组键
     *
     * 优先级：name → group 属性 → 分组容器 name → 容器自身。
     * 最后一条让 `role="radiogroup"` / `data-radio-group` 内的无名 radio 也能显式成组，
     * 不再依赖 `querySelectorAll('[name]')` 的隐式分组。
     */
    private getGroupKey(): string {
        const name = this.getGroupName();
        if (name) return name;

        const group = (this.$data.group as string) || this.getAttribute('group') || '';
        if (group) return group;

        const container = this.getGroupContainer();
        if (!container) return '';

        return container.getAttribute('name') || container.getAttribute('data-name') || '\u0000radiogroup';
    }

    /**
     * 分组边界（互斥只在同一分组边界内生效）
     *
     * 规则：最近的 role="radiogroup" / data-radio-group 容器 → 最近的 <form> → 根节点。
     * 两个独立表单或独立分组容器内的同组 radio 不会跨容器误互斥。
     */
    private getGroupBoundary(): Element | Document | ShadowRoot {
        const container = this.getGroupContainer();
        if (container) return container;

        const form = this.closest('form');
        if (form) return form;

        return this.getRootNode() as Document | ShadowRoot;
    }

    /** 当前分组身份；无 name/group 且不在显式容器内时返回 null（独立 radio） */
    private getGroupIdentity(): { key: string; boundary: Element | Document | ShadowRoot } | null {
        const key = this.getGroupKey();
        if (!key) return null;
        return { key, boundary: this.getGroupBoundary() };
    }

    /** 同组实例（按 DOM 顺序，用于 roving tabindex 与方向键） */
    private getGroupMembers(): SolelyRadio[] {
        const identity = this.getGroupIdentity();
        if (!identity) return [this];

        const members: SolelyRadio[] = [];

        radioInstances.forEach(ref => {
            const other = ref.deref();
            if (!other) {
                radioInstances.delete(ref);
                return;
            }

            if (!other.isConnected) return;

            const otherIdentity = other.getGroupIdentity();
            if (!otherIdentity) return;
            if (otherIdentity.key !== identity.key) return;
            if (otherIdentity.boundary !== identity.boundary) return;

            members.push(other);
        });

        const currentIndex = members.indexOf(this);
        if (currentIndex === -1) members.push(this);

        members.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

        return members;
    }

    /**
     * roving tabindex：选中项（或第一个可用项）进 Tab 序，其余 -1
     */
    private updateGroupTabIndex(): void {
        const members = this.getGroupMembers();
        const eligible = members.filter(member => !effectiveDisabled(member));
        const chosen = eligible.find(member => member.$data.checked) ?? eligible[0];

        for (const member of members) {
            member.getControlElement()?.setAttribute('tabindex', member === chosen ? '0' : '-1');
        }
    }

    /**
     * 取消同组其他单选框的选中状态
     *
     * 同时覆盖 property 写法（el.name = 'g'）、attribute 写法（name="g"）与显式 group，
     * 并且仅在相同的分组边界（radiogroup 容器 / form / 根节点）内互斥。
     */
    private uncheckSameNameRadios(): void {
        const identity = this.getGroupIdentity();
        if (!identity) return;

        radioInstances.forEach(ref => {
            const other = ref.deref();
            if (!other) {
                radioInstances.delete(ref);
                return;
            }

            // 跳过自己
            if (other === this) return;

            const otherIdentity = other.getGroupIdentity();
            if (!otherIdentity) return;
            if (otherIdentity.key !== identity.key) return;
            if (otherIdentity.boundary !== identity.boundary) return;

            // 内部去重必须静默，避免一次用户点击派发多个 change
            other.setChecked(false, true);
        });
    }

    /**
     * 设置选中状态
     * @param checked - 新状态
     * @param silent - 为 true 时不派发 change（重置与 property 赋值走静默路径）
     */
    public setChecked(checked: boolean, silent = false): void {
        const previousChecked = !!this.$data.checked;

        if (checked) {
            this.uncheckSameNameRadios();
        }

        this.$data.checked = !!checked;
        this.syncFormState();
        this.updateGroupTabIndex();

        if (!silent) {
            emitChange(this, {
                name: this.resolveFieldName(),
                value: this.$data.value,
                checked: !!checked,
                previousChecked,
                source: 'api',
            });
        }
    }

    /** 聚焦到承载 role="radio" 的元素 */
    focus(): void {
        (this.getControlElement() as HTMLElement & { focus?: () => void })?.focus?.();
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
     * 获取选中状态
     */
    public getChecked(): boolean {
        return this.$data.checked;
    }
}

export default SolelyRadio;
export { SolelyRadio };
