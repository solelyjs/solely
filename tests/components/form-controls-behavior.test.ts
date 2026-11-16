/**
 * checkbox / switch 真实行为测试
 *
 * ⚠️ jsdom 27 的 ElementInternals 不提供 form / setFormValue / setValidity / validity，
 * 也不会为表单关联自定义元素自动调用 formAssociatedCallback / formResetCallback。
 * 因此这里沿用 form-association-wiring.test.ts 的「替身 internals」，
 * 并在 jsdom 不自动触发的场景下调用组件公开的标准生命周期回调，
 * 以验证组件内部的装配（write / anchors / 消息回退）与公开 API 代理。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import '../../src/components/elements/switch';
import '../../src/components/elements/checkbox';

import { clearBody, getShadowRoot, mountAndWait, tick } from '../helpers';

interface InternalsRecord {
    el: HTMLElement;
    formValues: Array<{ value: unknown; state: unknown }>;
    validations: Array<{ flags: ValidityStateFlags; message: string; anchor?: Element }>;
    validity: ValidityState & { invalid: boolean };
    validationMessage: string;
}

const records = new WeakMap<HTMLElement, InternalsRecord>();

const EMPTY_FLAGS = {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valueMissing: false,
};

function createRecord(el: HTMLElement): InternalsRecord {
    const record: InternalsRecord = {
        el,
        formValues: [],
        validations: [],
        validity: { ...EMPTY_FLAGS, valid: true, invalid: false },
        validationMessage: '',
    };

    const internals = {
        get form() {
            return el.closest('form');
        },
        get validity() {
            return record.validity;
        },
        get validationMessage() {
            return record.validationMessage;
        },
        setFormValue(value: unknown, state: unknown) {
            record.formValues.push({ value, state });
        },
        setValidity(flags: ValidityStateFlags = {}, message = '', anchor?: Element) {
            record.validations.push({ flags, message, anchor });
            const invalid = Object.values(flags).some(Boolean);
            record.validity = {
                ...EMPTY_FLAGS,
                ...flags,
                valid: !invalid,
                invalid,
            };
            record.validationMessage = message;
        },
        checkValidity() {
            return record.validity.valid;
        },
        reportValidity() {
            return record.validity.valid;
        },
    };

    records.set(el, record);
    return internals as unknown as InternalsRecord;
}

const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'attachInternals');

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
        configurable: true,
        writable: true,
        value(this: HTMLElement) {
            return createRecord(this);
        },
    });
});

afterAll(() => {
    if (originalDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'attachInternals', originalDescriptor);
    }
});

function lastValue(el: HTMLElement): unknown {
    const record = records.get(el);
    expect(record, '组件应在 created() 中调用 attachInternals()').toBeTruthy();
    return record!.formValues.at(-1)?.value;
}

function lastValidation(el: HTMLElement) {
    const record = records.get(el);
    expect(record).toBeTruthy();
    return record!.validations.at(-1);
}

function controlOf(el: HTMLElement, selector: string): HTMLElement {
    const control = getShadowRoot(el).querySelector(selector);
    if (!control) throw new Error(`未找到内部控件 ${selector}`);
    return control as HTMLElement;
}

function pressKey(target: EventTarget, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
}

describe('solely-switch 行为与公开 API', () => {
    beforeEach(() => {
        clearBody();
    });

    it('formResetCallback 通过 write 静默恢复初始态，并派发 source=reset 的 change', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>('solely-switch', { name: 'notify', checked: true }, 20, form);

        const changes: CustomEvent[] = [];
        el.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        el.setChecked(false, true);
        await tick();
        expect(el.getChecked()).toBe(false);
        expect(lastValue(el)).toBeNull();

        el.formResetCallback();
        await tick();

        // write() 以 silent=true 写回，change 只来自 reset 路径
        expect(el.getChecked()).toBe(true);
        expect(lastValue(el)).toBe('on');
        expect(changes).toHaveLength(1);
        expect(changes[0].detail).toMatchObject({
            name: 'notify',
            checked: true,
            previousChecked: false,
            source: 'reset',
        });
    });

    it('formAssociatedCallback 重新同步提交值，并用 missingMessage 生成 valueMissing 文案', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>('solely-switch', { name: 'notify', required: true }, 20, form);

        // jsdom 不会在换 form owner 时自动调用该回调，这里调用公开的组件回调
        el.formAssociatedCallback();
        await tick();

        expect(lastValue(el)).toBeNull();
        expect(lastValidation(el)!.flags.valueMissing).toBe(true);
        expect(lastValidation(el)!.message).toBe('请勾选此项');
        expect(lastValidation(el)!.anchor).toBe(controlOf(el, '.switch'));
        expect(el.validity.valueMissing).toBe(true);
        expect(el.validity.valid).toBe(false);
        expect(el.validationMessage).toBe('请勾选此项');
    });

    it('invalidMessage 覆盖内置 valueMissing 文案', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>(
            'solely-switch',
            { name: 'notify', required: true, 'invalid-message': '请先开启通知' },
            20,
            form,
        );

        el.formAssociatedCallback();
        await tick();

        expect(lastValidation(el)!.flags.valueMissing).toBe(true);
        expect(el.validationMessage).toBe('请先开启通知');
    });

    it('setCustomValidity 在无显式锚点时通过 anchors 回退到内部控件', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>('solely-switch', { name: 'notify' }, 20, form);
        const control = controlOf(el, '.switch');

        el.setCustomValidity('自定义错误');
        await tick();

        const validation = lastValidation(el)!;
        expect(validation.flags.customError).toBe(true);
        expect(validation.message).toBe('自定义错误');
        expect(validation.anchor).toBe(control);
        expect(el.checkValidity()).toBe(false);
        expect(el.reportValidity()).toBe(false);
        expect(el.validity.customError).toBe(true);

        el.setCustomValidity('');
        await tick();

        expect(el.checkValidity()).toBe(true);
        expect(el.reportValidity()).toBe(true);
        expect(el.validationMessage).toBe('');
    });

    it('willValidate 反映作者 disabled 与表单禁用态', async () => {
        const el = await mountAndWait<any>('solely-switch', { name: 'notify' });
        expect(el.willValidate).toBe(true);

        el.disabled = true;
        await tick();
        expect(el.willValidate).toBe(false);
        expect(el.validity.valid).toBe(true);

        el.disabled = false;
        await tick();
        expect(el.willValidate).toBe(true);

        el.formDisabledCallback(true);
        await tick();
        expect(el.willValidate).toBe(false);
        expect(el.validity.valid).toBe(true);
    });

    it('handleKeyDown 用 Space / Enter 切换选中', async () => {
        const el = await mountAndWait<any>('solely-switch', { name: 'notify' });
        const control = controlOf(el, '.switch');

        const space = pressKey(control, ' ');
        await tick();
        expect(space.defaultPrevented).toBe(true);
        expect(el.getChecked()).toBe(true);

        const enter = pressKey(control, 'Enter');
        await tick();
        expect(enter.defaultPrevented).toBe(true);
        expect(el.getChecked()).toBe(false);
    });

    it('handleKeyDown 对 disabled / loading 不响应', async () => {
        const disabled = await mountAndWait<any>('solely-switch', { name: 'off', disabled: true });
        const disabledKey = pressKey(controlOf(disabled, '.switch'), ' ');
        await tick();
        expect(disabledKey.defaultPrevented).toBe(false);
        expect(disabled.getChecked()).toBe(false);

        const loading = await mountAndWait<any>('solely-switch', { name: 'busy', loading: true });
        const loadingKey = pressKey(controlOf(loading, '.switch'), 'Enter');
        await tick();
        expect(loadingKey.defaultPrevented).toBe(false);
        expect(loading.getChecked()).toBe(false);
    });

    it('disabled / loading 时 tabindex=-1，恢复后回到 0', async () => {
        const el = await mountAndWait<any>('solely-switch', { name: 'notify', disabled: true });
        const control = controlOf(el, '.switch');
        expect(control.getAttribute('tabindex')).toBe('-1');

        el.disabled = false;
        await tick();
        expect(control.getAttribute('tabindex')).toBe('0');

        el.loading = true;
        await tick();
        expect(control.getAttribute('tabindex')).toBe('-1');
    });

    it('focus / blur 将焦点移入 shadow 内的 role=switch 元素', async () => {
        const el = await mountAndWait<any>('solely-switch', { name: 'notify' });
        const control = controlOf(el, '.switch');

        el.focus();
        expect(document.activeElement).toBe(el);
        expect(getShadowRoot(el).activeElement).toBe(control);

        el.blur();
        expect(getShadowRoot(el).activeElement).toBeNull();
        expect(document.activeElement).not.toBe(el);
    });
});

describe('solely-checkbox 行为与公开 API', () => {
    beforeEach(() => {
        clearBody();
    });

    it('formAssociatedCallback 重新同步提交值，并用 missingMessage 生成 valueMissing 文案', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree', required: true }, 20, form);

        // jsdom 不会在换 form owner 时自动调用该回调，这里调用公开的组件回调
        el.formAssociatedCallback();
        await tick();

        expect(lastValue(el)).toBeNull();
        expect(lastValidation(el)!.flags.valueMissing).toBe(true);
        expect(lastValidation(el)!.message).toBe('请勾选此项');
        expect(lastValidation(el)!.anchor).toBe(controlOf(el, '.checkbox'));
        expect(el.validity.valueMissing).toBe(true);
        expect(el.validity.valid).toBe(false);
        expect(el.validationMessage).toBe('请勾选此项');
    });

    it('invalidMessage 覆盖内置 valueMissing 文案', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>(
            'solely-checkbox',
            { name: 'agree', required: true, 'invalid-message': '请先同意协议' },
            20,
            form,
        );

        el.formAssociatedCallback();
        await tick();

        expect(lastValidation(el)!.flags.valueMissing).toBe(true);
        expect(el.validationMessage).toBe('请先同意协议');
    });

    it('setCustomValidity 在无显式锚点时通过 anchors 回退到内部控件', async () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree' }, 20, form);
        const control = controlOf(el, '.checkbox');

        el.setCustomValidity('自定义错误');
        await tick();

        const validation = lastValidation(el)!;
        expect(validation.flags.customError).toBe(true);
        expect(validation.message).toBe('自定义错误');
        expect(validation.anchor).toBe(control);
        expect(el.checkValidity()).toBe(false);
        expect(el.reportValidity()).toBe(false);

        el.setCustomValidity('');
        await tick();

        expect(el.checkValidity()).toBe(true);
        expect(el.reportValidity()).toBe(true);
        expect(el.validationMessage).toBe('');
    });

    it('willValidate 反映作者 disabled 与表单禁用态', async () => {
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree' });
        expect(el.willValidate).toBe(true);

        el.disabled = true;
        await tick();
        expect(el.willValidate).toBe(false);
        expect(el.validity.valid).toBe(true);

        el.disabled = false;
        await tick();
        expect(el.willValidate).toBe(true);

        el.formDisabledCallback(true);
        await tick();
        expect(el.willValidate).toBe(false);
    });

    it('handleKeyDown 用 Space / Enter 切换选中，对 disabled 不响应', async () => {
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree' });
        const control = controlOf(el, '.checkbox');

        const space = pressKey(control, ' ');
        await tick();
        expect(space.defaultPrevented).toBe(true);
        expect(el.getChecked()).toBe(true);

        const enter = pressKey(control, 'Enter');
        await tick();
        expect(enter.defaultPrevented).toBe(true);
        expect(el.getChecked()).toBe(false);

        const disabled = await mountAndWait<any>('solely-checkbox', { name: 'off', disabled: true });
        const disabledKey = pressKey(controlOf(disabled, '.checkbox'), ' ');
        await tick();
        expect(disabledKey.defaultPrevented).toBe(false);
        expect(disabled.getChecked()).toBe(false);
    });

    it('disabled 时 tabindex=-1，恢复后回到 0', async () => {
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree', disabled: true });
        const control = controlOf(el, '.checkbox');
        expect(control.getAttribute('tabindex')).toBe('-1');

        el.disabled = false;
        await tick();
        expect(control.getAttribute('tabindex')).toBe('0');
    });

    it('setIndeterminate 同步 aria-checked，点击后半选态转为选中', async () => {
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree' });
        const control = controlOf(el, '.checkbox');

        el.setIndeterminate(true);
        await tick();
        expect(el.indeterminate).toBe(true);
        expect(el.hasAttribute('indeterminate')).toBe(true);
        expect(control.getAttribute('aria-checked')).toBe('mixed');

        el.setIndeterminate(false);
        await tick();
        expect(el.indeterminate).toBe(false);
        expect(el.hasAttribute('indeterminate')).toBe(false);
        expect(control.getAttribute('aria-checked')).toBe('false');

        el.setIndeterminate(true);
        await tick();
        control.click();
        await tick();

        expect(el.getChecked()).toBe(true);
        expect(el.indeterminate).toBe(false);
        expect(el.hasAttribute('indeterminate')).toBe(false);
        expect(control.getAttribute('aria-checked')).toBe('true');
    });

    it('focus / blur 将焦点移入 shadow 内的 role=checkbox 元素', async () => {
        const el = await mountAndWait<any>('solely-checkbox', { name: 'agree' });
        const control = controlOf(el, '.checkbox');

        el.focus();
        expect(document.activeElement).toBe(el);
        expect(getShadowRoot(el).activeElement).toBe(control);

        el.blur();
        expect(getShadowRoot(el).activeElement).toBeNull();
        expect(document.activeElement).not.toBe(el);
    });
});
