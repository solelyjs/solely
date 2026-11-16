import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/slider';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

function createSlider(attrs: Record<string, string> = {}) {
    const el = document.createElement('solely-slider') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el as any;
}

const rail = (el: any): HTMLElement => el.shadowRoot.querySelector('.slider__rail');
const handles = (el: any): HTMLElement[] => Array.from(el.shadowRoot.querySelectorAll('.slider__handle'));

function mockRailRect(el: any, width = 200, height = 20) {
    rail(el).getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

const keydown = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));

describe('solely-slider P1 补齐', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should render two handles and a spanning track in range mode', async () => {
        const el = createSlider({ range: '' });
        await tick();
        expect(handles(el).length).toBe(2);
        expect(el.value).toEqual([0, 0]);

        el.value = [20, 80];
        await tick();

        expect(el.value).toEqual([20, 80]);
        const track = el.shadowRoot.querySelector('.slider__track') as HTMLElement;
        expect(track.style.left).toBe('20%');
        expect(track.style.width).toBe('60%');
        // 轨道在 range 模式下作为 group，不再是单个 slider
        expect(rail(el).getAttribute('role')).toBe('group');
        expect(handles(el)[0].getAttribute('role')).toBe('slider');
    });

    it('should normalize out-of-order and out-of-bounds range values', async () => {
        const el = createSlider({ range: '', min: '10', max: '50' });
        await tick();
        el.value = [70, 5];
        await tick();
        expect(el.value).toEqual([10, 50]);
    });

    it('should move each handle with keyboard and respect ordering', async () => {
        const el = createSlider({ range: '' });
        await tick();
        el.value = [30, 70];
        await tick();

        keydown(handles(el)[0], 'ArrowRight');
        await tick();
        expect(el.value).toEqual([31, 70]);

        keydown(handles(el)[1], 'ArrowLeft');
        await tick();
        expect(el.value).toEqual([31, 69]);

        // 起始滑块不能越过结束滑块
        handles(el)[0].focus();
        el.value = [69, 69];
        await tick();
        keydown(el.shadowRoot.querySelector('.slider__handle[data-index="0"]'), 'End');
        await tick();
        expect(el.value).toEqual([69, 69]);
    });

    it('should drag the nearest handle when clicking the rail', async () => {
        const el = createSlider({ range: '' });
        await tick();
        el.value = [20, 80];
        await tick();
        mockRailRect(el, 200);

        // 40px 处在 20% 附近，应命中起始滑块
        rail(el).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, clientX: 40 }));
        await tick();
        expect(el.value[0]).toBeGreaterThanOrEqual(18);
        expect(el.value[0]).toBeLessThanOrEqual(22);
        expect(el.value[1]).toBe(80);

        // 拖到 90%：起始滑块被钳制在结束值，不会交叉
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 180 }));
        await tick();
        expect(el.value[0]).toBe(80);
        expect(el.value[1]).toBe(80);

        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    it('should format tooltip and aria-valuetext with tooltipFormatter', async () => {
        const el = createSlider({ range: '' });
        await tick();
        el.value = [20, 80];
        el.tooltipFormatter = (value: number) => `${value}%`;
        await tick();

        const tooltips = [...el.shadowRoot.querySelectorAll('.slider__tooltip')].map((t: any) => t.textContent);
        expect(tooltips).toEqual(['20%', '80%']);
        // range 模式：轨道是分组容器，不承载数值语义
        expect(rail(el).getAttribute('aria-valuetext')).toBeNull();
        expect(rail(el).getAttribute('aria-label')).toBe('范围选择');
        expect(handles(el)[0].getAttribute('aria-valuetext')).toBe('20%');
        expect(handles(el)[1].getAttribute('aria-valuenow')).toBe('80');
        expect(handles(el)[0].getAttribute('aria-valuenow')).toBe('20');
    });

    it('should support object marks with custom label and style', async () => {
        const el = createSlider({
            marks: '',
            'marks-data': JSON.stringify({
                '0': { label: '0°', style: 'color: red;' },
                '50': '50',
            }),
        });
        await tick();

        const labels = [...el.shadowRoot.querySelectorAll('.slider__mark-label')] as HTMLElement[];
        expect(labels.map(label => label.textContent)).toEqual(['0°', '50']);
        expect(labels[0].style.color).toBe('red');
    });

    it('should keep single-value slider behavior and aria-valuenow on rail', async () => {
        const el = createSlider({ value: '40' });
        await tick();
        expect(el.value).toBe(40);
        expect(handles(el).length).toBe(1);
        expect(rail(el).getAttribute('role')).toBe('slider');
        expect(rail(el).getAttribute('aria-valuenow')).toBe('40');
        expect(rail(el).getAttribute('aria-label')).toBe('滑动输入条');
        // 单滑块模式：手柄只是视觉元素，不重复 slider 语义，也不进 Tab 序列
        expect(handles(el)[0].getAttribute('role')).toBe('presentation');
        expect(handles(el)[0].getAttribute('aria-valuenow')).toBeNull();
        expect(handles(el)[0].getAttribute('tabindex')).toBe('-1');
        expect(el.shadowRoot.querySelector('.slider__track')!.getAttribute('style')).toContain('width: 40%');
    });

    it('should accept marksData as an object property', async () => {
        const el = createSlider({ marks: '' });
        await tick();
        el.marksData = { 25: '25%', 75: { label: '75%', style: 'color: blue;' } };
        el.refresh();
        await tick();

        const labels = [...el.shadowRoot.querySelectorAll('.slider__mark-label')] as HTMLElement[];
        expect(labels.map(label => label.textContent)).toEqual(['25%', '75%']);
        expect(labels[1].style.color).toBe('blue');
    });

    it('should remove disabled sliders from tab order', async () => {
        const single = createSlider({ value: '40', disabled: '' });
        await tick();
        expect(rail(single).getAttribute('tabindex')).toBe('-1');
        expect(handles(single)[0].getAttribute('tabindex')).toBe('-1');

        document.body.innerHTML = '';
        const range = createSlider({ range: '', disabled: '' });
        await tick();
        expect(rail(range).getAttribute('tabindex')).toBe('-1');
        expect(handles(range).map(handle => handle.getAttribute('tabindex'))).toEqual(['-1', '-1']);
    });

    it('should keep the initial value when disabled comes before value', async () => {
        // 属性顺序：disabled 先同步会把自定义 value setter 拦住，必须区分框架同步与用户赋值
        const el = createSlider({ disabled: '', value: '50' });
        await tick();
        expect(el.value).toBe(50);
        expect(rail(el).getAttribute('aria-valuenow')).toBe('50');
        expect(handles(el)[0].style.left).toBe('50%');
    });

    it('should dispatch change once only when drag actually changes the value', async () => {
        const el = createSlider({ value: '40' });
        await tick();
        mockRailRect(el, 200);
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        // 按下即松开：落在当前值上，不应派发空 change
        rail(el).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, clientX: 80 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await tick();
        expect(el.value).toBe(40);
        expect(onChange).not.toHaveBeenCalled();

        // 真正拖动后松手：只派发一次
        rail(el).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, clientX: 80 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await tick();
        expect(el.value).toBe(60);
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

describe('solely-slider 默认值', () => {
    it('未设置时 property 读回文档默认值', async () => {
        const el = createSlider();
        await tick();

        expect(el.min).toBe(0);
        expect(el.max).toBe(100);
        expect(el.step).toBe(1);
        expect(el.value).toBe(0);
        expect(el.hasAttribute('min')).toBe(false);
        expect(el.hasAttribute('value')).toBe(false);
    });

    it('range 模式下 value 默认为 [min, min]', async () => {
        const el = createSlider({ range: '', min: '10' });
        await tick();

        expect(el.min).toBe(10);
        expect(el.value).toEqual([10, 10]);
    });

    it('显式设置后 property 读回设置值', async () => {
        const el = createSlider({ min: '5', max: '50', step: '5', value: '20' });
        await tick();

        expect(el.min).toBe(5);
        expect(el.max).toBe(50);
        expect(el.step).toBe(5);
        expect(el.value).toBe(20);
    });

    it('removeAttribute 后回退到默认值', async () => {
        const el = createSlider({ min: '5', max: '50', step: '5', value: '20' });
        await tick();

        el.removeAttribute('min');
        el.removeAttribute('max');
        el.removeAttribute('step');
        el.removeAttribute('value');
        await tick();

        expect(el.min).toBe(0);
        expect(el.max).toBe(100);
        expect(el.step).toBe(1);
        expect(el.value).toBe(0);
    });
});
