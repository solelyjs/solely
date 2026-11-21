/**
 * 表单关联基座测试
 *
 * jsdom 限制（重要）：
 * jsdom 27 只实现了 `ElementInternals` 的 ARIA 属性部分，
 * `attachInternals()` 虽然存在，但返回的对象没有 `form` / `validity` /
 * `setFormValue` / `setValidity`，`new FormData(form)` 也不会收集自定义元素的值。
 *
 * 因此本文件用「最小替身」覆盖 `HTMLElement.prototype.attachInternals`，
 * 记录 `setFormValue` / `setValidity` 的调用参数，并模拟 `form` 与 `validity`。
 * 这只能验证基座自身的装配与调用语义，不能验证浏览器真实的表单提交行为。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    attachInternals,
    effectiveDisabled,
    emitChange,
    FORM_VALIDATION_MESSAGES,
    formValidity,
    getFormOwner,
    handleFormAssociatedCallback,
    handleFormDisabledCallback,
    handleFormResetCallback,
    initFormAssociation,
    resetFormControl,
    setCustomValidity,
    setFormDisabled,
    setFormDefault,
    syncAria,
    syncFormValue,
    syncValidity,
    type FormAdapter,
    type FormChangeDetail,
} from '../src/shared/form-associated';

interface FormValueCall {
    value: unknown;
    state?: unknown;
}

interface ValidityCall {
    flags?: ValidityStateFlags;
    message?: string;
    anchor?: HTMLElement;
}

interface FakeInternals {
    readonly form: HTMLFormElement | null;
    readonly validity: ValidityState;
    setFormValue?(value: unknown, state?: unknown): void;
    setValidity?(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
    calls: {
        formValue: FormValueCall[];
        validity: ValidityCall[];
    };
}

type InternalsMode = 'full' | 'throw' | 'no-form-value' | 'no-validity' | 'aria-only';

const realAttachInternals = HTMLElement.prototype.attachInternals;
const fakeStore = new WeakMap<HTMLElement, FakeInternals>();

let attachCount = 0;
let formOverride: HTMLFormElement | null | undefined;

function createFakeInternals(host: HTMLElement, mode: InternalsMode): FakeInternals {
    const calls: FakeInternals['calls'] = { formValue: [], validity: [] };
    const validityState = { valid: true, invalid: false };

    const fake: Record<string, unknown> = {
        calls,
        get form(): HTMLFormElement | null {
            if (formOverride !== undefined) return formOverride;
            return host.closest('form');
        },
        get validity(): ValidityState {
            return validityState as unknown as ValidityState;
        },
    };

    if (mode !== 'no-form-value' && mode !== 'aria-only') {
        fake.setFormValue = (value: unknown, state?: unknown) => {
            calls.formValue.push({ value, state });
        };
    }

    if (mode !== 'no-validity' && mode !== 'aria-only') {
        fake.setValidity = (flags: ValidityStateFlags = {}, message?: string, anchor?: HTMLElement) => {
            calls.validity.push({ flags, message, anchor });
            const invalid = Object.values(flags).some(flag => flag === true);
            validityState.invalid = invalid;
            validityState.valid = !invalid;
        };
    }

    return fake as unknown as FakeInternals;
}

function installFakeInternals(mode: InternalsMode = 'full'): void {
    attachCount = 0;
    HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
        attachCount += 1;
        if (mode === 'throw') {
            throw new Error('attachInternals failed');
        }
        const fake = createFakeInternals(this, mode);
        fakeStore.set(this, fake);
        return fake as unknown as ElementInternals;
    };
}

function getFake(el: HTMLElement): FakeInternals {
    const fake = fakeStore.get(el);
    if (!fake) throw new Error('element has no fake internals');
    return fake;
}

function makeElement(attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement('div');
    for (const [name, value] of Object.entries(attrs)) {
        el.setAttribute(name, value);
    }
    document.body.appendChild(el);
    return el;
}

function tick(): Promise<void> {
    return Promise.resolve();
}

function lastFormValue(internals: FakeInternals): FormValueCall | undefined {
    return internals.calls.formValue[internals.calls.formValue.length - 1];
}

function lastValidity(internals: FakeInternals): ValidityCall | undefined {
    return internals.calls.validity[internals.calls.validity.length - 1];
}

interface ScalarSetupOptions {
    /** `null` 表示不写 name attribute，默认写 `field` */
    name?: string | null;
    initial?: string;
    adapter?: Partial<FormAdapter<string>>;
}

