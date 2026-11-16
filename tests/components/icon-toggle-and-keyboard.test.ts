/**
 * 装饰图标开关 + 键盘可访问性契约测试
 *
 * 覆盖第五类（默认装饰图标可关闭）与第四类（遗漏的键盘/ARIA 补齐）。
 */
import { describe, it, expect, beforeEach } from 'vitest';

import '../../src/components/elements/alert';
import '../../src/components/elements/empty';
import '../../src/components/elements/not-found';
import '../../src/components/elements/upload';
import '../../src/components/elements/input';
import '../../src/components/elements/select';
import '../../src/components/elements/tree';
import '../../src/components/elements/switch';
import '../../src/components/elements/tabs';

const tick = (ms = 20) => new Promise<void>(r => setTimeout(r, ms));

function mount(tag: string, attrs: Record<string, string> = {}): any {
    const el = document.createElement(tag) as any;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('装饰图标开关 · alert', () => {
    it('默认不显示图标；show-icon 开启；show-icon="false" 真正关闭', async () => {
        const el = mount('solely-alert', { type: 'info' });
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).toBeNull();

        el.setAttribute('show-icon', '');
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).not.toBeNull();

        el.setAttribute('show-icon', 'false');
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).toBeNull();
    });

    it('icon="" 不渲染图标节点；slot 提供图标时仍渲染插槽', async () => {
        const el = mount('solely-alert', { type: 'info', 'show-icon': '', icon: '' });
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).toBeNull();

        el.innerHTML = '<span slot="icon">★</span>';
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).not.toBeNull();
    });

    it('icon 属性覆盖内置图标，showIcon=false 优先级最高', async () => {
        const el = mount('solely-alert', { type: 'success', 'show-icon': '', icon: '✓自定义' });
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')!.textContent).toContain('✓自定义');

        el.setAttribute('show-icon', 'false');
        await tick();
        expect(el.shadowRoot!.querySelector('[part="icon"]')).toBeNull();
    });
});

describe('装饰图标开关 · empty', () => {
    it('默认展示占位图标，description 读回默认文案', async () => {
        const el = mount('solely-empty');
        await tick();
        expect(el.description).toBe('暂无数据');
        expect(el.shadowRoot!.querySelector('[part="image"]')).not.toBeNull();
        expect(el.shadowRoot!.querySelector('[part="description"]')!.textContent!.trim()).toBe('暂无数据');
    });

    it('show-icon="false" 不渲染图片区域，description 可显式清空', async () => {
        const el = mount('solely-empty', { 'show-icon': 'false', description: '' });
        await tick();
        expect(el.shadowRoot!.querySelector('[part="image"]')).toBeNull();
        expect(el.shadowRoot!.querySelector('[part="description"]')!.textContent!.trim()).toBe('');
    });
});

describe('装饰图标开关 · not-found', () => {
    it('默认渲染状态图标；show-icon="false" 后仅隐藏图标并保留 404', async () => {
        const el = mount('solely-not-found');
        await tick();
        expect(el.shadowRoot!.querySelector('.not-found__icon-wrapper')).not.toBeNull();

        el.setAttribute('show-icon', 'false');
        await tick();
        expect(el.shadowRoot!.querySelector('.not-found__icon-wrapper')).toBeNull();
        expect(el.shadowRoot!.querySelectorAll('.not-found__number').length).toBe(2);
    });
});

describe('装饰图标开关 · upload', () => {
    it('show-icon="false" 时拖拽区不渲染装饰图标', async () => {
        const el = mount('solely-upload', { drag: '' });
        await tick();
        expect(el.shadowRoot!.querySelector('.upload__drag-icon')).not.toBeNull();

        el.setAttribute('show-icon', 'false');
        await tick();
        expect(el.shadowRoot!.querySelector('.upload__drag-icon')).toBeNull();
    });
});

