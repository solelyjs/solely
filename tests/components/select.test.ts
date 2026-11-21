import { describe, it, expect, beforeEach, vi } from 'vitest';

// 引入组件即自动注册自定义元素 <solely-select>
import '../../src/components/elements/select';

const tick = (ms = 20) => new Promise<void>(r => setTimeout(r, ms));

const OPTIONS = [
    { label: '选项A', value: 'a' },
    { label: '选项B', value: 'b' },
    { label: '选项C', value: 'c' },
];

function createSelect(attrs: Record<string, string> = {}, setup?: (el: HTMLElement) => void) {
    const el = document.createElement('solely-select') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    if (!attrs.options) {
        el.setAttribute('options', JSON.stringify(OPTIONS));
    }
    setup?.(el);
    document.body.appendChild(el);
    return el as any;
}

function getRoot(el: any): HTMLElement {
    return el.shadowRoot.querySelector('.select');
}

async function open(el: any) {
    getRoot(el).click();
    await tick();
}

/**
 * jsdom 的 querySelectorAll 对动态添加的 `--selected` 类存在缓存问题，
 * 这里用 classList 统计，避免测试环境噪声。
 */
function getSelectedOptionCount(el: any): number {
    return Array.from(el.shadowRoot.querySelectorAll('.select__option')).filter((option: any) =>
        option.classList.contains('select__option--selected'),
    ).length;
}