function setupScalar(options: ScalarSetupOptions = {}) {
    const attrs: Record<string, string> = {};
    const name = options.name === undefined ? 'field' : options.name;
    if (name !== null) attrs.name = name;

    const el = makeElement(attrs);
    const holder = {
        value: options.initial ?? 'x',
        writes: [] as Array<{ value: string; silent: boolean }>,
    };

    const adapter: FormAdapter<string> = {
        family: 'scalar',
        read: () => holder.value,
        write: (value, silent) => {
            holder.writes.push({ value, silent });
            holder.value = value;
        },
        // 采用 input 语义：空字符串也提交（§3.1）
        encode: value => [value],
        disabled: () => false,
        ...options.adapter,
    };

    initFormAssociation(el, adapter);
    return { el, adapter, holder, internals: getFake(el) };
}

interface BooleanSetupOptions {
    name?: string | null;
    checked?: boolean;
    value?: string;
    adapter?: Partial<FormAdapter<boolean>>;
}

function setupBoolean(options: BooleanSetupOptions = {}) {
    const attrs: Record<string, string> = {};
    const name = options.name === undefined ? 'field' : options.name;
    if (name !== null) attrs.name = name;

    const el = makeElement(attrs);
    const holder = {
        checked: options.checked ?? false,
        value: options.value ?? '',
        writes: [] as boolean[],
    };

    const adapter: FormAdapter<boolean> = {
        family: 'boolean',
        read: () => holder.checked,
        write: checked => {
            holder.writes.push(checked);
            holder.checked = checked;
        },
        encode: () => (holder.checked ? [holder.value] : null),
        disabled: () => false,
        ...options.adapter,
    };

    initFormAssociation(el, adapter);
    return { el, adapter, holder, internals: getFake(el) };
}

function setupMultiple(initial: string[]) {
    const el = makeElement({ name: 'field' });
    const holder = { values: [...initial] };

    const adapter: FormAdapter<string[]> = {
        family: 'multiple',
        read: () => holder.values,
        encode: values => (values.length > 0 ? [...values] : null),
    };

    initFormAssociation(el, adapter);
    return { el, adapter, holder, internals: getFake(el) };
}

function captureChanges(el: HTMLElement): CustomEvent[] {
    const events: CustomEvent[] = [];
    el.addEventListener('change', event => {
        events.push(event as CustomEvent);
    });
    return events;
}

function captureInputs(el: HTMLElement): Event[] {
    const events: Event[] = [];
    el.addEventListener('input', event => events.push(event));
    return events;
}

beforeEach(() => {
    document.body.innerHTML = '';
    formOverride = undefined;
    installFakeInternals('full');
});

afterEach(() => {
    HTMLElement.prototype.attachInternals = realAttachInternals;
    vi.restoreAllMocks();
});

