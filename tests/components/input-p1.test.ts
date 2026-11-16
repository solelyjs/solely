import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/input';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

function createInput(attrs: Record<string, string> = {}) {
    const el = document.createElement('solely-input') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el as any;
}

const control = (el: any): HTMLInputElement | HTMLTextAreaElement => el.shadowRoot.querySelector('input, textarea');

describe('solely-input P1 补齐', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render addonBefore / addonAfter around the control', async () => {
        const el = createInput({ 'addon-before': 'https://', 'addon-after': '.com' });
        await tick();

        const group = el.shadowRoot.querySelector('.form-control-group');
        expect(group.classList.contains('form-control-group--addon-before')).toBe(true);
        expect(group.classList.contains('form-control-group--addon-after')).toBe(true);
        expect(el.shadowRoot.querySelector('.form-control__addon--before')?.textContent).toBe('https://');
        expect(el.shadowRoot.querySelector('.form-control__addon--after')?.textContent).toBe('.com');
        // 输入框仍位于分组内
        expect(group.querySelector('input')).toBeTruthy();
    });

    it('should forward native attributes to the real control', async () => {
        const el = createInput({
            autocomplete: 'off',
            inputmode: 'numeric',
            enterkeyhint: 'done',
            spellcheck: 'false',
            type: 'number',
            min: '0',
            max: '100',
            step: '5',
        });
        await tick();

        const input = control(el) as HTMLInputElement;
        expect(input.getAttribute('autocomplete')).toBe('off');
        expect(input.getAttribute('inputmode')).toBe('numeric');
        expect(input.getAttribute('enterkeyhint')).toBe('done');
        expect(input.getAttribute('spellcheck')).toBe('false');
        expect(input.getAttribute('min')).toBe('0');
        expect(input.getAttribute('max')).toBe('100');
        expect(input.getAttribute('step')).toBe('5');

        // 属性更新后应同步到原生控件
        el.setAttribute('min', '10');
        el.setAttribute('inputmode', 'text');
        await tick();
        expect(input.getAttribute('min')).toBe('10');
        expect(input.getAttribute('inputmode')).toBe('text');
    });

    it('should not set spellcheck attribute when not provided', async () => {
        const el = createInput();
        await tick();
        expect(control(el).hasAttribute('spellcheck')).toBe(false);
    });

    it('should autosize textarea from scrollHeight', async () => {
        const el = createInput({ type: 'textarea', autosize: '' });
        await tick();

        const textarea = control(el) as HTMLTextAreaElement;
        Object.defineProperty(textarea, 'scrollHeight', { value: 96, configurable: true });

        el.setAttribute('value', 'inexistent');
        await tick();

        expect(el.shadowRoot.querySelector('.form-control').classList.contains('form-control--autosize')).toBe(true);
        expect(textarea.style.height).toBe('96px');
    });

    it('should dispatch press-enter on Enter and search for search type', async () => {
        const el = createInput();
        await tick();
        const onPressEnter = vi.fn();
        const onSearch = vi.fn();
        el.addEventListener('press-enter', onPressEnter);
        el.addEventListener('search', onSearch);

        control(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        await tick();
        expect(onPressEnter).toHaveBeenCalledTimes(1);
        expect(onPressEnter.mock.calls[0][0].detail).toEqual({ value: '' });
        expect(onSearch).not.toHaveBeenCalled();

        document.body.innerHTML = '';
        const searchEl = createInput({ type: 'search' });
        await tick();
        const onSearch2 = vi.fn();
        searchEl.addEventListener('search', onSearch2);
        control(searchEl).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        await tick();
        expect(onSearch2).toHaveBeenCalledTimes(1);
    });

    it('should show count without maxlength and show max when present', async () => {
        const el = createInput({ 'show-count': '', value: 'ab' });
        await tick();
        const count = el.shadowRoot.querySelector('.form-control__count');
        expect(count.textContent.replace(/\s/g, '')).toBe('2');
        expect(el.shadowRoot.querySelector('.form-control__count-max')).toBeNull();

        document.body.innerHTML = '';
        const el2 = createInput({ 'show-count': '', maxlength: '10', value: 'ab' });
        await tick();
        expect(el2.shadowRoot.querySelector('.form-control__count').textContent.replace(/\s/g, '')).toBe('2/10');
    });

    it('should describe the control with the message element', async () => {
        const el = createInput({ message: '格式不正确', status: 'error' });
        await tick();

        const message = el.shadowRoot.querySelector('.form-control__message');
        const input = control(el);
        expect(message.id).toBeTruthy();
        expect(input.getAttribute('aria-describedby')).toBe(message.id);
        expect(input.getAttribute('aria-invalid')).toBe('true');

        document.body.innerHTML = '';
        const el2 = createInput();
        await tick();
        expect(control(el2).hasAttribute('aria-describedby')).toBe(false);
    });

    it('should keep form association and silent property assignment intact', async () => {
        const el = createInput();
        await tick();
        expect((el.constructor as any).formAssociated).toBe(true);

        const onChange = vi.fn();
        el.addEventListener('change', onChange);
        el.value = 'hello';
        await tick();
        expect(el.getValue()).toBe('hello');
        expect(onChange).not.toHaveBeenCalled();

        el.setValue('world', false);
        await tick();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].detail).toMatchObject({
            name: '',
            value: 'world',
            previousValue: 'hello',
            source: 'api',
        });
    });
});