describe('solely-select', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render options and update single value on click', async () => {
        const el = createSelect();
        await tick();

        await open(el);
        expect(el.$data.isOpen).toBe(true);
        expect(el.shadowRoot.querySelectorAll('.select__option').length).toBe(3);

        el.shadowRoot.querySelectorAll('.select__option')[1].click();
        await tick();
        expect(el.getValue()).toBe('b');
        expect(el.$data.selectedLabel).toBe('选项B');

        await tick(240);
        expect(el.$data.isOpen).toBe(false);
    });

    it('should support multiple mode with array value, toggle and aria-selected', async () => {
        const el = createSelect({ multiple: '' });
        await tick();
        expect(el.multiple).toBe(true);
        expect(Array.isArray(el.getValue())).toBe(true);

        const changes: unknown[] = [];
        el.addEventListener('change', (e: any) => changes.push(e.target.value));

        await open(el);
        let options = el.shadowRoot.querySelectorAll('.select__option');
        options[0].click();
        await tick();

        expect(el.getValue()).toEqual(['a']);
        expect(Array.isArray(el.$data.value)).toBe(true);
        expect(el.$data.isOpen).toBe(true); // 多选点击后保持展开
        expect(getSelectedOptionCount(el)).toBe(1);
        expect(el.shadowRoot.querySelectorAll('[aria-selected="true"]').length).toBe(1);

        options = el.shadowRoot.querySelectorAll('.select__option');
        options[1].click();
        await tick();

        expect(el.getValue()).toEqual(['a', 'b']);
        expect(el.$data.selectedLabel).toBe('选项A、选项B');
        expect(getSelectedOptionCount(el)).toBe(2);
        expect(el.shadowRoot.querySelectorAll('[aria-selected="true"]').length).toBe(2);
        expect(changes).toEqual([['a'], ['a', 'b']]);

        // 再次点击 A 取消选中
        options = el.shadowRoot.querySelectorAll('.select__option');
        options[0].click();
        await tick();
        expect(el.getValue()).toEqual(['b']);
        expect(getSelectedOptionCount(el)).toBe(1);
    });

    it('should implement promised public methods', async () => {
        const el = createSelect();
        await tick();

        expect(typeof el.open).toBe('function');
        expect(typeof el.close).toBe('function');
        expect(typeof el.clear).toBe('function');
        expect(typeof el.getOptions).toBe('function');

        el.open();
        await tick();
        expect(el.$data.isOpen).toBe(true);
        expect(el.getOptions()).toHaveLength(3);

        el.close();
        expect(el.$data.isOpen).toBe(false);

        const onClear = vi.fn();
        const onChange = vi.fn();
        el.addEventListener('clear', onClear);
        el.addEventListener('change', onChange);

        el.setValue('b');
        await tick();
        expect(el.getValue()).toBe('b');

        el.clear();
        await tick();
        expect(el.getValue()).toBe('');
        expect(onClear).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalled();
    });

    it('外部按钮在 click 中调用 open() 时不会被“点击外部关闭”立即收起', async () => {
        const el = createSelect();
        await tick();

        const trigger = document.createElement('button');
        trigger.textContent = '外部打开';
        trigger.addEventListener('click', () => el.open());
        document.body.appendChild(trigger);

        trigger.click();
        // 同一次点击冒泡到 document 时不应触发关闭
        expect(el.$data.isOpen).toBe(true);
        expect(el.$data.closing).toBe(false);

        // 事件结束后的真正外部点击仍应关闭
        await tick();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.click();
        await tick(240);
        expect(el.$data.isOpen).toBe(false);

        trigger.remove();
        outside.remove();
    });

    it('should support keyboard open, move highlight, select and close', async () => {
        const el = createSelect();
        await tick();
        const root = getRoot(el);
        const press = (key: string) => {
            root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        };

        expect(root.getAttribute('tabindex')).toBe('0');

        press('ArrowDown');
        await tick();
        expect(el.$data.isOpen).toBe(true);
        expect(el.$data.activeIndex).toBe(0);

        const firstId = el.shadowRoot.querySelectorAll('.select__option')[0].id;
        expect(root.getAttribute('aria-activedescendant')).toBe(firstId);

        press('ArrowDown');
        await tick();
        expect(el.$data.activeIndex).toBe(1);
        const highlighted = el.shadowRoot.querySelector('.select__option--highlighted');
        expect(highlighted?.textContent).toContain('选项B');
        expect(root.getAttribute('aria-activedescendant')).toBe(highlighted?.id);

        press('Enter');
        await tick();
        expect(el.getValue()).toBe('b');
        await tick(240);
        expect(el.$data.isOpen).toBe(false);

        // 空格开合
        press(' ');
        await tick();
        expect(el.$data.isOpen).toBe(true);
        press(' ');
        expect(el.$data.isOpen).toBe(false);

        // Escape 关闭
        el.open();
        await tick();
        press('Escape');
        expect(el.$data.isOpen).toBe(false);
    });

    it('should jump to option by first character', async () => {
        const el = createSelect({
            options: JSON.stringify([
                { label: 'Apple', value: 'a' },
                { label: 'Banana', value: 'b' },
            ]),
        });
        await tick();
        const root = getRoot(el);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();
        expect(el.$data.activeIndex).toBe(0);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
        await tick();
        expect(el.$data.activeIndex).toBe(1);
    });

    it('should expose listbox/option ids and aria attributes', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        const root = getRoot(el);

        expect(root.getAttribute('role')).toBe('combobox');
        const listboxId = el.getListboxId();

        await open(el);
        expect(root.getAttribute('aria-expanded')).toBe('true');
        expect(root.getAttribute('aria-controls')).toBe(listboxId);
        expect(el.shadowRoot.querySelector('.select__dropdown')?.id).toBe(listboxId);

        const options = el.shadowRoot.querySelectorAll('.select__option');
        expect(options.length).toBe(3);
        options.forEach((option: HTMLElement, index: number) => {
            expect(option.id).toBe(`${listboxId}-option-${index}`);
            expect(option.getAttribute('role')).toBe('option');
        });
        expect(options[0].getAttribute('aria-selected')).toBe('true');
        expect(options[1].getAttribute('aria-selected')).toBe('false');
        // 点击打开时不应默认把键盘高亮落到已选项上
        expect(root.hasAttribute('aria-activedescendant')).toBe(false);
        expect(el.shadowRoot.querySelector('.select__option--highlighted')).toBeNull();
    });

    it('should work with slot options and set data-selected', async () => {
        const el = createSelect({}, target => {
            for (const [value, label] of [
                ['a', '插槽A'],
                ['b', '插槽B'],
            ]) {
                const option = document.createElement('div');
                option.setAttribute('data-value', value);
                option.setAttribute('data-label', label);
                option.textContent = label;
                target.appendChild(option);
            }
        });
        await tick();
        expect(el.$data.useSlot).toBe(true);

        await open(el);
        el.querySelector('[data-value="a"]').click();
        await tick(240);

        expect(el.getValue()).toBe('a');
        expect(el.$data.selectedLabel).toBe('插槽A');
        expect(el.querySelector('[data-value="a"]').hasAttribute('data-selected')).toBe(true);
        expect(el.querySelector('[data-value="b"]').hasAttribute('data-selected')).toBe(false);
        expect(el.querySelector('[data-value="a"]').getAttribute('aria-selected')).toBe('true');
        expect(el.getOptions()).toEqual([
            { label: '插槽A', value: 'a', disabled: false, isGroup: undefined },
            { label: '插槽B', value: 'b', disabled: false, isGroup: undefined },
        ]);
    });

    it('should support keyboard navigation with slot options', async () => {
        const el = createSelect({}, target => {
            for (const [value, label] of [
                ['a', '插槽A'],
                ['b', '插槽B'],
            ]) {
                const option = document.createElement('div');
                option.setAttribute('data-value', value);
                option.setAttribute('data-label', label);
                option.textContent = label;
                target.appendChild(option);
            }
        });
        await tick();
        const root = getRoot(el);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();
        expect(el.$data.isOpen).toBe(true);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();
        expect(el.$data.activeIndex).toBe(1);
        expect(el.querySelector('[data-value="b"]').hasAttribute('data-highlighted')).toBe(true);
        expect(root.getAttribute('aria-activedescendant')).toBe(el.querySelector('[data-value="b"]').id);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await tick();
        expect(el.getValue()).toBe('b');
        expect(el.querySelector('[data-value="b"]').hasAttribute('data-selected')).toBe(true);
    });

    it('should toggle multiple slot options without closing', async () => {
        const el = createSelect({ multiple: '' }, target => {
            for (const value of ['a', 'b']) {
                const option = document.createElement('div');
                option.setAttribute('data-value', value);
                option.setAttribute('data-label', value.toUpperCase());
                option.textContent = value;
                target.appendChild(option);
            }
        });
        await tick();

        await open(el);
        el.querySelector('[data-value="a"]').click();
        await tick();
        el.querySelector('[data-value="b"]').click();
        await tick();

        expect(el.getValue()).toEqual(['a', 'b']);
        expect(el.$data.isOpen).toBe(true);
        expect(el.querySelector('[data-value="a"]').hasAttribute('data-selected')).toBe(true);
        expect(el.querySelector('[data-value="b"]').hasAttribute('data-selected')).toBe(true);

        el.querySelector('[data-value="a"]').click();
        await tick();
        expect(el.getValue()).toEqual(['b']);
    });

    it('should keep label when slot and options are mixed', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        expect(el.$data.selectedLabel).toBe('选项A');

        const slotOption = document.createElement('div');
        slotOption.setAttribute('data-value', 'b');
        slotOption.setAttribute('data-label', '插槽B');
        slotOption.textContent = '插槽B';
        el.appendChild(slotOption);
        await tick(80);

        expect(el.$data.useSlot).toBe(true);
        expect(el.getValue()).toBe('a');
        // 不应因为新数据源中没有 a 而静默清空标签
        expect(el.$data.selectedLabel).toBe('选项A');
    });

    it('should keep setOptions result after remount', async () => {
        const el = createSelect({}, target => {
            const option = document.createElement('div');
            option.setAttribute('data-value', 'a');
            option.setAttribute('data-label', '插槽A');
            option.textContent = '插槽A';
            target.appendChild(option);
        });
        await tick();

        el.setOptions([{ label: 'C', value: 'c' }]);
        await tick();
        expect(el.$data.useSlot).toBe(false);
        expect(el.getOptions()).toHaveLength(1);

        el.remove();
        document.body.appendChild(el);
        await tick(80);

        expect(el.$data.useSlot).toBe(false);
        expect(el.getOptions()).toEqual([{ label: 'C', value: 'c', disabled: undefined, isGroup: undefined }]);
    });

    it('should keep value consistent while disabled', async () => {
        const el = createSelect({ disabled: '', value: 'a' });
        await tick();

        const root = getRoot(el);
        expect(root.getAttribute('tabindex')).toBe('-1');
        expect(el.getValue()).toBe('a');

        // 程序化写入与普通状态保持同一套策略：允许同步，不因 disabled 被静默丢弃
        el.value = 'b';
        await tick();
        expect(el.getValue()).toBe('b');

        el.setAttribute('value', 'c');
        await tick();
        expect(el.getValue()).toBe('c');

        el.setValue('d');
        await tick();
        expect(el.getValue()).toBe('d');

        // 用户交互仍然被禁用
        root.click();
        await tick();
        expect(el.$data.isOpen).toBe(false);
    });
});