describe('attachInternals：唯一入口与缓存', () => {
    it('每个元素只调用一次 attachInternals，后续读取返回同一实例', () => {
        const el = makeElement();
        const first = attachInternals(el);
        const second = attachInternals(el);

        expect(first).toBe(second);
        expect(attachCount).toBe(1);
    });

    it('attachInternals 抛错时警告并降级为 null，仍然只尝试一次', () => {
        installFakeInternals('throw');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = makeElement();

        expect(attachInternals(el)).toBeNull();
        expect(attachInternals(el)).toBeNull();
        expect(attachCount).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attachInternals() 调用失败'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('降级为不参与表单'));
    });

    it('环境没有 attachInternals 时警告并返回 null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
        const saved = proto.attachInternals;
        delete proto.attachInternals;

        const el = makeElement();
        const result = attachInternals(el);

        proto.attachInternals = saved;
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('不支持 attachInternals'));
    });

    it('initFormAssociation 重复调用会告警并保留首次适配器', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = makeElement({ name: 'field' });
        const firstHolder = { value: 'first' };
        const firstAdapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => firstHolder.value,
            encode: value => [value],
        };
        const secondHolder = { value: 'second' };
        const secondAdapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => secondHolder.value,
            encode: value => [value],
        };

        initFormAssociation(el, firstAdapter);
        initFormAssociation(el, secondAdapter);
        await tick();

        expect(attachCount).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('重复调用'));
        const calls = getFake(el).calls.formValue;
        expect(calls[calls.length - 1].value).toBe('first');
    });
});

describe('getFormOwner', () => {
    it('优先使用 ElementInternals.form', () => {
        const outerForm = document.createElement('form');
        document.body.appendChild(outerForm);
        const el = document.createElement('div');
        outerForm.appendChild(el);

        const otherForm = document.createElement('form');
        document.body.appendChild(otherForm);
        formOverride = otherForm;

        attachInternals(el);
        expect(getFormOwner(el)).toBe(otherForm);
    });

    it('internals.form 为 null 时回退到最近的 form 祖先', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const wrapper = document.createElement('div');
        form.appendChild(wrapper);
        const el = document.createElement('div');
        wrapper.appendChild(el);

        formOverride = null;
        attachInternals(el);
        expect(getFormOwner(el)).toBe(form);
    });

    it('未初始化 internals 时也能通过 DOM 回退', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = document.createElement('div');
        form.appendChild(el);

        expect(getFormOwner(el)).toBe(form);
    });

    it('不在 form 内且 internals.form 为 null 时返回 null', () => {
        const el = makeElement();
        formOverride = null;
        attachInternals(el);

        expect(getFormOwner(el)).toBeNull();
    });
});

describe('syncFormValue', () => {
    it('单值写入使用 setFormValue(entry[0], null)', async () => {
        const { el, internals } = setupScalar({ initial: 'x' });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: 'x', state: null });
    });

    it('name 为空时不产生条目', async () => {
        const { el, internals } = setupScalar({ name: '', initial: 'x' });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });
    });

    it('encode 返回 null 时写入 null', async () => {
        const { el, internals } = setupScalar({
            initial: 'x',
            adapter: { encode: () => null },
        });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });
    });

    it('input 的空字符串仍然提交（name=""）', async () => {
        const { el, internals } = setupScalar({ initial: '' });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: '', state: null });
    });

    it('布尔族在 FormData 边界把空 value 归一化为 on', async () => {
        const { el, internals } = setupBoolean({ checked: true, value: '' });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: 'on', state: null });
    });

    it('布尔族未选中时写入 null', async () => {
        const { el, internals } = setupBoolean({ checked: false });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });
    });

    it('布尔族非空 value 不改写', async () => {
        const { el, internals } = setupBoolean({ checked: true, value: 'yes' });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: 'yes', state: null });
    });

    it('多值用 FormData 逐条 append，条目名取当前 name', async () => {
        const { el, internals } = setupMultiple(['a', 'b']);
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        const value = lastFormValue(internals)?.value as FormData;
        expect(value).toBeInstanceOf(FormData);
        expect(Array.from(value.entries())).toEqual([
            ['field', 'a'],
            ['field', 'b'],
        ]);
    });

    it('多值单元素仍使用 FormData；name 变化后重新同步使用新名字', async () => {
        const { el, internals } = setupMultiple(['a']);
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        let value = lastFormValue(internals)?.value as FormData;
        expect(Array.from(value.entries())).toEqual([['field', 'a']]);

        el.setAttribute('name', 'other');
        syncFormValue(el);
        value = lastFormValue(internals)?.value as FormData;
        expect(Array.from(value.entries())).toEqual([['other', 'a']]);
    });

    it('多值空数组写入 null', async () => {
        const { el, internals } = setupMultiple([]);
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });
    });

    it('作者 disabled 时提交 null', async () => {
        const { el, internals } = setupScalar({
            initial: 'x',
            adapter: { disabled: () => true },
        });
        await tick();
        internals.calls.formValue.length = 0;

        syncFormValue(el);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });
    });

    it('formDisabled 时提交 null，恢复后重新提交', async () => {
        const { el, internals } = setupScalar({ initial: 'x' });
        await tick();
        internals.calls.formValue.length = 0;

        setFormDisabled(el, true);
        expect(lastFormValue(internals)).toEqual({ value: null, state: null });

        internals.calls.formValue.length = 0;
        setFormDisabled(el, false);
        expect(lastFormValue(internals)).toEqual({ value: 'x', state: null });
    });

    it('环境缺少 setFormValue 时安全空操作', async () => {
        installFakeInternals('no-form-value');
        const el = makeElement({ name: 'field' });
        const adapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => 'x',
            encode: value => [value],
        };

        initFormAssociation(el, adapter);
        await tick();
        expect(() => syncFormValue(el)).not.toThrow();
        expect(getFake(el).calls.formValue).toHaveLength(0);
    });
});

