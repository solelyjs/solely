import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../../src/components/elements/rate';
import '../../docs/components-docs/views/rate';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

function createRate(attrs: Record<string, string> = {}) {
    const el = document.createElement('solely-rate') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el as any;
}

const stars = (el: any): HTMLElement[] => Array.from(el.shadowRoot.querySelectorAll('.rate__star'));

const keydown = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));

// 给 jsdom 元素补上可用于半星计算的几何信息
function mockRect(el: HTMLElement, width = 20) {
    el.getBoundingClientRect = () =>
        ({
            left: 0,
            top: 0,
            right: width,
            bottom: width,
            width,
            height: width,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }) as DOMRect;
}

// 给整组星补上连续布局信息，用于验证跨星拖动
function mockStarRects(el: any, width = 20, gap = 4) {
    stars(el).forEach((star, idx) => {
        const left = idx * (width + gap);
        star.getBoundingClientRect = () =>
            ({
                left,
                right: left + width,
                width,
                top: 0,
                bottom: width,
                height: width,
                x: left,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;
    });
}

// jsdom 没有 PointerEvent，用 MouseEvent 派发同名指针事件即可触发监听
const pointer = (target: Element, type: string, clientX: number) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, clientX, button: 0 }));

describe('solely-rate', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should set value and dispatch change on star click', async () => {
        const el = createRate();
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(el.value).toBe(3);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(stars(el)[2].classList.contains('rate__star--full')).toBe(true);
    });

    it('should not dispatch change when clicking the same star again', async () => {
        const el = createRate({ value: '3' });
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(el.value).toBe(3);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('should clear value when allowClear and clicking the same star', async () => {
        const el = createRate({ value: '3', 'allow-clear': '' });
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(el.value).toBe(0);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('should support half star on mouse move / click when allowHalf', async () => {
        const el = createRate({ 'allow-half': '' });
        await tick();
        const third = stars(el)[2];
        mockRect(third, 20);

        third.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true, clientX: 5 }));
        await tick();
        // hover 2.5：第 3 颗星显示半星
        expect(third.classList.contains('rate__star--half')).toBe(true);
        expect(third.classList.contains('rate__star--full')).toBe(false);

        third.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 15 }));
        await tick();
        expect(el.value).toBe(3);

        // 左半边点击得到半星
        const fourth = stars(el)[3];
        mockRect(fourth, 20);
        fourth.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 4 }));
        await tick();
        expect(el.value).toBe(3.5);
    });

    it('should fall back to integer value when geometry is unavailable', async () => {
        const el = createRate({ 'allow-half': '' });
        await tick();
        stars(el)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 0 }));
        await tick();
        expect(el.value).toBe(2);
    });

    it('should increment / decrement with arrow keys and skip no-op dispatch at bounds', async () => {
        const el = createRate({ value: '3' });
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[2].focus();
        keydown(stars(el)[2], 'ArrowRight');
        await tick();
        expect(el.value).toBe(4);
        expect(el.shadowRoot.activeElement?.dataset.index).toBe('4');

        keydown(el.shadowRoot.activeElement!, 'End');
        await tick();
        expect(el.value).toBe(5);

        // 已在最大值，继续加不派发
        onChange.mockClear();
        keydown(el.shadowRoot.activeElement!, 'ArrowRight');
        await tick();
        expect(onChange).not.toHaveBeenCalled();

        // 不允许清除时 Home 落到可选最小值 1，而不是把评分清空
        keydown(el.shadowRoot.activeElement!, 'Home');
        await tick();
        expect(el.value).toBe(1);
    });

    it('should allow Home to clear only when allowClear', async () => {
        const el = createRate({ value: '3', 'allow-clear': '' });
        await tick();
        stars(el)[2].focus();
        keydown(stars(el)[2], 'Home');
        await tick();
        expect(el.value).toBe(0);
    });

    it('should not attach aria-valuenow / min / max to the radiogroup', async () => {
        const el = createRate({ value: '3', count: '5' });
        await tick();
        const group = el.shadowRoot.querySelector('.rate') as HTMLElement;

        expect(group.getAttribute('role')).toBe('radiogroup');
        expect(group.hasAttribute('aria-valuenow')).toBe(false);
        expect(group.hasAttribute('aria-valuemin')).toBe(false);
        expect(group.hasAttribute('aria-valuemax')).toBe(false);
        // 当前分值通过各 radio 的 aria-checked 表达
        expect(stars(el)[2].getAttribute('aria-checked')).toBe('true');
        expect(stars(el)[3].getAttribute('aria-checked')).toBe('false');
    });

    it('should remove the whole rating from tab order when disabled', async () => {
        const el = createRate({ value: '3', disabled: '' });
        await tick();
        expect(stars(el).map(star => star.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '-1', '-1']);
    });

    it('should clamp aria-checked and visuals when value exceeds count', async () => {
        const el = createRate({ value: '9', count: '5' });
        await tick();
        // API 读取也必须收敛，不能只裁视觉 / ARIA
        expect(el.value).toBe(5);
        expect(el.getValue()).toBe(5);
        expect(stars(el)).toHaveLength(5);
        expect(stars(el)[4].getAttribute('aria-checked')).toBe('true');
        expect(stars(el)[4].classList.contains('rate__star--full')).toBe(true);
        expect(stars(el)[4].getAttribute('tabindex')).toBe('0');
    });

    it('setValue 与 count 调小都会把分值收敛到 [0, count]', async () => {
        const el = createRate({ value: '2' });
        await tick();

        el.setValue(9);
        await tick();
        expect(el.value).toBe(5);
        expect(el.getValue()).toBe(5);

        el.setValue(-3);
        await tick();
        expect(el.value).toBe(0);

        el.setValue(4);
        await tick();
        el.count = 3;
        await tick();
        expect(el.value).toBe(3);
        expect(el.getValue()).toBe(3);
        expect(stars(el)).toHaveLength(3);
    });

    it('should treat a negative count as zero stars', async () => {
        const el = createRate({ count: '-3' });
        await tick();
        expect(stars(el)).toHaveLength(0);
    });

    it('should step by 0.5 with arrow keys when allowHalf', async () => {
        const el = createRate({ 'allow-half': '', value: '2' });
        await tick();
        const star = stars(el)[1];
        star.focus();
        keydown(star, 'ArrowRight');
        await tick();
        expect(el.value).toBe(2.5);
        expect(stars(el)[2].classList.contains('rate__star--half')).toBe(true);
    });

    it('should activate focused star with Enter / Space', async () => {
        const el = createRate({ value: '1' });
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[4].focus();
        keydown(stars(el)[4], ' ');
        await tick();
        expect(el.value).toBe(5);
        expect(onChange).toHaveBeenCalledTimes(1);

        keydown(stars(el)[4], 'Enter');
        await tick();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('should render tooltips from JSON array or comma separated string', async () => {
        const el = createRate({ tooltips: '["很差","较差","一般","不错","很好"]' });
        await tick();
        expect(stars(el)[0].getAttribute('title')).toBe('很差');
        expect(stars(el)[0].getAttribute('aria-label')).toBe('很差');

        document.body.innerHTML = '';
        const el2 = createRate({ tooltips: 'bad,ok,good' });
        await tick();
        expect(stars(el2)[0].getAttribute('title')).toBe('bad');
        // 超出数组范围时回落
        expect(stars(el2)[3].getAttribute('title')).toBe('4 分');
    });

    it('should expose a single roving tab stop at the current rating', async () => {
        const el = createRate({ value: '3' });
        await tick();
        const indexes = stars(el).map(star => star.getAttribute('tabindex'));
        expect(indexes).toEqual(['-1', '-1', '0', '-1', '-1']);

        el.value = 0;
        await tick();
        expect(stars(el)[0].getAttribute('tabindex')).toBe('0');
    });

    it('should ignore interaction when disabled or readonly', async () => {
        const el = createRate({ disabled: '' });
        await tick();
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        stars(el)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        keydown(stars(el)[0], 'ArrowRight');
        await tick();
        expect(el.value).toBe(0);
        expect(onChange).not.toHaveBeenCalled();

        document.body.innerHTML = '';
        const el2 = createRate({ readonly: '' });
        await tick();
        stars(el2)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();
        expect(el2.value).toBe(0);
    });

    it('readonly / disabled 写在 value 之前时仍保留初始评分', async () => {
        const el = createRate({ readonly: '', value: '4.5', 'allow-half': '' });
        await tick();
        expect(el.value).toBe(4.5);
        expect(stars(el)[3].classList.contains('rate__star--full')).toBe(true);
        expect(stars(el)[4].classList.contains('rate__star--half')).toBe(true);

        document.body.innerHTML = '';
        const el2 = createRate({ disabled: '', value: '3' });
        await tick();
        expect(el2.value).toBe(3);
        expect(stars(el2)[2].classList.contains('rate__star--full')).toBe(true);
    });

    it('按住拖动可跨星连续预览，松手只提交一次 change', async () => {
        const el = createRate({ 'allow-half': '', 'allow-clear': '' });
        await tick();
        mockStarRects(el);
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        pointer(stars(el)[0], 'pointerdown', 5); // 第 1 颗左半 → 0.5
        await tick();
        expect(stars(el)[0].classList.contains('rate__star--half')).toBe(true);

        pointer(stars(el)[2], 'pointermove', 53); // 第 3 颗左半 → 2.5
        await tick();
        expect(stars(el)[2].classList.contains('rate__star--half')).toBe(true);

        pointer(stars(el)[2], 'pointermove', 63); // 第 3 颗右半 → 3
        await tick();
        expect(stars(el)[2].classList.contains('rate__star--full')).toBe(true);

        pointer(stars(el)[2], 'pointerup', 53); // 松手落在左半 → 2.5
        // 浏览器补发的 click 必须被吞掉，否则 allowClear 会把刚提交的值清成 0
        stars(el)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 53 }));
        await tick();
        expect(el.value).toBe(2.5);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('拖动取值随 count 同步，且 readonly 不启动拖动', async () => {
        const el = createRate({ count: '8', value: '3' });
        await tick();
        mockStarRects(el);
        const onChange = vi.fn();
        el.addEventListener('change', onChange);

        pointer(stars(el)[2], 'pointerdown', 53);
        pointer(stars(el)[5], 'pointermove', 130); // 第 6 颗
        pointer(stars(el)[5], 'pointerup', 130);
        await tick();
        expect(stars(el)).toHaveLength(8);
        expect(el.value).toBe(6);
        expect(onChange).toHaveBeenCalledTimes(1);

        document.body.innerHTML = '';
        const el2 = createRate({ readonly: '', value: '4' });
        await tick();
        mockStarRects(el2);
        pointer(stars(el2)[4], 'pointerdown', 106);
        pointer(stars(el2)[4], 'pointerup', 106);
        await tick();
        expect(el2.value).toBe(4);
    });

    it('跨星移动不会被单星 mouseleave 打断悬停预览', async () => {
        const el = createRate({ value: '1' });
        await tick();
        const list = stars(el);

        list[2].dispatchEvent(new MouseEvent('mouseenter', { composed: true }));
        await tick();
        expect(list[2].classList.contains('rate__star--full')).toBe(true);

        // mouseleave 只绑在容器上：从一颗星移到另一颗星时不应清空
        list[2].dispatchEvent(new MouseEvent('mouseleave', { composed: true }));
        await tick();
        expect(list[2].classList.contains('rate__star--full')).toBe(true);

        const group = el.shadowRoot.querySelector('.rate') as HTMLElement;
        group.dispatchEvent(new MouseEvent('mouseleave', { composed: true }));
        await tick();
        expect(list[2].classList.contains('rate__star--full')).toBe(false);
    });
});