describe('solely-select 修复回归', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should treat group headers as non-selectable in options mode', async () => {
        const el = createSelect({
            options: JSON.stringify([
                { label: '分组一', value: 'g1', isGroup: true },
                { label: 'A', value: 'a' },
                { label: 'B', value: 'b', disabled: true },
                { label: '分组二', value: 'g2', isGroup: true },
                { label: 'C', value: 'c' },
            ]),
        });
        await tick();

        // getOptions() 不返回分组标题
        expect(el.getOptions().map((o: any) => o.value)).toEqual(['a', 'b', 'c']);
        expect(el.getOptions().every((o: any) => !o.isGroup)).toBe(true);

        const root = getRoot(el);
        const press = (key: string) => root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        const changes: unknown[] = [];
        el.addEventListener('change', (e: any) => changes.push(e.target.value));

        // 键盘：跳过开头的分组标题
        press('ArrowDown');
        await tick();
        expect(el.$data.activeIndex).toBe(1);
        // 键盘：跳过禁用项和中间的分组标题
        press('ArrowDown');
        await tick();
        expect(el.$data.activeIndex).toBe(4);

        // 白盒：高亮强制定位到分组标题也不能选中
        el.$data.activeIndex = 0;
        press('Enter');
        await tick();
        expect(el.getValue()).toBe('');
        expect(changes).toEqual([]);

        // 点击分组标题无效，且分组标题不具备 option 语义
        const optionEls = el.shadowRoot.querySelectorAll('.select__option');
        expect(optionEls[0].getAttribute('role')).toBe('presentation');
        expect(optionEls[0].hasAttribute('aria-selected')).toBe(false);
        optionEls[0].click();
        await tick();
        expect(el.getValue()).toBe('');
        expect(changes).toEqual([]);

        // 普通选项仍可点击选中
        optionEls[1].click();
        await tick();
        expect(el.getValue()).toBe('a');
        expect(changes).toEqual(['a']);
    });

    it('should treat data-group slot headers consistently with isGroup', async () => {
        const el = createSelect({}, target => {
            const group = document.createElement('div');
            group.setAttribute('data-value', 'g1');
            group.setAttribute('data-group', '');
            group.setAttribute('data-label', '分组');
            group.textContent = '分组';
            target.appendChild(group);
            const option = document.createElement('div');
            option.setAttribute('data-value', 'a');
            option.setAttribute('data-label', 'A');
            option.textContent = 'A';
            target.appendChild(option);
        });
        await tick();
        expect(el.$data.useSlot).toBe(true);
        expect(el.getOptions()).toEqual([{ label: 'A', value: 'a', disabled: false, isGroup: undefined }]);

        const changes: unknown[] = [];
        el.addEventListener('change', (e: any) => changes.push(e.target.value));

        await open(el);
        const groupEl = el.querySelector('[data-group]') as HTMLElement;
        // 分组标题不会被写入 option 语义
        expect(groupEl.hasAttribute('role')).toBe(false);
        groupEl.click();
        await tick();
        expect(el.getValue()).toBe('');
        expect(changes).toEqual([]);

        // 键盘高亮不会落在分组标题上
        const root = getRoot(el);
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();
        expect(el.$data.activeIndex).toBe(1);
        expect(el.querySelector('[data-value="a"]').hasAttribute('data-highlighted')).toBe(true);
    });

    it('should not dispatch change/clear during initialization regardless of attribute order', async () => {
        const build = (order: 'value-first' | 'multiple-first') => {
            const el = document.createElement('solely-select') as any;
            if (order === 'value-first') {
                el.setAttribute('value', 'a,b');
                el.setAttribute('multiple', '');
            } else {
                el.setAttribute('multiple', '');
                el.setAttribute('value', 'a,b');
            }
            el.setAttribute('options', JSON.stringify(OPTIONS));
            return el;
        };

        for (const order of ['value-first', 'multiple-first'] as const) {
            const el = build(order);
            const changes: unknown[] = [];
            const clears: unknown[] = [];
            el.addEventListener('change', (e: any) => changes.push(e.target.value));
            el.addEventListener('clear', () => clears.push('clear'));
            document.body.appendChild(el);
            await tick(60);

            // 多选任何路径的初始值都是数组，且初始化不派发事件
            expect(el.getValue()).toEqual(['a', 'b']);
            expect(changes).toEqual([]);
            expect(clears).toEqual([]);

            // 契约：property 写回零事件
            el.value = 'c,a';
            await tick();
            expect(el.getValue()).toEqual(['c', 'a']);
            expect(changes).toEqual([]);
            expect(clears).toEqual([]);

            // 显式 setValue 才派发，载荷仍是数组
            el.setValue('a,b');
            await tick();
            expect(changes).toHaveLength(1);
            expect(Array.isArray(changes[0])).toBe(true);
            expect(changes[0]).toEqual(['a', 'b']);

            el.remove();
        }
    });

    it('should observe dynamic slot option attributes without render loops', async () => {
        const el = createSelect({}, target => {
            for (const [value, label] of [
                ['a', 'A'],
                ['b', 'B'],
            ]) {
                const option = document.createElement('div');
                option.setAttribute('data-value', value);
                option.setAttribute('data-label', label);
                option.textContent = label;
                target.appendChild(option);
            }
        });
        await tick();
        const optionA = el.querySelector('[data-value="a"]') as HTMLElement;

        optionA.setAttribute('data-label', '新A');
        await tick(60);
        expect(el.getOptions()[0].label).toBe('新A');

        optionA.setAttribute('data-value', 'z');
        await tick(60);
        expect(el.getOptions().map((o: any) => o.value)).toEqual(['z', 'b']);

        optionA.setAttribute('disabled', '');
        await tick(60);
        expect(el.$data.slotOptions[0].disabled).toBe(true);

        await open(el);
        el.querySelector('[data-value="z"]').click();
        await tick();
        expect(el.getValue()).toBe('');

        // 观察器写入的 role/aria-selected 不在监听列表内，不会造成重复重建
        const slotOptionsRef = el.$data.slotOptions;
        await tick(80);
        expect(el.$data.slotOptions).toBe(slotOptionsRef);
    });

    it('should deduplicate multiple values on write and fully deselect on click', async () => {
        const el = createSelect({ multiple: '' });
        await tick();

        el.value = ['a', 'a', 'b'];
        await tick();
        expect(el.getValue()).toEqual(['a', 'b']);

        await open(el);
        el.shadowRoot.querySelectorAll('.select__option')[0].click();
        await tick();
        expect(el.getValue()).toEqual(['b']);

        el.value = 'a,a,b,b';
        await tick();
        expect(el.getValue()).toEqual(['a', 'b']);
    });

    it('should clean up slot accessibility state when switching back to options', async () => {
        const el = createSelect({ value: 'a' }, target => {
            const option = document.createElement('div');
            option.setAttribute('data-value', 'a');
            option.setAttribute('data-label', '插槽A');
            option.textContent = '插槽A';
            target.appendChild(option);
        });
        await tick();
        const slotEl = el.querySelector('[data-value="a"]') as HTMLElement;
        expect(el.$data.useSlot).toBe(true);
        expect(slotEl.getAttribute('role')).toBe('option');
        expect(slotEl.getAttribute('aria-selected')).toBe('true');
        expect(slotEl.id).not.toBe('');

        el.setAttribute('options', JSON.stringify([{ label: '普通A', value: 'a' }]));
        await tick();

        expect(el.$data.useSlot).toBe(false);
        expect(slotEl.hasAttribute('role')).toBe(false);
        expect(slotEl.hasAttribute('aria-selected')).toBe(false);
        expect(slotEl.id).toBe('');
        expect(el.$data.selectedLabel).toBe('普通A');
    });

    it('should fall back to options label when slot options are removed', async () => {
        const el = createSelect({ value: 'b', options: JSON.stringify([{ label: '选项B', value: 'b' }]) }, target => {
            const option = document.createElement('div');
            option.setAttribute('data-value', 'b');
            option.setAttribute('data-label', '插槽B');
            option.textContent = '插槽B';
            target.appendChild(option);
        });
        await tick();
        await open(el);
        el.querySelector('[data-value="b"]').click();
        await tick();
        expect(el.$data.selectedLabel).toBe('插槽B');

        el.querySelector('[data-value="b"]').remove();
        await tick(80);

        expect(el.$data.useSlot).toBe(false);
        expect(el.getValue()).toBe('b');
        expect(el.$data.selectedLabel).toBe('选项B');
    });

    it('should fall back to raw value as label when no option provides it', async () => {
        const el = createSelect({ options: '[]' }, target => {
            const option = document.createElement('div');
            option.setAttribute('data-value', 'x');
            option.setAttribute('data-label', '插槽X');
            option.textContent = '插槽X';
            target.appendChild(option);
        });
        await tick();
        await open(el);
        el.querySelector('[data-value="x"]').click();
        await tick();
        expect(el.$data.selectedLabel).toBe('插槽X');

        el.querySelector('[data-value="x"]').remove();
        await tick(80);

        expect(el.$data.useSlot).toBe(false);
        expect(el.getValue()).toBe('x');
        expect(el.$data.selectedLabel).toBe('x');
    });

    it('should only dispatch change when the value actually changes', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        const changes: unknown[] = [];
        el.addEventListener('change', (e: any) => changes.push(e.target.value));

        el.setValue('a');
        el.value = 'a';
        await tick();
        expect(changes).toEqual([]);

        // 点击已选中项不派发
        await open(el);
        el.shadowRoot.querySelectorAll('.select__option')[0].click();
        await tick();
        expect(changes).toEqual([]);

        el.setValue('b');
        await tick();
        expect(changes).toEqual(['b']);

        // 多选重复写入去重后视为未变化
        const multi = createSelect({ multiple: '', value: 'a' });
        await tick();
        const multiChanges: unknown[] = [];
        multi.addEventListener('change', (e: any) => multiChanges.push(e.target.value));
        multi.setValue(['a']);
        multi.setValue(['a', 'a']);
        await tick();
        expect(multiChanges).toEqual([]);
        expect(multi.getValue()).toEqual(['a']);
    });

    it('should restore setOptions result when the options attribute is removed', async () => {
        const el = createSelect({ options: JSON.stringify(OPTIONS) });
        await tick();

        el.setOptions([{ label: 'C', value: 'c' }]);
        await tick();
        expect(el.getOptions().map((o: any) => o.value)).toEqual(['c']);

        // 移除属性不应丢弃 setOptions() 的结果
        el.removeAttribute('options');
        await tick();
        expect(el.getOptions().map((o: any) => o.value)).toEqual(['c']);

        // 重新设置属性时属性优先，并解除 setOptions 锁定
        el.setAttribute('options', JSON.stringify([{ label: 'D', value: 'd' }]));
        await tick();
        expect(el.getOptions().map((o: any) => o.value)).toEqual(['d']);
    });

    it('should remove aria-controls/aria-activedescendant when closed', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        const root = getRoot(el);

        expect(root.hasAttribute('aria-controls')).toBe(false);
        expect(root.hasAttribute('aria-activedescendant')).toBe(false);

        await open(el);
        expect(root.getAttribute('aria-controls')).toBe(el.getListboxId());
        // 打开后默认无高亮；用键盘移动后才写入 aria-activedescendant
        expect(root.hasAttribute('aria-activedescendant')).toBe(false);

        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick();
        expect(root.hasAttribute('aria-activedescendant')).toBe(true);

        el.close();
        await tick();
        expect(root.hasAttribute('aria-controls')).toBe(false);
        expect(root.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('should skip disabled options on Home/End and keep highlight across open()', async () => {
        const el = createSelect({
            options: JSON.stringify([
                { label: 'A', value: 'a', disabled: true },
                { label: 'B', value: 'b' },
                { label: 'C', value: 'c', disabled: true },
                { label: 'D', value: 'd' },
            ]),
        });
        await tick();
        const root = getRoot(el);
        const press = (key: string) => root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

        press('ArrowDown');
        await tick();
        expect(el.$data.activeIndex).toBe(1);

        press('End');
        await tick();
        expect(el.$data.activeIndex).toBe(3);

        press('Home');
        await tick();
        expect(el.$data.activeIndex).toBe(1);

        // 已打开时重复 open() 不重置高亮
        el.open();
        await tick();
        expect(el.$data.activeIndex).toBe(1);

        // 关闭态 ArrowUp 打开并落在最后一个可选项
        el.close();
        await tick();
        press('ArrowUp');
        await tick();
        expect(el.$data.isOpen).toBe(true);
        expect(el.$data.activeIndex).toBe(3);
    });

    it('should not close when clicking blank area inside the dropdown', async () => {
        const el = createSelect({ multiple: '' });
        await tick();
        await open(el);

        const dropdown = el.shadowRoot.querySelector('.select__dropdown') as HTMLElement;
        dropdown.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(el.$data.isOpen).toBe(true);

        const content = el.shadowRoot.querySelector('.select__dropdown-content') as HTMLElement;
        content.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(el.$data.isOpen).toBe(true);

        // 触发器仍可正常收起
        getRoot(el).click();
        await tick();
        expect(el.$data.isOpen).toBe(false);
    });

    it('原地修改 options 条目会同步下拉内容，且不污染宿主属性', async () => {
        const el = createSelect();
        await tick();
        await open(el);

        // 引用不变、仅 label 变化：仍要重渲染（M2）
        el.options[0].label = '选项A2';
        await tick();
        const labels = Array.from(el.shadowRoot.querySelectorAll('.select__option-label')).map(
            (node: any) => node.textContent,
        );
        expect(labels[0]).toBe('选项A2');

        // 引用不变、仅 disabled 变化：禁用样式同步（M2）
        el.options[1].disabled = true;
        await tick();
        const optionNodes = el.shadowRoot.querySelectorAll('.select__option');
        expect(optionNodes[1].classList.contains('select__option--disabled')).toBe(true);

        // 嵌套字段名与宿主 prop 同名时不能被镜像成宿主属性（H1）
        expect(el.hasAttribute('disabled')).toBe(false);
        expect(el.disabled).toBe(false);
    });

    it('挂载后首次 updated 不重复解析 options', async () => {
        const el = document.createElement('solely-select') as any;
        el.setAttribute('options', JSON.stringify(OPTIONS));
        const parseSpy = vi.spyOn(el, 'parseOptions');

        document.body.appendChild(el);
        await tick();
        // 插槽回退 + mounted 各解析一次；首次 updated 不应再重复解析
        expect(parseSpy).toHaveBeenCalledTimes(2);

        el.value = 'b';
        await tick();
        expect(parseSpy).toHaveBeenCalledTimes(2);
    });

    it('收起动画期间重新打开会恢复定位订阅', async () => {
        const el = createSelect();
        await tick();
        await open(el);
        expect(typeof el._stopObserve).toBe('function');

        // 开始收起动画：解绑 observe，但浮层尚未移除
        el.closeDropdown();
        expect(el.$data.closing).toBe(true);
        expect(el._stopObserve).toBeUndefined();

        // 动画未结束就重新打开，需要重新入栈并恢复定位订阅（M3）
        el.open();
        await tick();
        expect(el.$data.closing).toBe(false);
        expect(el.$data.isOpen).toBe(true);
        expect(typeof el._stopObserve).toBe('function');
    });
});