describe('syncValidity', () => {
    it('写入组件标志、默认消息与锚点', async () => {
        const anchor = document.createElement('input');
        const { el, internals } = setupScalar({
            adapter: {
                validate: () => ({ flags: { valueMissing: true }, anchor }),
            },
        });
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)).toEqual({
            flags: { valueMissing: true },
            message: FORM_VALIDATION_MESSAGES.valueMissing,
            anchor,
        });
    });

    it('有效时清空标志（setValidity({})）', async () => {
        const { el, internals } = setupScalar();
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)).toEqual({ flags: {}, message: undefined, anchor: undefined });
    });

    it('自定义消息优先级最高，并合并 customError', async () => {
        const { el, internals } = setupScalar({
            adapter: { validate: () => ({ flags: { valueMissing: true } }) },
        });
        await tick();
        internals.calls.validity.length = 0;

        setCustomValidity(el, '自定义错误');
        expect(lastValidity(internals)).toEqual({
            flags: { valueMissing: true, customError: true },
            message: '自定义错误',
            anchor: undefined,
        });
    });

    it('清空自定义消息后恢复内置消息', async () => {
        const { el, internals } = setupScalar({
            adapter: { validate: () => ({ flags: { valueMissing: true } }) },
        });
        await tick();
        internals.calls.validity.length = 0;

        setCustomValidity(el, '自定义错误');
        setCustomValidity(el, '');
        expect(lastValidity(internals)).toEqual({
            flags: { valueMissing: true },
            message: FORM_VALIDATION_MESSAGES.valueMissing,
            anchor: undefined,
        });
    });

    it('invalidMessage 覆盖内置消息', async () => {
        const { el, internals } = setupScalar({
            adapter: {
                validate: () => ({ flags: { tooShort: true } }),
                invalidMessage: () => '请检查输入',
            },
        });
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)?.message).toBe('请检查输入');
    });

    it('missingMessage 可按组件族覆盖 valueMissing 文案', async () => {
        const { el, internals } = setupBoolean({
            adapter: {
                validate: () => ({ flags: { valueMissing: true } }),
                missingMessage: () => FORM_VALIDATION_MESSAGES.valueMissingCheckbox,
            },
        });
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)?.message).toBe('请勾选此项');
    });

    it('内置消息占位符由 messageContext 替换', async () => {
        const { el, internals } = setupScalar({
            adapter: {
                validate: () => ({ flags: { tooShort: true } }),
                messageContext: () => ({ minlength: 3 }),
            },
        });
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)?.message).toBe('至少输入 3 个字符');
    });

    it('锚点缺省时回退到 anchors 第一个元素', async () => {
        const anchor = document.createElement('span');
        const { el, internals } = setupScalar({
            adapter: {
                validate: () => ({ flags: { valueMissing: true } }),
                anchors: () => [anchor],
            },
        });
        await tick();
        internals.calls.validity.length = 0;

        syncValidity(el);
        expect(lastValidity(internals)?.anchor).toBe(anchor);
    });

    it('禁用时不调用 validate，直接清空标志', async () => {
        const validate = vi.fn(() => ({ flags: { valueMissing: true } }));
        const { el, internals } = setupScalar({
            adapter: { disabled: () => true, validate },
        });
        await tick();
        internals.calls.validity.length = 0;
        validate.mockClear();

        syncValidity(el);
        expect(validate).not.toHaveBeenCalled();
        expect(lastValidity(internals)).toEqual({ flags: {}, message: undefined, anchor: undefined });
    });

    it('自定义消息在禁用期间保留，重新启用后恢复', async () => {
        const { el, internals } = setupScalar({
            adapter: { validate: () => ({ flags: { valueMissing: true } }) },
        });
        await tick();
        internals.calls.validity.length = 0;

        setCustomValidity(el, '自定义错误');
        setFormDisabled(el, true);
        expect(lastValidity(internals)).toEqual({ flags: {}, message: undefined, anchor: undefined });

        setFormDisabled(el, false);
        expect(lastValidity(internals)?.message).toBe('自定义错误');
        expect(lastValidity(internals)?.flags).toMatchObject({ customError: true });
    });

    it('环境缺少 setValidity 时安全空操作', async () => {
        installFakeInternals('no-validity');
        const el = makeElement({ name: 'field' });
        const adapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => 'x',
            encode: value => [value],
            validate: () => ({ flags: { valueMissing: true } }),
        };

        initFormAssociation(el, adapter);
        await tick();
        expect(() => syncValidity(el)).not.toThrow();
        expect(getFake(el).calls.validity).toHaveLength(0);
    });
});

