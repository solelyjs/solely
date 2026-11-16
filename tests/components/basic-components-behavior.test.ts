/**
 * 基础组件行为测试
 *
 * 覆盖 fab / progress / badge / card / alert / tag / timeline / empty /
 * skeleton / breadcrumb / button 的公开方法与真实渲染结果（class / style / 文本 / 事件）。
 */
import { describe, it, expect, vi } from 'vitest';

import '../../src/components/elements/fab';
import '../../src/components/elements/progress';
import '../../src/components/elements/badge';
import '../../src/components/elements/card';
import '../../src/components/elements/alert';
import '../../src/components/elements/tag';
import '../../src/components/elements/timeline';
import '../../src/components/elements/empty';
import '../../src/components/elements/skeleton';
import '../../src/components/elements/breadcrumb';
import '../../src/components/elements/button';
import '../../src/components/elements/steps';
import '../../src/components/elements/upload';
import '../../docs/components-docs/views/skeleton';
import '../../docs/components-docs/views/upload';
import { getShadowRoot, mountAndWait, recordEvents, tick } from '../helpers';

describe('solely-fab', () => {
    it('should render default classes/styles and update them via setPosition / setOffset', async () => {
        const el = await mountAndWait<any>('solely-fab');
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;

        expect(base.classList.contains('fab--primary')).toBe(true);
        expect(base.classList.contains('fab--md')).toBe(true);
        expect(base.classList.contains('fab--circle')).toBe(true);
        expect(base.classList.contains('fab--bottom-right')).toBe(true);
        expect(base.style.getPropertyValue('--fab-offset-x')).toBe('24px');
        expect(base.style.getPropertyValue('--fab-offset-y')).toBe('24px');
        expect(base.style.zIndex).toBe('1000');

        el.setPosition('top-left');
        await tick();

        expect(base.classList.contains('fab--top-left')).toBe(true);
        expect(base.classList.contains('fab--bottom-right')).toBe(false);

        // 0 是合法偏移值，不应回退成默认值
        el.setOffset(0, 12);
        await tick();

        expect(base.style.getPropertyValue('--fab-offset-x')).toBe('0px');
        expect(base.style.getPropertyValue('--fab-offset-y')).toBe('12px');
    });

    it('should toggle visibility through show / hide / toggle', async () => {
        const el = await mountAndWait<any>('solely-fab');
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;

        el.hide();
        await tick();
        expect(base.classList.contains('fab--hidden')).toBe(true);
        expect(el.visible).toBe(false);

        el.show();
        await tick();
        expect(base.classList.contains('fab--hidden')).toBe(false);
        expect(el.visible).toBe(true);

        el.toggle();
        await tick();
        expect(base.classList.contains('fab--hidden')).toBe(true);
        expect(el.visible).toBe(false);
    });

    it('隐藏时先移走焦点，避免 aria-hidden 元素持有焦点', async () => {
        const el = await mountAndWait<any>('solely-fab');
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;
        const activeOf = () => (el.shadowRoot ?? document).activeElement;

        base.focus();
        expect(activeOf()).toBe(base);

        el.hide();
        await tick();
        expect(el.visible).toBe(false);
        expect(base.getAttribute('aria-hidden')).toBe('true');
        expect(activeOf()).not.toBe(base);
    });

    it('should leave the Tab order and hide from AT when invisible, restoring when visible', async () => {
        const el = await mountAndWait<any>('solely-fab');
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;

        el.visible = false;
        await tick();
        expect(base.getAttribute('tabindex')).toBe('-1');
        expect(base.getAttribute('aria-hidden')).toBe('true');
        expect(getShadowRoot(el).querySelector('[tabindex="0"]')).toBeNull();

        el.visible = true;
        await tick();
        expect(base.getAttribute('tabindex')).toBe('0');
        expect(base.hasAttribute('aria-hidden')).toBe(false);
    });

    it('should hide on click when hideOnClick is set', async () => {
        const el = await mountAndWait<any>('solely-fab', { 'hide-on-click': true });
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;

        base.click();
        await tick();

        expect(base.classList.contains('fab--hidden')).toBe(true);
        expect(el.visible).toBe(false);
    });

    it('should prevent the click and not hide when disabled', async () => {
        const el = await mountAndWait<any>('solely-fab', { disabled: true, 'hide-on-click': true });
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;
        expect(base.disabled).toBe(true);

        let hostClicked = false;
        el.addEventListener('click', () => {
            hostClicked = true;
        });

        const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
        const allowed = base.dispatchEvent(event);
        await tick();

        expect(event.defaultPrevented).toBe(true);
        expect(allowed).toBe(false);
        expect(hostClicked).toBe(false);
        expect(base.classList.contains('fab--hidden')).toBe(false);
    });

    it('should delegate focus and blur to the inner button', async () => {
        const el = await mountAndWait<any>('solely-fab');
        const base = getShadowRoot(el).querySelector('.fab') as HTMLButtonElement;
        expect(el.$refs.buttonRef).toBe(base);

        const focusSpy = vi.spyOn(base, 'focus');
        const blurSpy = vi.spyOn(base, 'blur');

        el.focus({ preventScroll: true });
        el.blur();

        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(blurSpy).toHaveBeenCalledTimes(1);

        focusSpy.mockRestore();
        blurSpy.mockRestore();
    });
});