describe('solely-select 开箱即用：声明式选项与字符串图标', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    function createDeclarative(innerHTML: string, value?: string) {
        const el = document.createElement('solely-select') as any;
        if (value) el.setAttribute('value', value);
        el.innerHTML = innerHTML;
        document.body.appendChild(el);
        return el;
    }

    it('注册 <solely-select-option> 并作为插槽数据源', async () => {
        expect(customElements.get('solely-select-option')).toBeTruthy();

        const el = createDeclarative(
            `
            <solely-select-option value="user">用户</solely-select-option>
            <solely-select-option value="admin" label="管理员">忽略文本</solely-select-option>
            <solely-select-option value="guest" disabled>访客</solely-select-option>
            `,
            'user',
        );
        await tick(80);

        expect(el.$data.useSlot).toBe(true);
        expect(el.$data.slotOptions.map((item: any) => [item.value, item.label, item.disabled])).toEqual([
            ['user', '用户', false],
            ['admin', '管理员', false],
            ['guest', '访客', true],
        ]);
        expect(el.$data.selectedLabel).toBe('用户');
        expect(el.querySelector('[value="user"]').hasAttribute('data-selected')).toBe(true);
    });

    it('点击声明式选项更新值，禁用项不可选', async () => {
        const el = createDeclarative(`
            <solely-select-option value="user">用户</solely-select-option>
            <solely-select-option value="admin" label="管理员">忽略文本</solely-select-option>
            <solely-select-option value="guest" disabled>访客</solely-select-option>
        `);
        await tick(80);

        await open(el);
        el.querySelector('[value="admin"]').click();
        await tick();
        expect(el.getValue()).toBe('admin');
        expect(el.$data.selectedLabel).toBe('管理员');
        expect(el.querySelector('[value="admin"]').hasAttribute('data-selected')).toBe(true);

        el.querySelector('[value="guest"]').click();
        await tick();
        expect(el.getValue()).toBe('admin');
    });

    it('声明式选项下运行时写值不抛 Illegal invocation', async () => {
        const el = createDeclarative(
            `
            <solely-select-option value="user">用户</solely-select-option>
            <solely-select-option value="admin" label="管理员">管理员</solely-select-option>
            <solely-select-option value="guest">访客</solely-select-option>
            `,
            'user',
        );
        await tick(80);

        expect(() => {
            el.value = 'admin';
        }).not.toThrow();
        await tick();
        expect(el.getValue()).toBe('admin');
        expect(el.$data.selectedLabel).toBe('管理员');

        expect(() => el.setValue('guest')).not.toThrow();
        await tick();
        expect(el.getValue()).toBe('guest');
        expect(el.$data.selectedLabel).toBe('访客');

        expect(() => el.clear()).not.toThrow();
        await tick();
        expect(el.getValue()).toBe('');
        expect(el.$data.selectedLabel).toBe('');
        expect(el.querySelector('[data-selected]')).toBeNull();
    });

    it('声明式选项下 value/label 属性变化会自动重新收集', async () => {
        const el = createDeclarative(`
            <solely-select-option value="user">用户</solely-select-option>
            <solely-select-option value="admin" label="管理员">管理员</solely-select-option>
        `);
        await tick(80);

        el.querySelector('[value="user"]').setAttribute('label', '普通用户');
        await tick(80);
        expect(el.$data.slotOptions[0].label).toBe('普通用户');

        el.querySelector('[value="user"]').setAttribute('value', 'member');
        await tick(80);
        expect(el.$data.slotOptions[0].value).toBe('member');
    });

    it('字符串图标类名同时暴露为 part，且选中内容复用同一渲染', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        el.setOptions([{ label: '选项A', value: 'a', icon: 'icon-gear icon-lg' }]);
        await tick();

        const triggerIcon = el.shadowRoot.querySelector('.select__value-content .select__option-icon') as HTMLElement;
        expect(triggerIcon).toBeTruthy();
        expect(triggerIcon.classList.contains('icon-gear')).toBe(true);
        expect(triggerIcon.classList.contains('icon-lg')).toBe(true);
        expect(triggerIcon.getAttribute('part')).toBe('option-icon icon-gear icon-lg');

        await open(el);
        const optionIcon = el.shadowRoot.querySelector('.select__option .select__option-icon') as HTMLElement;
        expect(optionIcon.classList.contains('icon-gear')).toBe(true);
        expect(optionIcon.getAttribute('part')).toBe('option-icon icon-gear icon-lg');
    });

    it('字符串图标中的非法 part 片段会被忽略', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        el.setOptions([{ label: '选项A', value: 'a', icon: 'icon-gear 1-bad' }]);
        await tick();

        const icon = el.shadowRoot.querySelector('.select__value-content .select__option-icon') as HTMLElement;
        expect(icon.classList.contains('1-bad')).toBe(true);
        expect(icon.getAttribute('part')).toBe('option-icon icon-gear');
    });
});