describe('syncAria', () => {
    it('默认作用在宿主上并写入三态字符串', async () => {
        const { el } = setupScalar();
        await tick();

        expect(el.getAttribute('aria-required')).toBe('false');
        expect(el.getAttribute('aria-disabled')).toBe('false');
        expect(el.getAttribute('aria-invalid')).toBe('false');
    });

    it('required 与视觉错误态参与 ARIA', async () => {
        const { el } = setupScalar({
            adapter: {
                required: () => true,
                hasVisualError: () => true,
            },
        });
        await tick();
        syncAria(el);

        expect(el.getAttribute('aria-required')).toBe('true');
        expect(el.getAttribute('aria-invalid')).toBe('true');
    });

    it('internals.validity 无效时 aria-invalid 为 true', async () => {
        const { el, internals } = setupScalar({
            adapter: { validate: () => ({ flags: { valueMissing: true } }) },
        });
        await tick();
        expect(internals.validity.valid).toBe(false);

        syncAria(el);
        expect(el.getAttribute('aria-invalid')).toBe('true');
    });

    it('ariaTarget 支持单元素与数组，且不写宿主', async () => {
        const target = document.createElement('div');
        const second = document.createElement('div');
        const { el } = setupScalar({
            adapter: {
                required: () => true,
                ariaTarget: () => [target, second],
            },
        });
        await tick();

        expect(target.getAttribute('aria-required')).toBe('true');
        expect(second.getAttribute('aria-required')).toBe('true');
        expect(el.hasAttribute('aria-required')).toBe(false);
    });

    it('formDisabled 只影响 aria-disabled，不写回组件 disabled 状态', async () => {
        const tabTarget = document.createElement('div');
        const { el } = setupScalar({
            adapter: {
                ariaTarget: () => tabTarget,
                tabTargets: () => [tabTarget],
            },
        });
        await tick();

        Object.defineProperty(el, 'disabled', { value: false, writable: true, configurable: true });
        setFormDisabled(el, true);

        expect(tabTarget.getAttribute('aria-disabled')).toBe('true');
        const componentDisabled = (el as HTMLElement & { disabled: boolean }).disabled;
        expect(componentDisabled).toBe(false);
        expect(el.hasAttribute('disabled')).toBe(false);
    });
});