describe('键盘可访问性 · input', () => {
    it('清除按钮具备 role + tabindex + aria-label，Enter 可清除', async () => {
        const el = mount('solely-input', { clearable: '', value: 'hello' });
        await tick();

        const clear = el.shadowRoot.querySelector('.form-control__clear') as HTMLElement;
        expect(clear.getAttribute('role')).toBe('button');
        expect(clear.getAttribute('tabindex')).toBe('0');
        expect(clear.getAttribute('aria-label')).toBe('清除内容');

        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        clear.dispatchEvent(event);
        await tick();
        expect(event.defaultPrevented).toBe(true);
        expect(el.value).toBe('');
    });

    it('密码切换具备 aria-label / aria-pressed，Enter 可切换', async () => {
        const el = mount('solely-input', { type: 'password', 'show-password': '', value: 'secret' });
        await tick();

        const password = el.shadowRoot.querySelector('.form-control__password-toggle') as HTMLElement;
        expect(password.getAttribute('role')).toBe('button');
        expect(password.getAttribute('aria-label')).toBe('显示密码');
        expect(password.getAttribute('aria-pressed')).toBe('false');

        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        password.dispatchEvent(event);
        await tick();
        expect(el.$data.passwordVisible).toBe(true);
        expect(password.getAttribute('aria-pressed')).toBe('true');
        expect(password.getAttribute('aria-label')).toBe('隐藏密码');
    });

    it('清除 / 密码切换 / 复制三个操作可以同时渲染（互不排斥）', async () => {
        const el = mount('solely-input', {
            type: 'password',
            'show-password': '',
            clearable: '',
            copyable: '',
            value: 'secret',
        });
        await tick();

        expect(el.shadowRoot.querySelector('.form-control__clear')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.form-control__password-toggle')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.form-control__copy')).not.toBeNull();

        // 清空按钮固定在装饰按钮最右侧，紧贴输入框右内边缘
        const actions = [
            ...el.shadowRoot.querySelectorAll(
                '.form-control__password-toggle, .form-control__copy, .form-control__clear',
            ),
        ];
        expect(actions).toHaveLength(3);
        expect(actions[actions.length - 1].classList.contains('form-control__clear')).toBe(true);
    });

    it('三个装饰按钮共用统一盒子与 16×16 线性图标（避免高度不齐）', async () => {
        const el = mount('solely-input', {
            type: 'password',
            'show-password': '',
            clearable: '',
            copyable: '',
            value: 'secret',
        });
        await tick();

        const actions = [
            ...el.shadowRoot.querySelectorAll(
                '.form-control__password-toggle, .form-control__copy, .form-control__clear',
            ),
        ] as HTMLElement[];
        expect(actions).toHaveLength(3);
        for (const action of actions) {
            // 统一类名是唯一尺寸来源：20×20 flex 盒子 + 16×16 SVG，不再各自写 font-size
            expect(action.classList.contains('form-control__action')).toBe(true);
            const icon = action.querySelector('svg.form-control__action-icon');
            expect(icon).not.toBeNull();
            expect(icon!.getAttribute('viewBox')).toBe('0 0 16 16');
        }
        // 不再依赖系统 emoji（彩色字面框比文字符号高出一截）
        expect(el.shadowRoot.querySelector('.form-control')!.textContent).not.toMatch(/[📋🙈👁×]/);
    });

    it('复制按钮具备 role + tabindex + aria-label', async () => {
        const el = mount('solely-input', { copyable: '', value: 'hello' });
        await tick();

        const copy = el.shadowRoot.querySelector('.form-control__copy') as HTMLElement;
        expect(copy.getAttribute('role')).toBe('button');
        expect(copy.getAttribute('tabindex')).toBe('0');
        expect(copy.getAttribute('aria-label')).toBe('复制内容');
    });

    it('联想项具备 option 语义并可用 Enter 选中', async () => {
        const el = mount('solely-input', { value: '', suggestions: JSON.stringify(['hello', 'help']) });
        await tick();

        el._updateSuggestionsImpl('he');
        await tick();

        const item = el.shadowRoot.querySelector('.dropdown__item') as HTMLElement;
        expect(item.getAttribute('role')).toBe('option');
        expect(item.getAttribute('tabindex')).toBe('0');
        expect(item.getAttribute('aria-label')).toBe('hello');

        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        item.dispatchEvent(event);
        await tick();
        expect(event.defaultPrevented).toBe(true);
        expect(el.value).toBe('hello');
    });
});

describe('键盘可访问性 · select', () => {
    it('combobox 有可访问名称，清除按钮可键盘激活', async () => {
        const el = mount('solely-select', {
            options: JSON.stringify([
                { label: '选项A', value: 'a' },
                { label: '选项B', value: 'b' },
            ]),
            value: 'a',
            clearable: '',
        });
        await tick();

        const combobox = el.shadowRoot!.querySelector('[part="base"]') as HTMLElement;
        expect(combobox.getAttribute('aria-label')).toBe('请选择');

        const clear = el.shadowRoot!.querySelector('.select__clear') as HTMLElement;
        expect(clear.getAttribute('role')).toBe('button');
        expect(clear.getAttribute('tabindex')).toBe('0');
        expect(clear.getAttribute('aria-label')).toBe('清除选择');

        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        clear.dispatchEvent(event);
        await tick();
        expect(event.defaultPrevented).toBe(true);
    });
});

describe('键盘可访问性 · tree', () => {
    it('复选框有 aria-label，禁用节点上的控件退出 Tab 序列', async () => {
        const el = mount('solely-tree', {
            checkable: '',
            'tree-data': JSON.stringify([
                { key: '1', title: '可选中' },
                { key: '2', title: '禁用', disabled: true },
            ]),
        });
        await tick();

        const checkboxes = el.shadowRoot!.querySelectorAll('.tree__checkbox');
        expect(checkboxes[0].getAttribute('aria-label')).toBe('选择 可选中');
        // 勾选框不再是独立 Tab 停点，键盘通过节点的 Space 键切换
        expect(checkboxes[0].getAttribute('tabindex')).toBe('-1');
        expect(checkboxes[1].getAttribute('tabindex')).toBe('-1');
    });
});

describe('键盘可访问性 · switch', () => {
    it('role=switch 默认可访问名称，可通过 aria-label 覆盖', async () => {
        const el = mount('solely-switch');
        await tick();
        const switcher = el.shadowRoot!.querySelector('[role="switch"]') as HTMLElement;
        expect(switcher.getAttribute('aria-label')).toBe('开关');

        el.setAttribute('aria-label', '消息通知');
        await tick();
        expect(switcher.getAttribute('aria-label')).toBe('消息通知');
    });
});

describe('键盘可访问性 · tabs', () => {
    it('禁用标签的关闭按钮退出 Tab 序列', async () => {
        const el = mount('solely-tabs', {
            closable: '',
            items: JSON.stringify([
                { key: 'a', label: 'A', disabled: true },
                { key: 'b', label: 'B' },
            ]),
        });
        await tick();

        const closeButtons = el.shadowRoot!.querySelectorAll('.tabs__close') as NodeListOf<HTMLElement>;
        expect(closeButtons.length).toBeGreaterThan(0);
        expect(closeButtons[0].getAttribute('tabindex')).toBe('-1');
    });
});
