/**
 * 元素组件修复回归测试
 *
 * 覆盖本次修复的可观察行为：
 * - progress.format 生效
 * - badge.offset 生效
 * - slider min===max 不再产生 NaN、键盘可操作
 * - icon.spin 字符串布尔解析
 * - fab.offsetX/offsetY 支持 0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/progress';
import '../../src/components/elements/badge';
import '../../src/components/elements/slider';
import '../../src/components/elements/icon';
import '../../src/components/elements/fab';
import { registerIcon } from '../../src/components/elements/icon';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

function mount(tag: string, attrs: Record<string, string> = {}): any {
    const el = document.createElement(tag) as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('progress.format', () => {
    it('字符串模板中的 {percent} 会被替换', async () => {
        const el = mount('solely-progress', { percent: '42', format: '已完成 {percent}%' });
        await tick();
        expect(el.shadowRoot.querySelector('.progress__text').textContent).toBe('已完成 42%');
    });

    it('通过属性传入函数时使用自定义格式化', async () => {
        const el = mount('solely-progress', { percent: '42' });
        await tick();
        el.format = (percent: number) => `${percent}/100`;
        await tick();
        expect(el.shadowRoot.querySelector('.progress__text').textContent).toBe('42/100');
    });

    it('未设置 format 时保持默认百分比', async () => {
        const el = mount('solely-progress', { percent: '42' });
        await tick();
        expect(el.shadowRoot.querySelector('.progress__text').textContent).toBe('42%');
    });
});

describe('badge.offset', () => {
    it('offset 会叠加到默认定位 transform 上', async () => {
        const el = mount('solely-badge', { count: '5', offset: '10 20' });
        await tick();
        const style = el.getIndicatorStyle();
        expect(style.transform).toContain('calc(50% + 10px)');
        expect(style.transform).toContain('calc(-50% + 20px)');
        const count = el.shadowRoot.querySelector('.badge__count');
        expect(count.getAttribute('style') || '').toContain('translate');
    });

    it('未设置 offset 时不产生 transform', async () => {
        const el = mount('solely-badge', { count: '5' });
        await tick();
        expect(el.getIndicatorStyle().transform).toBeUndefined();
    });
});

describe('slider', () => {
    it('min === max 时百分比为 0，不产生 NaN', async () => {
        const el = mount('solely-slider', { min: '5', max: '5', value: '5' });
        await tick();
        expect(el.getPercent()).toBe(0);
        expect(el.getTrackStyle()).not.toContain('NaN');
        expect(el.getHandleStyle()).not.toContain('NaN');
        expect(el.getMarkStyle(5)).not.toContain('NaN');
    });

    it('方向键按 step 步进，Home/End 跳到两端', async () => {
        const el = mount('solely-slider', { min: '0', max: '100', value: '10', step: '5' });
        await tick();
        const rail = el.shadowRoot.querySelector('.slider__rail') as HTMLElement;
        const inputSpy = vi.fn();
        el.addEventListener('input', inputSpy);

        rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(el.value).toBe(15);

        rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(el.value).toBe(10);

        rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(el.value).toBe(100);

        rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(el.value).toBe(0);

        expect(inputSpy).toHaveBeenCalled();
    });

    it('禁用状态下方向键不改变值', async () => {
        const el = mount('solely-slider', { min: '0', max: '100', value: '10', disabled: '' });
        await tick();
        const rail = el.shadowRoot.querySelector('.slider__rail') as HTMLElement;
        rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(el.value).toBe(10);
    });
});

describe('icon.spin 布尔解析', () => {
    it('spin="false" 不旋转，裸 spin 属性旋转', async () => {
        registerIcon('spin-test', '<path d="M0 0h16v16H0z"/>');

        const off = mount('solely-icon', { name: 'spin-test', spin: 'false' });
        await tick();
        expect(off.shadowRoot.querySelector('svg').getAttribute('class') || '').not.toContain('is-spinning');
        expect(off.style.getPropertyValue('--spin-duration')).toBe('');

        const on = mount('solely-icon', { name: 'spin-test', spin: '' });
        await tick();
        expect(on.shadowRoot.querySelector('svg').getAttribute('class') || '').toContain('is-spinning');
        expect(on.style.getPropertyValue('--spin-duration')).toBe('1s');
    });

    it('spin="counterclockwise" 使用反向旋转', async () => {
        registerIcon('spin-test-2', '<path d="M0 0h16v16H0z"/>');
        const el = mount('solely-icon', { name: 'spin-test-2', spin: 'counterclockwise' });
        await tick();
        expect(el.style.getPropertyValue('--spin-direction')).toBe('reverse');
    });
});

describe('icon.color 默认值', () => {
    it('未设置时读回 currentColor，显式设置后可读回，remove 后回退', async () => {
        registerIcon('color-test', '<path d="M0 0h16v16H0z"/>');

        const el = mount('solely-icon', { name: 'color-test' });
        await tick();
        expect(el.color).toBe('currentColor');
        expect(el.hasAttribute('color')).toBe(false);

        el.color = 'red';
        expect(el.color).toBe('red');

        el.setAttribute('color', 'blue');
        expect(el.color).toBe('blue');

        el.removeAttribute('color');
        expect(el.color).toBe('currentColor');
    });
});

describe('icon 未注册告警', () => {
    it('未注册且未配置 sprite 时开发期告警一次，且不渲染空白 svg', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const el = mount('solely-icon', { name: 'missing-icon-for-warning' });
        await tick();

        expect(el.shadowRoot.querySelector('svg')).toBeNull();
        const calls = warn.mock.calls.filter(args => String(args[0]).includes('missing-icon-for-warning'));
        expect(calls).toHaveLength(1);

        // 同名重复渲染不再刷屏
        el.setAttribute('color', 'red');
        await tick();
        const repeated = warn.mock.calls.filter(args => String(args[0]).includes('missing-icon-for-warning'));
        expect(repeated).toHaveLength(1);

        warn.mockRestore();
    });
});

describe('fab offset', () => {
    it('offsetX/offsetY 为 0 时不再回退到 24px', async () => {
        const el = mount('solely-fab', { 'offset-x': '0', 'offset-y': '0' });
        await tick();
        const styles = el.getFabStyles();
        expect(styles['--fab-offset-x']).toBe('0px');
        expect(styles['--fab-offset-y']).toBe('0px');
    });

    it('未设置或非法值时保持默认 24px', async () => {
        const el = mount('solely-fab');
        await tick();
        const styles = el.getFabStyles();
        expect(styles['--fab-offset-x']).toBe('24px');
        expect(styles['--fab-offset-y']).toBe('24px');
    });
});