describe('effectiveDisabled', () => {
    it('未初始化时为 false', () => {
        expect(effectiveDisabled(makeElement())).toBe(false);
    });

    it('作者 disabled 与 formDisabled 取 OR', async () => {
        let authorDisabled = false;
        const { el } = setupScalar({ adapter: { disabled: () => authorDisabled } });
        await tick();

        expect(effectiveDisabled(el)).toBe(false);
        authorDisabled = true;
        expect(effectiveDisabled(el)).toBe(true);

        authorDisabled = false;
        setFormDisabled(el, true);
        expect(effectiveDisabled(el)).toBe(true);

        setFormDisabled(el, false);
        expect(effectiveDisabled(el)).toBe(false);
    });

    it('formDisabled 结束且作者仍 disabled 时保持禁用', async () => {
        const { el } = setupScalar({ adapter: { disabled: () => true } });
        await tick();

        setFormDisabled(el, true);
        setFormDisabled(el, false);

        expect(effectiveDisabled(el)).toBe(true);
    });
});

describe('emitChange', () => {
    function scalarDetail(
        value: string,
        previousValue: string,
        source: 'user' | 'api' | 'reset' = 'user',
    ): FormChangeDetail {
        return { name: 'field', value, previousValue, source };
    }

    it('标量值变化时由宿主派发 CustomEvent', () => {
        const el = makeElement();
        const events = captureChanges(el);
        const detail = scalarDetail('b', 'a');

        expect(emitChange(el, detail)).toBe(true);
        expect(events).toHaveLength(1);

        const event = events[0];
        expect(event.type).toBe('change');
        expect(event.target).toBe(el);
        expect(event.bubbles).toBe(true);
        expect(event.composed).toBe(true);
        expect(event.cancelable).toBe(false);
        expect(event.detail).toBe(detail);
        expect(event.detail.source).toBe('user');
    });

    it('标量值未变化时不派发', () => {
        const el = makeElement();
        const events = captureChanges(el);

        expect(emitChange(el, scalarDetail('a', 'a'))).toBe(false);
        expect(events).toHaveLength(0);
    });

    it('标量使用 Object.is：-0 与 0 视为变化', () => {
        const el = makeElement();
        const events = captureChanges(el);

        expect(
            emitChange(el, {
                name: 'field',
                value: -0,
                previousValue: 0,
                source: 'user',
            }),
        ).toBe(true);
        expect(events).toHaveLength(1);
    });

    it('布尔族按 checked 比较，value 变化不单独触发', () => {
        const el = makeElement();
        const events = captureChanges(el);

        expect(
            emitChange(el, {
                name: 'field',
                value: 'changed-value',
                checked: true,
                previousChecked: true,
                source: 'user',
            }),
        ).toBe(false);
        expect(events).toHaveLength(0);

        expect(
            emitChange(el, {
                name: 'field',
                value: '',
                checked: true,
                previousChecked: false,
                source: 'user',
            }),
        ).toBe(true);
        expect(events).toHaveLength(1);
        expect((events[0].detail as { value: string }).value).toBe('');
    });

    it('多值按顺序比较：重排算变化，内容相同不算', () => {
        const el = makeElement();
        const events = captureChanges(el);

        expect(
            emitChange(el, {
                name: 'field',
                value: ['a', 'b'],
                previousValue: ['a', 'b'],
                source: 'api',
            }),
        ).toBe(false);
        expect(events).toHaveLength(0);

        expect(
            emitChange(el, {
                name: 'field',
                value: ['b', 'a'],
                previousValue: ['a', 'b'],
                source: 'api',
            }),
        ).toBe(true);
        expect(events).toHaveLength(1);

        expect(
            emitChange(el, {
                name: 'field',
                value: ['a'],
                previousValue: ['a', 'b'],
                source: 'api',
            }),
        ).toBe(true);
        expect(events).toHaveLength(2);
    });
});

