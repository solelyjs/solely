/**
 * 表单关联接线测试（input / checkbox / switch / radio / button / select）
 *
 * ⚠️ jsdom 27 的 ElementInternals 不提供 form / setFormValue / setValidity / validity，
 * `new FormData(form)` 也不会收集自定义元素。因此本文件使用「替身 internals」只验证
 * 组件是否正确调用基座 API，**不能**证明真实浏览器的提交、校验阻断与重置行为。
 *
 * 仅在真实浏览器成立的结论：
 * - `setFormValue` 的内容真正进入 `new FormData(form)`
 * - `setValidity` 阻断 `form.requestSubmit()` / 原生提交
 * - 平台自动调用 `formAssociatedCallback` / `formResetCallback` / `formDisabledCallback`
 * - `formStateRestoreCallback`（本版本按 C-FORM-06 明确不支持）
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/components/elements/input';
import '../../src/components/elements/checkbox';
import '../../src/components/elements/switch';
import '../../src/components/elements/radio';
import '../../src/components/elements/button';
import '../../src/components/elements/select';

const tick = (ms = 20) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

beforeEach(() => {
    document.body.innerHTML = '';
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

function hasValueMissing(el: HTMLElement): boolean {
    return records.get(el)?.validity.valueMissing === true;
}

describe('solely-input 表单关联', () => {
    it('挂载后按 name 写入 setFormValue，空值也提交空字符串', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        expect(lastValue(el)).toBe('');

        el.setValue('hello', true);
        expect(lastValue(el)).toBe('hello');
    });

    it('无 name 时提交 null，不产生条码', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        expect(lastValue(el)).toBeNull();
    });

    it('required 空值写入 valueMissing，并将 anchor 指向内部原生控件', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        el.setAttribute('required', '');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        const validation = lastValidation(el)!;
        expect(validation.flags.valueMissing).toBe(true);
        expect(validation.message.length).toBeGreaterThan(0);
        expect(validation.anchor).toBe(el.shadowRoot.querySelector('input, textarea'));

        el.setValue('ok', true);
        await tick();
        expect(hasValueMissing(el)).toBe(false);
    });

    it('formDisabledCallback 清空提交值并标记 ARIA（jsdom 不会自动禁用输入）', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        el.setAttribute('value', 'abc');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.formDisabledCallback(true);
        await tick();

        expect(lastValue(el)).toBeNull();
        const control = el.shadowRoot.querySelector('input, textarea') as HTMLElement;
        // fieldset 不会穿透 shadow root 禁用内部原生控件，必须由组件显式同步
        expect((control as HTMLInputElement).disabled).toBe(true);
        expect(control.getAttribute('aria-disabled')).toBe('true');
        expect(control.getAttribute('tabindex')).toBe('-1');
        expect((el.shadowRoot.querySelector('.form-control') as HTMLElement).classList.contains('is-disabled')).toBe(
            true,
        );

        el.formDisabledCallback(false);
        await tick();
        expect(lastValue(el)).toBe('abc');
        expect((control as HTMLInputElement).disabled).toBe(false);
    });

    it('formResetCallback 恢复初始值，并在值变化时派发 source=reset', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        el.setAttribute('value', 'initial');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        const changes: CustomEvent[] = [];
        el.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        el.setValue('changed', true);
        el.formResetCallback();
        await tick();

        expect(el.getValue()).toBe('initial');
        expect(changes).toHaveLength(1);
        expect(changes[0].detail.source).toBe('reset');
        expect(changes[0].detail.previousValue).toBe('changed');
    });

    it('显式 default-value 优先于初始值作为重置目标', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        el.setAttribute('value', 'initial');
        el.setAttribute('default-value', 'fallback');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.formResetCallback();
        await tick();

        expect(el.getValue()).toBe('fallback');
    });

    it('property 写入 defaultValue 会同步重置目标', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        el.setAttribute('value', 'initial');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.defaultValue = 'later';
        el.setValue('changed', true);
        el.formResetCallback();
        await tick();

        expect(el.getValue()).toBe('later');
        expect(el.getAttribute('default-value')).toBe('later');
    });

    it('用户输入派发 source=user 的 change，并同步提交值', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-input') as any;
        el.setAttribute('name', 'q');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        const changes: CustomEvent[] = [];
        el.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        const control = el.shadowRoot.querySelector('input') as HTMLInputElement;
        control.focus();
        control.value = 'typed';
        control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        control.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        await tick();

        expect(changes).toHaveLength(1);
        expect(changes[0].detail).toMatchObject({
            name: 'q',
            value: 'typed',
            previousValue: '',
            source: 'user',
        });
        expect(lastValue(el)).toBe('typed');
    });

    it('本版本不实现 formStateRestoreCallback（C-FORM-06）', () => {
        const el = document.createElement('solely-input') as any;
        expect(el.formStateRestoreCallback).toBeUndefined();
    });
});

describe('solely-checkbox / solely-switch 表单关联', () => {
    it('checkbox 未选中提交 null，选中后按 value 提交（空值归一化为 on）', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        expect(lastValue(el)).toBeNull();

        el.shadowRoot.querySelector('.checkbox').click();
        await tick();

        expect(lastValue(el)).toBe('on');
    });

    it('checkbox 自定义 value 直接提交', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        el.setAttribute('value', 'yes');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.shadowRoot.querySelector('.checkbox').click();
        await tick();

        expect(lastValue(el)).toBe('yes');
    });

    it('checkbox required 未选中写入 valueMissing，选中后清空', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        el.setAttribute('required', '');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        expect(lastValidation(el)!.flags.valueMissing).toBe(true);
        expect(lastValidation(el)!.message.length).toBeGreaterThan(0);

        el.shadowRoot.querySelector('.checkbox').click();
        await tick();
        expect(hasValueMissing(el)).toBe(false);
    });

    it('checkbox 重置恢复捕获的初始选中态', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        el.setAttribute('checked', '');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.setChecked(false, true);
        el.formResetCallback();
        await tick();

        expect(el.checked).toBe(true);
    });

    it('property 写入 defaultChecked 会同步重置目标', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        el.defaultChecked = true;
        el.setChecked(false, true);
        el.formResetCallback();
        await tick();

        expect(el.checked).toBe(true);
        expect(el.hasAttribute('default-checked')).toBe(true);
    });

    it('formDisabledCallback 后点击不改变 checkbox/switch 状态', async () => {
        const form = document.createElement('form');
        const checkbox = document.createElement('solely-checkbox') as any;
        const toggle = document.createElement('solely-switch') as any;
        form.appendChild(checkbox);
        form.appendChild(toggle);
        document.body.appendChild(form);
        await tick();

        checkbox.formDisabledCallback(true);
        toggle.formDisabledCallback(true);
        await tick();

        expect(checkbox.shadowRoot.querySelector('.checkbox').getAttribute('aria-disabled')).toBe('true');
        expect(toggle.shadowRoot.querySelector('.switch').getAttribute('aria-disabled')).toBe('true');
        expect(checkbox.shadowRoot.querySelector('.checkbox').classList.contains('is-disabled')).toBe(true);
        expect(toggle.shadowRoot.querySelector('.switch').classList.contains('is-disabled')).toBe(true);

        checkbox.shadowRoot.querySelector('.checkbox').click();
        toggle.shadowRoot.querySelector('.switch').click();
        await tick();

        expect(checkbox.checked).toBe(false);
        expect(toggle.checked).toBe(false);

        checkbox.formDisabledCallback(false);
        toggle.formDisabledCallback(false);
        await tick();
        expect(checkbox.shadowRoot.querySelector('.checkbox').classList.contains('is-disabled')).toBe(false);
        expect(toggle.shadowRoot.querySelector('.switch').classList.contains('is-disabled')).toBe(false);
    });

    it('formDisabledCallback 后 radio 视觉与键盘入口同步禁用', async () => {
        const form = document.createElement('form');
        const radio = document.createElement('solely-radio') as any;
        radio.setAttribute('name', 'pick');
        radio.setAttribute('value', 'a');
        form.appendChild(radio);
        document.body.appendChild(form);
        await tick();

        radio.formDisabledCallback(true);
        await tick();

        const radioEl = radio.shadowRoot.querySelector('.radio') as HTMLElement;
        expect(radioEl.classList.contains('is-disabled')).toBe(true);
        expect(radioEl.getAttribute('aria-disabled')).toBe('true');
        expect(radioEl.getAttribute('tabindex')).toBe('-1');

        radio.formDisabledCallback(false);
        await tick();
        expect(radioEl.classList.contains('is-disabled')).toBe(false);
        expect(radioEl.getAttribute('aria-disabled')).toBe('false');
    });

    it('switch 选中后提交 value，change detail 含 previousChecked/source', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-switch') as any;
        el.setAttribute('name', 'notify');
        el.setAttribute('value', 'yes');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        const changes: CustomEvent[] = [];
        el.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        el.shadowRoot.querySelector('.switch').click();
        await tick();

        expect(lastValue(el)).toBe('yes');
        expect(changes).toHaveLength(1);
        expect(changes[0].detail).toMatchObject({
            name: 'notify',
            value: 'yes',
            checked: true,
            previousChecked: false,
            source: 'user',
        });
    });
});

describe('solely-radio 显式分组与表单关联', () => {
    it('role="radiogroup" 内的无名 radio 也能互斥', async () => {
        const group = document.createElement('div');
        group.setAttribute('role', 'radiogroup');

        const first = document.createElement('solely-radio') as any;
        const second = document.createElement('solely-radio') as any;
        group.appendChild(first);
        group.appendChild(second);
        document.body.appendChild(group);
        await tick();

        first.setChecked(true, true);
        second.shadowRoot.querySelector('.radio').click();
        await tick();

        expect(first.checked).toBe(false);
        expect(second.checked).toBe(true);
    });

    it('同 group 属性的无名 radio 互斥，不同 group 不互斥', async () => {
        const a = document.createElement('solely-radio') as any;
        const b = document.createElement('solely-radio') as any;
        const c = document.createElement('solely-radio') as any;
        a.setAttribute('group', 'g1');
        b.setAttribute('group', 'g1');
        c.setAttribute('group', 'g2');
        document.body.appendChild(a);
        document.body.appendChild(b);
        document.body.appendChild(c);
        await tick();

        a.setChecked(true, true);
        b.shadowRoot.querySelector('.radio').click();
        c.setChecked(true, true);
        await tick();

        expect(a.checked).toBe(false);
        expect(b.checked).toBe(true);
        expect(c.checked).toBe(true);
    });

    it('roving tabindex：选中项为 0，其余为 -1', async () => {
        const group = document.createElement('div');
        group.setAttribute('role', 'radiogroup');
        const first = document.createElement('solely-radio') as any;
        const second = document.createElement('solely-radio') as any;
        group.appendChild(first);
        group.appendChild(second);
        document.body.appendChild(group);
        await tick();

        second.setChecked(true, true);
        await tick();

        expect(first.shadowRoot.querySelector('.radio').getAttribute('tabindex')).toBe('-1');
        expect(second.shadowRoot.querySelector('.radio').getAttribute('tabindex')).toBe('0');
    });

    it('点击只派发一次 change，组内其他 radio 静默取消', async () => {
        const group = document.createElement('div');
        group.setAttribute('role', 'radiogroup');
        const first = document.createElement('solely-radio') as any;
        const second = document.createElement('solely-radio') as any;
        group.appendChild(first);
        group.appendChild(second);
        document.body.appendChild(group);
        await tick();

        first.setChecked(true, true);
        await tick();

        const changes: CustomEvent[] = [];
        group.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        second.shadowRoot.querySelector('.radio').click();
        await tick();

        expect(changes).toHaveLength(1);
        expect(changes[0].target).toBe(second);
        expect(changes[0].detail).toMatchObject({
            checked: true,
            previousChecked: false,
            source: 'user',
        });
    });

    it('选中 radio 提交 value，未选中提交 null', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-radio') as any;
        el.setAttribute('name', 'pick');
        el.setAttribute('value', 'a');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        expect(lastValue(el)).toBeNull();

        el.setChecked(true, true);
        await tick();
        expect(lastValue(el)).toBe('a');
    });

    it('方向键在组内移动并选中下一项', async () => {
        const group = document.createElement('div');
        group.setAttribute('role', 'radiogroup');
        const first = document.createElement('solely-radio') as any;
        const second = document.createElement('solely-radio') as any;
        group.appendChild(first);
        group.appendChild(second);
        document.body.appendChild(group);
        await tick();

        first.setChecked(true, true);
        await tick();

        first.shadowRoot
            .querySelector('.radio')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();

        expect(second.checked).toBe(true);
        expect(first.checked).toBe(false);
    });
});

describe('solely-select 表单关联', () => {
    const OPTIONS = JSON.stringify([
        { label: '选项A', value: 'a' },
        { label: '选项B', value: 'b' },
    ]);

    function createSelect(attrs: Record<string, string>): any {
        const form = document.createElement('form');
        const el = document.createElement('solely-select') as any;
        el.setAttribute('options', OPTIONS);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        form.appendChild(el);
        document.body.appendChild(form);
        return el;
    }

    function clickOption(el: any, index: number): void {
        (el.shadowRoot.querySelectorAll('.select__option')[index] as HTMLElement).click();
    }

    it('按 name 提交选中值，空选择不产生提交条目', async () => {
        const el = createSelect({ name: 'city' });
        await tick();

        expect(lastValue(el)).toBeNull();

        (el.shadowRoot.querySelector('.select') as HTMLElement).click();
        await tick();
        clickOption(el, 0);
        await tick();

        expect(el.getValue()).toBe('a');
        expect(lastValue(el)).toBe('a');
    });

    it('multiple 以同一 name 提交多个 FormData 条目', async () => {
        const el = createSelect({ name: 'tags', multiple: '' });
        await tick();

        (el.shadowRoot.querySelector('.select') as HTMLElement).click();
        await tick();
        clickOption(el, 0);
        await tick();
        clickOption(el, 1);
        await tick();

        const submitted = lastValue(el) as FormData;
        expect(submitted).toBeInstanceOf(FormData);
        expect(submitted.getAll('tags')).toEqual(['a', 'b']);
    });

    it('required 空值写入 valueMissing，anchor 指向 combobox', async () => {
        const el = createSelect({ name: 'city', required: '' });
        await tick();

        const validation = lastValidation(el)!;
        expect(validation.flags.valueMissing).toBe(true);
        expect(validation.message.length).toBeGreaterThan(0);
        expect(validation.anchor).toBe(el.shadowRoot.querySelector('.select'));
        expect(el.shadowRoot.querySelector('.select')!.getAttribute('aria-required')).toBe('true');

        (el.shadowRoot.querySelector('.select') as HTMLElement).click();
        await tick();
        clickOption(el, 1);
        await tick();

        expect(hasValueMissing(el)).toBe(false);
        expect(lastValue(el)).toBe('b');
    });

    it('formResetCallback 回到 default-value，并派发 source=reset', async () => {
        const el = createSelect({ name: 'city', value: 'b', 'default-value': 'a' });
        await tick();

        const changes: CustomEvent[] = [];
        el.addEventListener('change', (event: Event) => changes.push(event as CustomEvent));

        el.formResetCallback();
        await tick();

        expect(el.getValue()).toBe('a');
        expect(lastValue(el)).toBe('a');
        expect(changes).toHaveLength(1);
        expect(changes[0].detail).toMatchObject({
            name: 'city',
            value: 'a',
            previousValue: 'b',
            source: 'reset',
        });
    });

    it('formDisabledCallback 清空提交值、锁定触发区，并在恢复后写回', async () => {
        const el = createSelect({ name: 'city', value: 'a' });
        await tick();

        const trigger = el.shadowRoot.querySelector('.select') as HTMLElement;
        el.formDisabledCallback(true);
        await tick();

        expect(lastValue(el)).toBeNull();
        expect(trigger.getAttribute('aria-disabled')).toBe('true');
        expect(trigger.getAttribute('tabindex')).toBe('-1');

        trigger.click();
        await tick();
        expect(el.$data.isOpen).toBe(false);

        el.formDisabledCallback(false);
        await tick();

        expect(lastValue(el)).toBe('a');
        expect(trigger.getAttribute('tabindex')).toBe('0');
    });

    it('公开 validity / validationMessage 与内部状态一致', async () => {
        const el = createSelect({ name: 'city', required: '' });
        await tick();

        expect(el.validity.valueMissing).toBe(true);
        expect(el.validationMessage.length).toBeGreaterThan(0);
        expect(el.checkValidity()).toBe(false);

        el.setValue('a', true);
        await tick();

        expect(el.validity.valid).toBe(true);
        expect(el.checkValidity()).toBe(true);
    });
});

describe('solely-button 原生提交/重置语义', () => {
    it('native-type="submit" 点击调用 form.requestSubmit()', async () => {
        const form = document.createElement('form');
        const el = document.createElement('solely-button') as any;
        el.setAttribute('native-type', 'submit');
        form.appendChild(el);
        document.body.appendChild(form);
        await tick();

        const requestSubmit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
        (el.shadowRoot.querySelector('button') as HTMLButtonElement).click();

        expect(requestSubmit).toHaveBeenCalledTimes(1);
    });

    it('native-type="reset" 点击调用 form.reset()，配合 formResetCallback 恢复 input', async () => {
        const form = document.createElement('form');
        const input = document.createElement('solely-input') as any;
        input.setAttribute('name', 'q');
        input.setAttribute('value', 'initial');
        const button = document.createElement('solely-button') as any;
        button.setAttribute('native-type', 'reset');
        form.appendChild(input);
        form.appendChild(button);
        document.body.appendChild(form);
        await tick();

        // jsdom 不会为自定义元素自动触发 formResetCallback，这里显式模拟平台行为
        const reset = vi.spyOn(form, 'reset').mockImplementation(() => {
            input.formResetCallback();
        });

        input.setValue('changed', true);
        (button.shadowRoot.querySelector('button') as HTMLButtonElement).click();
        await tick();

        expect(reset).toHaveBeenCalledTimes(1);
        expect(input.getValue()).toBe('initial');
    });

    it('默认 native-type 为 button，不触发 submit/reset', async () => {
        const form = document.createElement('form');
        const button = document.createElement('solely-button') as any;
        form.appendChild(button);
        document.body.appendChild(form);
        await tick();

        const requestSubmit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
        const reset = vi.spyOn(form, 'reset').mockImplementation(() => {});

        (button.shadowRoot.querySelector('button') as HTMLButtonElement).click();

        expect(requestSubmit).not.toHaveBeenCalled();
        expect(reset).not.toHaveBeenCalled();
    });

    it('内部 button 的 type 与 native-type 保持同步，非法值回退 button', async () => {
        const el = document.createElement('solely-button') as any;
        el.setAttribute('native-type', 'submit');
        document.body.appendChild(el);
        await tick();
        expect(el.shadowRoot.querySelector('button').getAttribute('type')).toBe('submit');

        el.setAttribute('native-type', 'nonsense');
        await tick();
        expect(el.shadowRoot.querySelector('button').getAttribute('type')).toBe('button');
    });
});
