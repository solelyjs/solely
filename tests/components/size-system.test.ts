import { describe, it, expect, beforeEach } from 'vitest';

import '../../src/components/elements/button';
import '../../src/components/elements/card';
import '../../src/components/elements/checkbox';
import '../../src/components/elements/coordinate-input';
import '../../src/components/elements/fab';
import '../../src/components/elements/icon';
import '../../src/components/elements/input';
import '../../src/components/elements/pagination';
import '../../src/components/elements/select';
import '../../src/components/elements/steps';
import '../../src/components/elements/switch';
import '../../src/components/elements/table';
import '../../src/components/elements/tabs';
import '../../src/components/elements/tag';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

const SIZE_COMPONENTS = [
    'solely-button',
    'solely-card',
    'solely-checkbox',
    'solely-coordinate-input',
    'solely-fab',
    'solely-icon',
    'solely-input',
    'solely-pagination',
    'solely-select',
    'solely-steps',
    'solely-switch',
    'solely-table',
    'solely-tabs',
    'solely-tag',
] as const;

function mount(tag: string) {
    const el = document.createElement(tag) as any;
    document.body.appendChild(el);
    return el;
}

describe('size 统一语义', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('未设置 size 时读回 medium，而不是 undefined 或 default', async () => {
        for (const tag of SIZE_COMPONENTS) {
            const el = mount(tag);
            await tick();
            expect(el.size, `${tag} 默认尺寸`).toBe('medium');
        }
    });

    it('middle / default 别名统一归一为 medium', async () => {
        for (const tag of SIZE_COMPONENTS) {
            const el = mount(tag);
            await tick();

            el.size = 'middle';
            await tick();
            expect(el.size, `${tag} middle 别名`).toBe('medium');

            el.size = 'default';
            await tick();
            expect(el.size, `${tag} default 别名`).toBe('medium');
        }
    });

    it('table 的 small / medium / large 渲染为独立类名', async () => {
        const table = mount('solely-table');
        await tick();

        expect(table.shadowRoot.querySelector('.table--md')).toBeTruthy();

        table.size = 'small';
        await tick();
        expect(table.shadowRoot.querySelector('.table--sm')).toBeTruthy();

        table.size = 'large';
        await tick();
        expect(table.shadowRoot.querySelector('.table--lg')).toBeTruthy();
    });

    it('card 的 large 档位真实生效', async () => {
        const card = mount('solely-card');
        await tick();

        expect(card.shadowRoot.querySelector('.card--lg')).toBeNull();

        card.size = 'large';
        await tick();
        expect(card.size).toBe('large');
        expect(card.shadowRoot.firstElementChild?.classList.contains('card--lg')).toBe(true);
    });

    it('icon 保留数字自定义尺寸，别名仍归一为 medium', async () => {
        const icon = mount('solely-icon');
        await tick();

        icon.size = 30;
        await tick();
        expect(icon.size).toBe(30);

        icon.size = 'middle';
        await tick();
        expect(icon.size).toBe('medium');
    });
});