describe('formResetCallback：默认值捕获与重置时序', () => {
    it('首轮 microtask 捕获默认值，之后用户变化不影响重置目标', async () => {
        const { el, holder, internals } = setupScalar({ initial: 'first' });
        await tick();
        internals.calls.formValue.length = 0;

        holder.value = 'user';
        const events = captureChanges(el);
        const inputs = captureInputs(el);

        resetFormControl(el);

        expect(holder.writes).toEqual([{ value: 'first', silent: true }]);
        expect(holder.value).toBe('first');
        expect(events).toHaveLength(1);
        expect(events[0].detail).toMatchObject({
            name: 'field',
            value: 'first',
            previousValue: 'user',
            source: 'reset',
        });
        expect(inputs).toHaveLength(0);
        expect(lastFormValue(internals)).toEqual({ value: 'first', state: null });
    });

    it('显式 readDefault 优先于自动捕获', async () => {
        const { el, holder, internals } = setupScalar({
            initial: 'initial',
            adapter: { readDefault: () => 'explicit' },
        });
        await tick();
        internals.calls.formValue.length = 0;

        holder.value = 'user';
        resetFormControl(el);

        expect(holder.value).toBe('explicit');
        expect(holder.writes).toEqual([{ value: 'explicit', silent: true }]);
    });

    it('setFormDefault 立即替换重置目标', async () => {
        const { el, holder } = setupScalar({ initial: 'first' });
        await tick();

        setFormDefault(el, 'later');
        holder.value = 'user';
        resetFormControl(el);

        expect(holder.value).toBe('later');
    });

    it('组件上报范围类标志时仍生成非空默认消息', () => {
        const { el, internals } = setupScalar({
            initial: 'x',
            adapter: {
                validate: () => ({ flags: { rangeOverflow: true } }),
            },
        });

        syncValidity(el);
        const call = lastValidity(internals)!;
        expect(call.flags?.rangeOverflow).toBe(true);
        expect(call.message).toBe(FORM_VALIDATION_MESSAGES.rangeOverflow);
    });

    it('无 internals 时返回的 validity 快照是冻结的共享常量', () => {
        const el = document.createElement('div');
        const validity = formValidity(el);

        expect(Object.isFrozen(validity)).toBe(true);
        expect(() => {
            (validity as { valueMissing: boolean }).valueMissing = true;
        }).toThrow(TypeError);
        // 其他实例读到的仍是干净快照
        expect(formValidity(document.createElement('div')).valueMissing).toBe(false);
    });

    it('值未变化时重置不派发 change', async () => {
        const { el } = setupScalar({ initial: 'first' });
        await tick();
        const events = captureChanges(el);

        resetFormControl(el);

        expect(events).toHaveLength(0);
    });

    it('断开再连接不重新捕获默认值', async () => {
        const { el, holder } = setupScalar({ initial: 'first' });
        await tick();

        holder.value = 'user';
        el.remove();
        document.body.appendChild(el);
        await tick();

        resetFormControl(el);
        expect(holder.value).toBe('first');
    });

    it('禁用状态下仍然写回，并在值变化时派发 source=reset', async () => {
        const { el, holder } = setupScalar({
            initial: 'first',
            adapter: { disabled: () => true },
        });
        await tick();

        holder.value = 'user';
        const events = captureChanges(el);

        resetFormControl(el);

        expect(holder.writes).toEqual([{ value: 'first', silent: true }]);
        expect(events).toHaveLength(1);
        expect(events[0].detail.source).toBe('reset');
    });

    it('重置清空自定义错误消息', async () => {
        const { el, internals } = setupScalar();
        await tick();
        setCustomValidity(el, '自定义错误');
        internals.calls.validity.length = 0;

        resetFormControl(el);

        expect(lastValidity(internals)).toEqual({ flags: {}, message: undefined, anchor: undefined });
    });

    it('适配器缺少 write 时告警且不抛错', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = makeElement({ name: 'field' });
        const adapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => 'x',
            encode: value => [value],
        };
        initFormAssociation(el, adapter);

        expect(() => resetFormControl(el)).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('需要适配器提供 write()'));
    });
});

