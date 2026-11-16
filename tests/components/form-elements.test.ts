/**
 * 表单类元素组件修复回归测试
 * 覆盖 input 属性命名兼容、checkbox name/value、radio 分组、switch name/value
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/input';
import '../../src/components/elements/checkbox';
import '../../src/components/elements/radio';
import '../../src/components/elements/switch';
import SolelyRadio from '../../src/components/elements/radio';

const tick = (ms = 20) => new Promise<void>(r => setTimeout(r, ms));

describe('solely-input', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should accept new kebab-case attributes and keep legacy names working', async () => {
        const el = document.createElement('solely-input') as any;
        el.setAttribute('type', 'password');
        el.setAttribute('show-password', '');
        el.setAttribute('show-count', '');
        el.setAttribute('select-all', '');
        el.setAttribute('maxlength', '10');
        document.body.appendChild(el);
        await tick();

        expect(el.showPassword).toBe(true);
        expect(el.showCount).toBe(true);
        expect(el.selectAll).toBe(true);
        expect(el.shadowRoot.querySelector('[part="password-toggle"]')).not.toBeNull();
        expect(el.shadowRoot.querySelector('[part="count"]')).not.toBeNull();

        const legacy = document.createElement('solely-input') as any;
        legacy.setAttribute('type', 'password');
        legacy.setAttribute('showpassword', '');
        legacy.setAttribute('showcount', '');
        legacy.setAttribute('selectall', '');
        legacy.setAttribute('maxlength', '10');
        document.body.appendChild(legacy);
        await tick();

        // 旧属性名与新属性名读写同一份状态
        expect(legacy.showPassword).toBe(true);
        expect(legacy.showCount).toBe(true);
        expect(legacy.selectAll).toBe(true);
        expect(legacy.shadowRoot.querySelector('[part="password-toggle"]')).not.toBeNull();
    });

    it('should not expose internal state as public attributes/properties', async () => {
        const el = document.createElement('solely-input') as any;
        el.setAttribute('password-visible', '');
        el.setAttribute('focused', '');
        document.body.appendChild(el);
        await tick();

        // passwordVisible / focused 不再是声明的 prop，不再创建公共访问器
        expect(el.passwordVisible).toBeUndefined();
        expect(el.focused).toBeUndefined();
    });

    it('should dispatch change from setValue() unless silent', async () => {
        const el = document.createElement('solely-input') as any;
        document.body.appendChild(el);
        await tick();

        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        el.setValue('hello');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(el.getValue()).toBe('hello');

        el.setValue('world', true);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(el.getValue()).toBe('world');
    });

    it('should bind ariaLabel and fall back on unknown status', async () => {
        const el = document.createElement('solely-input') as any;
        el.setAttribute('aria-label', '搜索');
        el.setAttribute('status', 'warn');
        el.setAttribute('message', '提示');
        document.body.appendChild(el);
        await tick();

        const input = el.shadowRoot.querySelector('input') as HTMLInputElement;
        expect(input.getAttribute('aria-label')).toBe('搜索');
        expect(input.getAttribute('aria-invalid')).toBe('false');
        expect((el.shadowRoot.querySelector('.form-control') as HTMLElement).classList.contains('is-error')).toBe(
            false,
        );
        expect(el.shadowRoot.querySelector('.form-control__message')!.getAttribute('class')).toContain(
            'form-control__message--default',
        );

        // 合法状态才生效
        el.setAttribute('status', 'error');
        await tick();
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('should hide copy action and suggestion list when disabled', async () => {
        const el = document.createElement('solely-input') as any;
        el.setAttribute('value', 'alpha');
        el.setAttribute('copyable', '');
        el.setAttribute('suggestions', '["alpha","beta"]');
        document.body.appendChild(el);
        await tick();

        // 绕过 300ms 防抖，直接填充分过后的建议列表
        el._filteredSuggestions = ['alpha', 'beta'];
        el.refresh();
        await tick();

        expect(el.shadowRoot.querySelector('[part="copy"]')).not.toBeNull();
        expect(el.shadowRoot.querySelector('[part="dropdown"]')).not.toBeNull();

        el.setAttribute('disabled', '');
        await tick();
        expect(el.shadowRoot.querySelector('[part="copy"]')).toBeNull();
        expect(el.shadowRoot.querySelector('[part="dropdown"]')).toBeNull();
    });
});

describe('solely-checkbox', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should expose name/value in change detail', async () => {
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('name', 'agree');
        el.setAttribute('value', 'yes');
        document.body.appendChild(el);
        await tick();

        let detail: any;
        el.addEventListener('change', (e: CustomEvent) => {
            detail = e.detail;
        });

        el.shadowRoot.querySelector('.checkbox').click();
        await tick();

        expect(detail).toEqual({
            checked: true,
            value: 'yes',
            name: 'agree',
            previousChecked: false,
            source: 'user',
        });
    });

    it('should select instead of unselect when clicking an indeterminate checkbox', async () => {
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('indeterminate', '');
        el.setAttribute('checked', '');
        document.body.appendChild(el);
        await tick();

        expect(el.indeterminate).toBe(true);
        expect(el.shadowRoot.querySelector('.checkbox').getAttribute('aria-checked')).toBe('mixed');

        el.shadowRoot.querySelector('.checkbox').click();
        await tick();

        expect(el.checked).toBe(true);
        expect(el.indeterminate).toBe(false);
        // 清除半选后宿主属性同步移除
        expect(el.hasAttribute('indeterminate')).toBe(false);
        expect(el.shadowRoot.querySelector('.checkbox').getAttribute('aria-checked')).toBe('true');
    });

    it('should fall back to primary color and bind ariaLabel', async () => {
        const el = document.createElement('solely-checkbox') as any;
        el.setAttribute('type', 'bogus');
        el.setAttribute('aria-label', '同意协议');
        document.body.appendChild(el);
        await tick();

        const control = el.shadowRoot.querySelector('.checkbox') as HTMLElement;
        expect(control.className).toContain('checkbox--primary');
        expect(control.className).not.toContain('checkbox--bogus');
        expect(control.getAttribute('aria-label')).toBe('同意协议');
    });

    it('should expose aria-disabled and leave tab order when formDisabled is cascaded', async () => {
        const el = document.createElement('solely-checkbox') as any;
        document.body.appendChild(el);
        await tick();
        const control = el.shadowRoot.querySelector('.checkbox') as HTMLElement;
        expect(control.getAttribute('tabindex')).toBe('0');

        // jsdom 不会自动派发 formDisabledCallback，直接模拟 fieldset 级联
        el.formDisabledCallback(true);
        await tick();
        expect(control.getAttribute('aria-disabled')).toBe('true');
        expect(control.getAttribute('tabindex')).toBe('-1');

        el.formDisabledCallback(false);
        await tick();
        expect(control.getAttribute('aria-disabled')).toBe('false');
        expect(control.getAttribute('tabindex')).toBe('0');
    });
});

describe('solely-radio', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should uncheck same-name radios even when registered under an alias tag', async () => {
        if (!customElements.get('alias-radio')) {
            customElements.define('alias-radio', class extends SolelyRadio {});
        }

        const native = document.createElement('solely-radio') as any;
        native.setAttribute('name', 'group-alias');
        document.body.appendChild(native);

        const alias = document.createElement('alias-radio') as any;
        alias.setAttribute('name', 'group-alias');
        alias.setAttribute('checked', '');
        document.body.appendChild(alias);
        await tick();

        native.shadowRoot.querySelector('.radio').click();
        await tick();

        expect(native.checked).toBe(true);
        expect(alias.checked).toBe(false);
    });

    it('should keep only one checked radio when several are checked initially', async () => {
        const first = document.createElement('solely-radio') as any;
        first.setAttribute('name', 'group-init');
        first.setAttribute('checked', '');
        const second = document.createElement('solely-radio') as any;
        second.setAttribute('name', 'group-init');
        second.setAttribute('checked', '');

        document.body.appendChild(first);
        document.body.appendChild(second);
        await tick();

        // DOM 顺序靠后者生效
        expect(first.checked).toBe(false);
        expect(second.checked).toBe(true);
    });

    it('should skip disabled radios when traversing with arrow keys', async () => {
        const first = document.createElement('solely-radio') as any;
        first.setAttribute('name', 'group-disabled');
        const disabled = document.createElement('solely-radio') as any;
        disabled.setAttribute('name', 'group-disabled');
        disabled.setAttribute('disabled', '');
        const third = document.createElement('solely-radio') as any;
        third.setAttribute('name', 'group-disabled');

        document.body.appendChild(first);
        document.body.appendChild(disabled);
        document.body.appendChild(third);

        first.setAttribute('checked', '');
        await tick();

        const firstControl = first.shadowRoot.querySelector('.radio') as HTMLElement;
        firstControl.focus();
        firstControl.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true }),
        );
        await tick();

        // 禁用项既不聚焦也不被选中，直接跳到下一个可用项
        expect(third.checked).toBe(true);
        expect(disabled.checked).toBe(false);
        expect((disabled.shadowRoot.querySelector('.radio') as HTMLElement).getAttribute('tabindex')).toBe('-1');
    });

    it('should fall back to primary color for unknown type', async () => {
        const el = document.createElement('solely-radio') as any;
        el.setAttribute('type', 'bogus');
        document.body.appendChild(el);
        await tick();

        const classes = (el.shadowRoot.querySelector('.radio') as HTMLElement).className;
        expect(classes).toContain('radio--primary');
        expect(classes).not.toContain('radio--bogus');
    });
});

describe('solely-switch', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should expose name/value in change detail', async () => {
        const el = document.createElement('solely-switch') as any;
        el.setAttribute('name', 'notify');
        el.setAttribute('value', 'on');
        document.body.appendChild(el);
        await tick();

        let detail: any;
        el.addEventListener('change', (e: CustomEvent) => {
            detail = e.detail;
        });

        el.shadowRoot.querySelector('.switch').click();
        await tick();

        expect(detail).toEqual({
            checked: true,
            value: 'on',
            name: 'notify',
            previousChecked: false,
            source: 'user',
        });
        expect(el.name).toBe('notify');
        expect(el.value).toBe('on');
    });

    it('should fall back to primary color and express loading with aria-busy', async () => {
        const el = document.createElement('solely-switch') as any;
        el.setAttribute('type', 'bogus');
        el.setAttribute('loading', '');
        document.body.appendChild(el);
        await tick();

        const control = el.shadowRoot.querySelector('.switch') as HTMLElement;
        expect(control.className).toContain('switch--primary');
        expect(control.className).not.toContain('switch--bogus');
        expect(control.getAttribute('aria-busy')).toBe('true');
    });

    it('should expose aria-disabled and leave tab order when formDisabled is cascaded', async () => {
        const el = document.createElement('solely-switch') as any;
        document.body.appendChild(el);
        await tick();
        const control = el.shadowRoot.querySelector('.switch') as HTMLElement;
        expect(control.getAttribute('tabindex')).toBe('0');

        // jsdom 不会自动派发 formDisabledCallback，直接模拟 fieldset 级联
        el.formDisabledCallback(true);
        await tick();
        expect(control.getAttribute('aria-disabled')).toBe('true');
        expect(control.getAttribute('tabindex')).toBe('-1');

        el.formDisabledCallback(false);
        await tick();
        expect(control.getAttribute('aria-disabled')).toBe('false');
        expect(control.getAttribute('tabindex')).toBe('0');
    });
});