describe('solely-select 选中内容一致性', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should reuse icon rendering in dropdown and multiple tags', async () => {
        const icon = document.createElement('span');
        icon.className = 'icon-dot';
        icon.textContent = '●';

        const el = createSelect({ multiple: '' });
        await tick();
        el.setOptions([
            { label: '选项A', value: 'a', icon },
            { label: '选项B', value: 'b', icon },
        ]);
        await tick();

        await open(el);
        const options = el.shadowRoot.querySelectorAll('.select__option');
        expect(options[0].querySelector('.select__option-icon .icon-dot')).toBeTruthy();

        (options[0] as HTMLElement).click();
        await tick();
        expect(el.$data.isOpen).toBe(true);

        const tags = el.shadowRoot.querySelectorAll('.select__tag');
        expect(tags).toHaveLength(1);
        expect(tags[0].querySelector('.select__option-icon .icon-dot')).toBeTruthy();
        expect(tags[0].textContent).toContain('选项A');

        (options[1] as HTMLElement).click();
        await tick();
        expect(el.shadowRoot.querySelectorAll('.select__tag')).toHaveLength(2);
    });

    it('should reuse custom render in dropdown and selected value', async () => {
        const el = createSelect({ value: 'a' });
        await tick();
        el.setOptions([
            {
                label: '选项A',
                value: 'a',
                render: () => {
                    const strong = document.createElement('strong');
                    strong.className = 'custom-render';
                    strong.textContent = '自定义A';
                    return strong;
                },
            },
        ]);
        await tick();

        const trigger = el.shadowRoot.querySelector('.select__value-content') as HTMLElement;
        expect(trigger.querySelector('strong.custom-render')).toBeTruthy();
        expect(trigger.textContent).toContain('自定义A');

        await open(el);
        const option = el.shadowRoot.querySelector('.select__option') as HTMLElement;
        expect(option.querySelector('strong.custom-render')).toBeTruthy();
    });

    it('should fall back to raw value when the option cannot be found', async () => {
        const el = createSelect({ value: 'missing' });
        await tick();

        const trigger = el.shadowRoot.querySelector('.select__value-content') as HTMLElement;
        expect(trigger.textContent).toBe('missing');
    });

    it('should mark the selected option with a check and independent class', async () => {
        const el = createSelect({ value: 'b' });
        await tick();
        await open(el);

        const selected = el.shadowRoot.querySelector('.select__option--selected') as HTMLElement;
        expect(selected).toBeTruthy();
        expect(selected.querySelector('.select__option-check')).toBeTruthy();
        expect(selected.getAttribute('aria-selected')).toBe('true');
        expect(el.shadowRoot.querySelector('.select__option--highlighted')).toBeNull();
    });
});

describe('solely-select 清除按钮与下拉箭头', () => {
    it('用线性 SVG 图标而非 × / ▼ 文字符号，保证基线与大小一致', async () => {
        const el = createSelect({ clearable: '', value: 'a' });
        await tick();

        const clear = el.shadowRoot.querySelector('.select__clear') as HTMLElement;
        const arrow = el.shadowRoot.querySelector('.select__arrow') as HTMLElement;
        expect(clear).toBeTruthy();
        expect(arrow).toBeTruthy();
        expect(clear.querySelector('svg.select__action-icon')?.getAttribute('viewBox')).toBe('0 0 16 16');
        expect(arrow.querySelector('svg.select__action-icon')?.getAttribute('viewBox')).toBe('0 0 16 16');
        expect(clear.textContent?.trim()).toBe('');
        expect(arrow.textContent?.trim()).toBe('');
        // 清除按钮可键盘访问，箭头只是装饰
        expect(clear.getAttribute('role')).toBe('button');
        expect(clear.getAttribute('tabindex')).toBe('0');
        expect(arrow.getAttribute('aria-hidden')).toBe('true');
    });
});