describe('initFormAssociation：首次同步与生命周期委托', () => {
    it('首次同步延迟到 microtask，覆盖值 / 有效性 / ARIA', async () => {
        const el = makeElement({ name: 'field' });
        const adapter: FormAdapter<string> = {
            family: 'scalar',
            read: () => 'x',
            encode: value => [value],
        };

        initFormAssociation(el, adapter);
        const internals = getFake(el);
        expect(internals.calls.formValue).toHaveLength(0);

        await tick();

        expect(internals.calls.formValue.length).toBeGreaterThan(0);
        expect(internals.calls.validity.length).toBeGreaterThan(0);
        expect(el.getAttribute('aria-required')).toBe('false');
        expect(el.getAttribute('aria-disabled')).toBe('false');
    });

    it('自动捕获发生在首次 microtask，而不是 init 调用瞬间', async () => {
        const { el, holder } = setupScalar({ initial: 'before-sync' });
        holder.value = 'after-sync';
        await tick();

        holder.value = 'user';
        resetFormControl(el);

        expect(holder.value).toBe('after-sync');
    });

    it('handleFormAssociatedCallback 重新同步值与有效性', async () => {
        const { el, internals } = setupScalar();
        await tick();
        internals.calls.formValue.length = 0;
        internals.calls.validity.length = 0;

        handleFormAssociatedCallback(el);

        expect(internals.calls.formValue.length).toBeGreaterThan(0);
        expect(internals.calls.validity.length).toBeGreaterThan(0);
    });

    it('handleFormResetCallback 委托到 resetFormControl', async () => {
        const { el, holder } = setupScalar({ initial: 'first' });
        await tick();
        holder.value = 'user';

        handleFormResetCallback(el);

        expect(holder.writes).toEqual([{ value: 'first', silent: true }]);
    });

    it('handleFormDisabledCallback 委托到 setFormDisabled', async () => {
        const tabTarget = document.createElement('div');
        const { el } = setupScalar({ adapter: { tabTargets: () => [tabTarget] } });
        await tick();

        handleFormDisabledCallback(el, true);
        expect(effectiveDisabled(el)).toBe(true);
        expect(tabTarget.getAttribute('tabindex')).toBe('-1');

        handleFormDisabledCallback(el, false);
        expect(effectiveDisabled(el)).toBe(false);
        expect(tabTarget.hasAttribute('tabindex')).toBe(false);
    });
});

describe('setFormDisabled：Tab 序快照与恢复', () => {
    it('禁用时 tabindex=-1，恢复时还原作者值', async () => {
        const tabTarget = document.createElement('div');
        tabTarget.setAttribute('tabindex', '3');
        const { el } = setupScalar({ adapter: { tabTargets: () => [tabTarget] } });
        await tick();

        setFormDisabled(el, true);
        expect(tabTarget.getAttribute('tabindex')).toBe('-1');

        setFormDisabled(el, false);
        expect(tabTarget.getAttribute('tabindex')).toBe('3');
    });

    it('禁用时不派发 change，也不清空值', async () => {
        const { el, holder } = setupScalar({ initial: 'x' });
        await tick();
        const events = captureChanges(el);

        setFormDisabled(el, true);
        expect(holder.value).toBe('x');
        expect(events).toHaveLength(0);
    });

    it('重复禁用不会覆盖第一次的 tabindex 快照', async () => {
        const tabTarget = document.createElement('div');
        tabTarget.setAttribute('tabindex', '3');
        const { el } = setupScalar({ adapter: { tabTargets: () => [tabTarget] } });
        await tick();

        setFormDisabled(el, true);
        setFormDisabled(el, true);
        setFormDisabled(el, false);

        expect(tabTarget.getAttribute('tabindex')).toBe('3');
    });
});

describe('setCustomValidity 使用约束', () => {
    it('未初始化时告警', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setCustomValidity(makeElement(), 'error');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('必须在 initFormAssociation() 之后调用'));
    });
});