describe('solely-rate 默认值', () => {
    it('未设置时 property 读回文档默认值', async () => {
        const el = createRate();
        await tick();

        expect(el.count).toBe(5);
        expect(el.character).toBe('★');
        expect(stars(el)).toHaveLength(5);
        expect(el.hasAttribute('count')).toBe(false);
        expect(el.hasAttribute('character')).toBe(false);
    });

    it('显式设置后 property 读回设置值', async () => {
        const el = createRate({ count: '8', character: '☆' });
        await tick();

        expect(el.count).toBe(8);
        expect(el.character).toBe('☆');
        expect(stars(el)).toHaveLength(8);
    });

    it('removeAttribute 后回退到默认值', async () => {
        const el = createRate({ count: '8', character: '☆' });
        await tick();

        el.removeAttribute('count');
        el.removeAttribute('character');
        await tick();

        expect(el.count).toBe(5);
        expect(el.character).toBe('★');
        expect(stars(el)).toHaveLength(5);
    });
});

describe('rate 文档页 demo', () => {
    it('事件处理 / 只读 demo 都渲染出正确的初始分值', async () => {
        document.body.innerHTML = '';
        const doc = document.createElement('docs-rate');
        document.body.appendChild(doc);
        await new Promise<void>(r => setTimeout(r, 40));

        const blocks = Array.from(doc.querySelectorAll('.demo-block'));
        const findRate = (title: string) => {
            const block = blocks.find(b => b.querySelector('.demo-block-title')?.textContent?.trim() === title);
            return block?.querySelector('solely-rate') as any;
        };

        // 事件处理：:value 动态绑定必须写入 3，而不是把 {{...}} 当普通字符串
        const eventRate = findRate('事件处理');
        expect(eventRate.value).toBe(3);
        const eventStars = Array.from(eventRate.shadowRoot.querySelectorAll('.rate__star')) as HTMLElement[];
        expect(eventStars[2].classList.contains('rate__star--full')).toBe(true);

        // 只读：readonly 写在 value 之前，初始值 4.5 不能被 setter 拦掉
        const readonlyRate = findRate('只读状态');
        expect(readonlyRate.value).toBe(4.5);
        const readonlyStars = Array.from(readonlyRate.shadowRoot.querySelectorAll('.rate__star')) as HTMLElement[];
        expect(readonlyStars[3].classList.contains('rate__star--full')).toBe(true);
        expect(readonlyStars[4].classList.contains('rate__star--half')).toBe(true);
    });
});