describe('solely-progress', () => {
    it('should render circle path classes and circumference/offset attributes', async () => {
        const el = await mountAndWait<any>('solely-progress', {
            type: 'circle',
            percent: 25,
            width: 100,
            'stroke-width': 10,
            status: 'exception',
        });
        const root = getShadowRoot(el);
        const path = root.querySelector('.progress__circle-path') as SVGCircleElement;
        const circumference = 90 * Math.PI;

        expect(path.classList.contains('progress__circle-path--exception')).toBe(true);
        expect(Number(path.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference, 6);
        expect(Number(path.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 6);
        expect(el.circleCircumference).toBeCloseTo(circumference, 6);
        expect(el.circleOffset).toBeCloseTo(circumference * 0.75, 6);
        // 异常状态改由线性 SVG 承载，不再输出 ✕ 字符
        expect(
            root.querySelector('.progress__circle-text svg.solely-linear-icon path')?.getAttribute('d'),
        ).toBeTruthy();
        expect(root.querySelector('.progress__circle-text')!.textContent!.trim()).toBe('');
    });

    it('should clamp percent and update the rendered offset via setPercent', async () => {
        const el = await mountAndWait<any>('solely-progress', {
            type: 'circle',
            percent: 200,
            width: 120,
            'stroke-width': 8,
        });
        const root = getShadowRoot(el);
        const path = root.querySelector('.progress__circle-path') as SVGCircleElement;
        const circumference = el.circleCircumference;

        expect(el.getPercent()).toBe(100);
        expect(Number(path.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 6);
        expect(root.querySelector('.progress__circle-text')!.textContent).toBe('100%');

        el.setPercent(-10);
        await tick();

        expect(el.getPercent()).toBe(0);
        expect(Number(path.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference, 6);
        expect(root.querySelector('.progress__circle-text')!.textContent).toBe('0%');

        el.setPercent(50);
        await tick();

        expect(el.getPercent()).toBe(50);
        expect(Number(path.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.5, 6);
        expect(root.querySelector('.progress__circle-text')!.textContent).toBe('50%');
    });

    it('should expose progressbar semantics and circle aria-valuetext', async () => {
        const line = await mountAndWait<any>('solely-progress', { percent: 42 });
        const lineBase = getShadowRoot(line).querySelector('.progress') as HTMLElement;

        expect(lineBase.getAttribute('role')).toBe('progressbar');
        expect(lineBase.getAttribute('aria-valuemin')).toBe('0');
        expect(lineBase.getAttribute('aria-valuemax')).toBe('100');
        expect(lineBase.getAttribute('aria-valuenow')).toBe('42');
        // 线性进度条不需要 aria-valuetext
        expect(lineBase.hasAttribute('aria-valuetext')).toBe(false);

        const circle = await mountAndWait<any>('solely-progress', { type: 'circle', percent: 73.6 });
        const circleBase = getShadowRoot(circle).querySelector('.progress') as HTMLElement;

        expect(circleBase.getAttribute('aria-valuenow')).toBe('73.6');
        expect(circleBase.getAttribute('aria-valuetext')).toBe('74%');
    });

    it('format 在 line 与 circle 两种类型下均生效（R-19）', async () => {
        const line = await mountAndWait<any>('solely-progress', {
            type: 'line',
            percent: 25,
            format: '{percent}/100',
        });
        expect(getShadowRoot(line).querySelector('.progress__text')!.textContent).toBe('25/100');

        const circle = await mountAndWait<any>('solely-progress', {
            type: 'circle',
            percent: 25,
            format: '{percent}/100',
        });
        expect(getShadowRoot(circle).querySelector('.progress__circle-text')!.textContent).toBe('25/100');
    });
});

describe('solely-badge', () => {
    it('should update count text and overflow via setCount / increase / decrease', async () => {
        const el = await mountAndWait<any>('solely-badge', { count: 5 });
        const root = getShadowRoot(el);

        expect(root.querySelector('.badge__count')!.textContent!.trim()).toBe('5');

        el.setCount(120);
        await tick();
        expect(root.querySelector('.badge__count')!.textContent!.trim()).toBe('99+');

        el.increase(5);
        await tick();
        expect(el.count).toBe(125);
        expect(root.querySelector('.badge__count')!.textContent!.trim()).toBe('99+');

        el.decrease(200);
        await tick();
        expect(el.count).toBe(0);
        expect(root.querySelector('.badge__count')).toBeNull();
        // badge--zero 是历史死类名（无任何 CSS 命中），已随审计清理
        expect(root.querySelector('.badge')!.classList.contains('badge--zero')).toBe(false);
    });

    it('should switch between count and dot via showDot / hideDot', async () => {
        const el = await mountAndWait<any>('solely-badge', { count: 3 });
        const root = getShadowRoot(el);

        el.showDot();
        await tick();

        expect(root.querySelector('.badge__dot')).not.toBeNull();
        expect(root.querySelector('.badge__count')).toBeNull();
        expect(root.querySelector('.badge')!.classList.contains('badge--zero')).toBe(false);

        el.hideDot();
        await tick();

        expect(root.querySelector('.badge__dot')).toBeNull();
        // dot 关闭后 count 仍为 3，数字徽标恢复
        expect(root.querySelector('.badge__count')!.textContent!.trim()).toBe('3');
    });
});

describe('solely-card', () => {
    it('should update title and loading state', async () => {
        const el = await mountAndWait<any>('solely-card', { title: 'Original' });
        const root = getShadowRoot(el);

        expect(root.querySelector('.card__title')!.textContent).toBe('Original');

        el.setTitle('Updated');
        await tick();
        expect(root.querySelector('.card__title')!.textContent).toBe('Updated');

        el.setLoading(true);
        await tick();

        expect(root.querySelector('.card')!.classList.contains('is-loading')).toBe(true);
        expect(root.querySelector('.card__loading')).not.toBeNull();
        expect(root.querySelector('.card__body')).toBeNull();

        el.setLoading(false);
        await tick();

        expect(root.querySelector('.card')!.classList.contains('is-loading')).toBe(false);
        expect(root.querySelector('.card__loading')).toBeNull();
        expect(root.querySelector('.card__body')).not.toBeNull();
    });

    it('should emit an action event with index and action name', async () => {
        const el = await mountAndWait<any>('solely-card', {
            actions: JSON.stringify(['Edit', 'Delete']),
        });
        const root = getShadowRoot(el);
        const actions = root.querySelectorAll('.card__action');
        const events = recordEvents<CustomEvent>(el, ['action']);

        expect(actions.length).toBe(2);

        (actions[1] as HTMLElement).click();

        expect(events.events.length).toBe(1);
        expect(events.events[0].detail).toEqual({ index: 1, action: 'Delete' });

        // 越界索引不派发事件
        el.handleActionClick(5, new Event('click'));
        expect(events.events.length).toBe(1);
    });

    it('should make action items keyboard reachable', async () => {
        const el = await mountAndWait<any>('solely-card', {
            actions: JSON.stringify(['Edit', 'Delete']),
        });
        const action = getShadowRoot(el).querySelector('.card__action') as HTMLElement;
        const events = recordEvents<CustomEvent>(el, ['action']);

        expect(action.getAttribute('role')).toBe('button');
        expect(action.getAttribute('tabindex')).toBe('0');
        expect(action.getAttribute('aria-label')).toBe('Edit');

        const enter = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        action.dispatchEvent(enter);

        expect(enter.defaultPrevented).toBe(true);
        expect(events.events.length).toBe(1);
        expect(events.events[0].detail).toEqual({ index: 0, action: 'Edit' });
    });

    it('无 title 时 extra 属性仍渲染 header（R-18）', async () => {
        const el = await mountAndWait<any>('solely-card', { extra: '更多' });
        const root = getShadowRoot(el);

        expect(root.querySelector('.card__header')).not.toBeNull();
        expect(root.querySelector('.card__title')).toBeNull();
        expect(root.querySelector('.card__extra')!.textContent!.trim()).toBe('更多');
    });

    it('无 title 时 extra 插槽仍渲染 header（R-18）', async () => {
        const el = await mountAndWait<any>('solely-card');
        const extra = document.createElement('span');
        extra.setAttribute('slot', 'extra');
        extra.textContent = '插槽额外内容';
        el.appendChild(extra);
        await tick();

        const root = getShadowRoot(el);
        expect(root.querySelector('.card__header')).not.toBeNull();
        expect(root.querySelector('.card__title')).toBeNull();
        expect(root.querySelector('slot[name="extra"]')).not.toBeNull();
    });

    it('无 actions 属性且无 actions 插槽时不渲染操作区（R-18 / 附录 A）', async () => {
        const el = await mountAndWait<any>('solely-card', { title: '仅标题' });
        expect(getShadowRoot(el).querySelector('.card__actions')).toBeNull();

        const emptyActions = await mountAndWait<any>('solely-card', { actions: '[]' });
        expect(getShadowRoot(emptyActions).querySelector('.card__actions')).toBeNull();

        const withAttr = await mountAndWait<any>('solely-card', { actions: JSON.stringify(['编辑']) });
        expect(getShadowRoot(withAttr).querySelector('.card__actions')).not.toBeNull();

        const withSlot = await mountAndWait<any>('solely-card', { title: '插槽操作' });
        const actions = document.createElement('div');
        actions.setAttribute('slot', 'actions');
        withSlot.appendChild(actions);
        await tick();
        expect(getShadowRoot(withSlot).querySelector('.card__actions')).not.toBeNull();
    });
});

describe('solely-alert', () => {
    it('should update message and type through setMessage / setType', async () => {
        const el = await mountAndWait<any>('solely-alert', {
            message: 'hello',
            'show-icon': true,
            type: 'info',
        });
        const root = getShadowRoot(el);

        expect(root.querySelector('.alert__message')!.textContent).toBe('hello');
        expect(root.querySelector('.alert')!.classList.contains('alert--info')).toBe(true);

        el.setMessage('updated');
        el.setType('success');
        await tick();

        expect(root.querySelector('.alert__message')!.textContent).toBe('updated');
        expect(root.querySelector('.alert')!.classList.contains('alert--success')).toBe(true);
        expect(root.querySelector('.alert')!.classList.contains('alert--info')).toBe(false);
        // 状态提示改由线性 SVG 承载，不再输出 ✓ 字符
        expect(root.querySelector('.alert__icon svg.solely-linear-icon path')?.getAttribute('d')).toBeTruthy();
        expect(root.querySelector('.alert__icon')!.textContent!.trim()).toBe('');
    });

    it('should close on Enter / Space and ignore other keys', async () => {
        const el = await mountAndWait<any>('solely-alert', { message: 'a', closable: true });
        const root = getShadowRoot(el);
        const close = root.querySelector('.alert__close') as HTMLElement;
        const events = recordEvents<CustomEvent>(el, ['close']);

        close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        await tick();

        expect(events.events.length).toBe(0);
        expect(root.querySelector('.alert')!.classList.contains('is-closing')).toBe(false);

        const enter = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        close.dispatchEvent(enter);

        expect(enter.defaultPrevented).toBe(true);
        expect(events.events.length).toBe(1);
        expect(events.events[0].detail).toEqual({ source: 'user' });

        await tick();
        expect(root.querySelector('.alert')!.classList.contains('is-closing')).toBe(true);

        const spaceEl = await mountAndWait<any>('solely-alert', { message: 'b', closable: true });
        const spaceEvents = recordEvents<CustomEvent>(spaceEl, ['close']);
        (getShadowRoot(spaceEl).querySelector('.alert__close') as HTMLElement).dispatchEvent(
            new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }),
        );

        expect(spaceEvents.events.length).toBe(1);
        expect(spaceEvents.events[0].detail).toEqual({ source: 'user' });
    });
});

describe('solely-tag', () => {
    it('should update content and type through setContent / setType', async () => {
        const el = await mountAndWait<any>('solely-tag', { content: 'old' });
        const root = getShadowRoot(el);

        expect(root.querySelector('slot')!.textContent).toBe('old');

        el.setContent('new');
        await tick();
        expect(root.querySelector('slot')!.textContent).toBe('new');

        el.setType('success');
        await tick();

        const base = root.querySelector('.tag')!;
        expect(base.classList.contains('tag--success')).toBe(true);
        expect(base.classList.contains('tag--default')).toBe(false);
    });

    it('should expose close button semantics and support keyboard activation', async () => {
        const el = await mountAndWait<any>('solely-tag', { content: 'x', closable: true });
        const close = getShadowRoot(el).querySelector('.tag__close') as HTMLElement;

        expect(close.getAttribute('role')).toBe('button');
        expect(close.getAttribute('tabindex')).toBe('0');
        expect(close.getAttribute('aria-label')).toBe('关闭');

        const events = recordEvents<CustomEvent>(el, ['close']);
        const space = new KeyboardEvent('keydown', {
            key: ' ',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        close.dispatchEvent(space);

        expect(space.defaultPrevented).toBe(true);
        expect(events.events.length).toBe(1);
        expect(events.events[0].detail).toEqual({ content: 'x' });
    });
});

describe('solely-steps', () => {
    const items = JSON.stringify([{ title: '步骤一' }, { title: '步骤二', disabled: true }]);

    it('should not be interactive by default', async () => {
        const el = await mountAndWait<any>('solely-steps', { items });
        const steps = getShadowRoot(el).querySelectorAll('.step');

        expect(steps[0].getAttribute('role')).toBe('listitem');
        expect(steps[0].hasAttribute('tabindex')).toBe(false);

        const events = recordEvents<CustomEvent>(el, ['change']);
        (steps[0] as HTMLElement).click();
        await tick();

        expect(events.events.length).toBe(0);
        expect(el.current).toBe(0);
    });

    it('should support keyboard operation in clickable mode and skip disabled steps', async () => {
        const el = await mountAndWait<any>('solely-steps', { items, clickable: true });
        const steps = getShadowRoot(el).querySelectorAll('.step');

        expect(steps[0].getAttribute('role')).toBe('button');
        expect(steps[0].getAttribute('tabindex')).toBe('0');
        expect(steps[1].getAttribute('role')).toBe('listitem');
        expect(steps[1].hasAttribute('tabindex')).toBe(false);
        expect(steps[1].classList.contains('step--disabled')).toBe(true);

        const events = recordEvents<CustomEvent>(el, ['change']);
        steps[0].dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                composed: true,
                cancelable: true,
            }),
        );

        expect(events.events.length).toBe(1);
        expect(events.events[0].detail).toMatchObject({ index: 0 });
    });
});

describe('solely-timeline', () => {
    it('should render horizontal alternation, preset dots and custom icon styles', async () => {
        const items = [{ title: 'A' }, { title: 'B', icon: '★', color: '#ff0000' }, { title: 'C', color: 'blue' }];
        const el = await mountAndWait<any>('solely-timeline', {
            mode: 'horizontal-alternate',
            variant: 'filled',
            items: JSON.stringify(items),
        });
        const root = getShadowRoot(el);

        expect(el.isHorizontal()).toBe(true);
        expect(el.isAlternate()).toBe(true);
        expect(el.getIconStyle({ color: '#ff0000' })).toBe('color: #ff0000; background-color: #ff000015;');
        expect(el.getIconStyle({ color: 'blue' })).toBe('');
        expect(el.getIconStyle({})).toBe('');

        const base = root.querySelector('.timeline')!;
        expect(base.classList.contains('timeline--horizontal-alternate')).toBe(true);
        expect(base.classList.contains('timeline--filled')).toBe(true);

        const listItems = root.querySelectorAll('.timeline__item');
        expect(listItems.length).toBe(3);
        expect(listItems[0].classList.contains('timeline__item--top')).toBe(true);
        expect(listItems[1].classList.contains('timeline__item--bottom')).toBe(true);
        expect(listItems[2].classList.contains('timeline__item--top')).toBe(true);

        const iconWrapper = listItems[1].querySelector('.timeline__icon-wrapper') as HTMLElement;
        expect(iconWrapper.textContent).toBe('★');
        expect(iconWrapper.style.color).not.toBe('');
        expect(listItems[2].querySelector('.timeline__dot')!.classList.contains('timeline__dot--blue')).toBe(true);
    });

    it('should support vertical alternate and replace items via setItems', async () => {
        const el = await mountAndWait<any>('solely-timeline', {
            mode: 'alternate',
            items: JSON.stringify([{ title: 'L' }, { title: 'R' }]),
        });
        const root = getShadowRoot(el);

        expect(el.isHorizontal()).toBe(false);
        expect(el.isAlternate()).toBe(true);

        const listItems = root.querySelectorAll('.timeline__item');
        expect(listItems[0].classList.contains('timeline__item--left')).toBe(true);
        expect(listItems[1].classList.contains('timeline__item--right')).toBe(true);

        el.setItems([{ title: 'Only' }]);
        await tick();

        expect(root.querySelectorAll('.timeline__item').length).toBe(1);
        expect(root.querySelector('.timeline__title')!.textContent).toBe('Only');

        const leftMode = await mountAndWait<any>('solely-timeline', { mode: 'left' });
        expect(leftMode.isHorizontal()).toBe(false);
        expect(leftMode.isAlternate()).toBe(false);
    });
});

describe('solely-empty', () => {
    it('should render description and update it via setDescription', async () => {
        const el = await mountAndWait<any>('solely-empty');
        const root = getShadowRoot(el);

        expect(root.querySelector('.empty__description')!.textContent).toBe('暂无数据');

        el.setDescription('暂无订单');
        await tick();
        expect(root.querySelector('.empty__description')!.textContent).toBe('暂无订单');

        el.setDescription('');
        await tick();
        // 显式清空不再被模板兜底覆盖，属性与渲染保持一致
        expect(el.description).toBe('');
        expect(root.querySelector('.empty__description')!.textContent).toBe('');
    });
});

describe('solely-skeleton', () => {
    it('should toggle loading state and aria-busy via startLoading / setLoading', async () => {
        const el = await mountAndWait<any>('solely-skeleton');
        const root = getShadowRoot(el);

        expect(el.getAttribute('aria-busy')).toBe('true');
        expect(root.querySelector('.skeleton__paragraph')).not.toBeNull();
        expect(root.querySelectorAll('.skeleton__row').length).toBe(3);

        el.finishLoading();
        await tick();

        expect(el.getAttribute('aria-busy')).toBe('false');
        expect(root.querySelector('.skeleton__paragraph')).toBeNull();
        expect(root.querySelector('.skeleton__real-content')).not.toBeNull();

        el.startLoading();
        await tick();

        expect(el.getAttribute('aria-busy')).toBe('true');
        expect(root.querySelectorAll('.skeleton__row').length).toBe(3);

        el.setLoading(false);
        await tick();

        expect(el.getAttribute('aria-busy')).toBe('false');
        expect(root.querySelector('.skeleton__real-content')).not.toBeNull();
    });
});

describe('solely-breadcrumb', () => {
    it('should expose parsed items through the items getter and reflect setter changes', async () => {
        const items = [{ title: 'Home', href: '/' }, { title: 'List', href: '/list' }, { title: 'Detail' }];
        const el = await mountAndWait<any>('solely-breadcrumb', {
            items: JSON.stringify(items),
            separator: '>',
        });
        const root = getShadowRoot(el);

        expect(Array.isArray(el.items)).toBe(true);
        expect(el.items.map((item: any) => item.title)).toEqual(['Home', 'List', 'Detail']);
        expect(el.items[0].href).toBe('/');

        expect(root.querySelectorAll('.breadcrumb__link').length).toBe(2);
        expect(root.querySelector('.breadcrumb__current')!.textContent!.trim()).toBe('Detail');
        expect(root.querySelectorAll('.breadcrumb__separator').length).toBe(2);

        el.items = [{ title: 'A', href: '/a' }, { title: 'B' }];
        await tick();

        expect(el.items.map((item: any) => item.title)).toEqual(['A', 'B']);
        expect(root.querySelector('.breadcrumb__current')!.textContent!.trim()).toBe('B');
    });

    it('无 href 的中间项可聚焦并支持 Enter，当前项标记 aria-current', async () => {
        const el = await mountAndWait<any>('solely-breadcrumb', {
            items: JSON.stringify([{ title: 'Home', href: '/' }, { title: 'List' }, { title: 'Detail' }]),
        });
        const root = getShadowRoot(el);
        const links = root.querySelectorAll('.breadcrumb__link');
        const recorder = recordEvents(el, ['item-click']);

        expect(links[1].getAttribute('role')).toBe('link');
        expect(links[1].getAttribute('tabindex')).toBe('0');
        expect(root.querySelector('.breadcrumb__current')!.getAttribute('aria-current')).toBe('page');

        links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        await tick();
        expect(recorder.of('item-click')).toHaveLength(1);
    });
});

describe('solely-button', () => {
    it('should expose href/target through getLinkAttrs and render an anchor', async () => {
        const el = await mountAndWait<any>('solely-button', {
            href: '/docs',
            target: '_blank',
            content: 'Docs',
        });
        const root = getShadowRoot(el);
        const anchor = root.querySelector('a.btn') as HTMLAnchorElement;

        expect(el.getLinkAttrs()).toEqual({ href: '/docs', target: '_blank' });
        expect(anchor).not.toBeNull();
        expect(anchor.getAttribute('href')).toBe('/docs');
        expect(anchor.getAttribute('target')).toBe('_blank');
        expect(anchor.textContent).toContain('Docs');

        const noTarget = await mountAndWait<any>('solely-button', { href: '/a' });
        expect(noTarget.getLinkAttrs()).toEqual({ href: '/a' });

        const noHref = await mountAndWait<any>('solely-button', { content: 'X' });
        expect(noHref.getLinkAttrs()).toEqual({});
    });

    it('should render loading icon/state and clear it via setLoading', async () => {
        const el = await mountAndWait<any>('solely-button', {
            content: 'Submit',
            'loading-icon': '⟳',
        });
        const root = getShadowRoot(el);
        const button = root.querySelector('button.btn') as HTMLButtonElement;
        const events = recordEvents(el, ['click']);

        expect(el.getLoadingIcon()).toBe('⟳');
        expect(root.querySelector('.btn__loading-icon')).toBeNull();

        el.setLoading(true);
        await tick();

        expect(button.classList.contains('is-loading')).toBe(true);
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(root.querySelector('.btn__loading-icon')!.textContent).toContain('⟳');

        // loading 状态下的点击被阻止（disabled 按钮的 click() 不派发事件，这里直接派发验证守卫）
        const clickEvent = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
        button.dispatchEvent(clickEvent);
        expect(clickEvent.defaultPrevented).toBe(true);
        expect(events.events.length).toBe(0);

        el.setLoading(false);
        await tick();

        expect(button.classList.contains('is-loading')).toBe(false);
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-disabled')).toBe('false');
        expect(root.querySelector('.btn__loading-icon')).toBeNull();
    });

    it('should toggle disabled state and delegate focus/blur', async () => {
        const el = await mountAndWait<any>('solely-button', { content: 'Click' });
        const button = getShadowRoot(el).querySelector('button.btn') as HTMLButtonElement;

        el.setDisabled(true);
        await tick();

        expect(button.classList.contains('is-disabled')).toBe(true);
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-disabled')).toBe('true');

        el.setDisabled(false);
        await tick();

        expect(button.classList.contains('is-disabled')).toBe(false);
        expect(button.disabled).toBe(false);

        expect(el.$refs.buttonRef).toBe(button);
        const focusSpy = vi.spyOn(button, 'focus');
        const blurSpy = vi.spyOn(button, 'blur');

        el.focus();
        el.blur();

        expect(focusSpy).toHaveBeenCalledTimes(1);
        expect(blurSpy).toHaveBeenCalledTimes(1);

        focusSpy.mockRestore();
        blurSpy.mockRestore();
    });
});

describe('关闭按钮的线性图标', () => {
    it('tag / alert 的关闭控件使用线性 SVG，不再输出 × 文本', async () => {
        const tag = await mountAndWait<any>('solely-tag', { content: '标签', closable: true });
        const alert = await mountAndWait<any>('solely-alert', { message: '提示', closable: true });

        const tagClose = getShadowRoot(tag).querySelector('.tag__close') as HTMLElement;
        const alertClose = getShadowRoot(alert).querySelector('.alert__close') as HTMLElement;
        expect(tagClose.querySelector('svg.solely-linear-icon')).toBeTruthy();
        expect(alertClose.querySelector('svg.solely-linear-icon')).toBeTruthy();
        expect(tagClose.textContent?.trim()).toBe('');
        expect(alertClose.textContent?.trim()).toBe('');
    });
});

describe('骨架屏文档 demo', () => {
    it('点击「加载完成」后真的切到真实内容，而不是一直停在骨架屏', async () => {
        document.body.innerHTML = '';
        const doc = document.createElement('docs-skeleton') as any;
        document.body.appendChild(doc);
        await tick();

        const skeleton = doc.querySelector('solely-skeleton') as any;
        expect(skeleton.$data.loading).toBe(true);
        expect(skeleton.shadowRoot.querySelector('.skeleton__real-content')).toBeNull();

        doc.toggleLoading();
        await tick();
        expect(skeleton.$data.loading).toBe(false);
        expect(skeleton.shadowRoot.querySelector('.skeleton__real-content')).toBeTruthy();

        // 再次点击要能回到骨架屏
        doc.toggleLoading();
        await tick();
        expect(skeleton.$data.loading).toBe(true);
    });
});

describe('upload 文档样例', () => {
    it('除刻意演示 error 的样例外，所有 upload demo 都注入了 mock 上传', async () => {
        document.body.innerHTML = '';
        const doc = document.createElement('docs-upload') as any;
        document.body.appendChild(doc);
        await tick();

        const uploads = Array.from(doc.querySelectorAll('solely-upload')) as any[];
        const noTarget = doc.$refs.noTargetUpload;
        expect(uploads.length).toBeGreaterThan(8);
        expect(noTarget).toBeTruthy();

        uploads.forEach(el => {
            if (el === noTarget) {
                expect(typeof el.customRequest).not.toBe('function');
            } else {
                expect(typeof el.customRequest).toBe('function');
            }
        });
        expect(typeof (doc.$refs.hooksUpload as any)?.beforeUpload).toBe('function');
    });

    it('基础用法样例选文件后能真正走完进度并派发 success', async () => {
        document.body.innerHTML = '';
        const doc = document.createElement('docs-upload') as any;
        document.body.appendChild(doc);
        await tick();

        const el = doc.querySelector('solely-upload') as any;
        const successes: Event[] = [];
        el.addEventListener('success', (e: Event) => successes.push(e));

        const input = (el.shadowRoot as ShadowRoot).querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['hello'], 'demo.txt', { type: 'text/plain' });
        Object.defineProperty(input, 'files', {
            value: { 0: file, length: 1, item: () => file },
            configurable: true,
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // mock 每 300ms 推进 25%，共 4 次到 100%
        await new Promise<void>(resolve => setTimeout(resolve, 1400));
        expect(successes).toHaveLength(1);
        expect(el.$data.parsedFileList?.[0]?.status).toBe('done');
    });
});

describe('card / empty 图片失败回退', () => {
    it('封面加载失败时换成内置占位图，且不会重复触发形成循环', async () => {
        const el = await mountAndWait<any>('solely-card', { cover: 'https://bad.example/cover.png' });
        const img = getShadowRoot(el).querySelector('.card__cover img') as HTMLImageElement;
        expect(img).toBeTruthy();

        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('data:image/svg+xml');
        const first = img.src;
        img.dispatchEvent(new Event('error'));
        expect(img.src).toBe(first);
    });

    it('empty 自定义图片加载失败时换成内置占位图', async () => {
        const el = await mountAndWait<any>('solely-empty', { image: 'https://bad.example/x.png' });
        const img = getShadowRoot(el).querySelector('.empty__image img') as HTMLImageElement;
        expect(img).toBeTruthy();

        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('data:image/svg+xml');
    });
});
