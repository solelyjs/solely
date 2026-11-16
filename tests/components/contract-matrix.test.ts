/**
 * F-7 共性契约矩阵
 *
 * 目的：把反复出现的根因收敛为一组表驱动用例，而不是每个组件各写一套：
 * - F-1：挂载期（默认值 / attribute→state / 属性升级）不派发业务事件；
 * - F-2：attribute 与 property 两条写值路径得到同值同类型；
 * - data-* / aria-* 绑定为 null / undefined 时移除属性；
 * - F-3：跨树 ARIA IDREF 通过代理节点在引用方树内可解析。
 *
 * 约束：
 * - tooltip / select 的跨树 ARIA 与 renderIR 的 aria-* 绑定正在另一会话改造，
 *   本文件对它们的断言只使用公共机制（linkAria），不触碰内部实现。
 * - tabs / tree / theme / rate / input / slider 的源码属于 P1 批次，本文件只做黑盒断言。
 */
import { describe, expect, it } from 'vitest';

import { buildIR } from '../../src/compiler/ir/buildIR';
import { parseHtml } from '../../src/compiler/parser/parser';
import { createRender } from '../../src/runtime/renderer/renderIR';
import { linkAria } from '../../src/shared/aria';
import {
    findUnresolvableAriaRefs,
    getShadowRoot,
    listElementsComponents,
    mount,
    recordAllEvents,
    tick,
} from '../helpers';
import type { ComponentEntry } from '../helpers';

const components = listElementsComponents();

/** 挂载期允许出现的事件：dataChange 是框架数据同步信号，不是业务事件 */
const MOUNT_ALLOWED_EVENTS = new Set(['dataChange']);

/** 需要在跨树 ARIA 用例里显式跳过内部改造的组件（另一会话进行中） */
const CROSS_TREE_ARIA_IN_PROGRESS = new Set(['solely-tooltip', 'solely-select']);

/**
 * 非独立渲染组件（无 open shadowRoot）：
 * - 挂载静默、标量 attribute ↔ property 一致性仍按通用表执行；
 * - 跨树 ARIA 代理不适用：没有 shadow root 可代理，描述关系由父组件建立；
 * - 同树 IDREF 扫描不适用：自身不渲染 aria-* 引用。
 */
const SHADOWLESS_COMPONENTS = new Set(['solely-select-option']);

const shadowHostComponents = components.filter(c => !SHADOWLESS_COMPONENTS.has(c.tagName));
const shadowlessComponents = components.filter(c => SHADOWLESS_COMPONENTS.has(c.tagName));

describe('共性契约矩阵 · 挂载期不派发业务事件（F-1）', () => {
    it.each(components.map(c => [c.tagName, c] as const))('%s 无属性挂载保持静默', async (tagName: string) => {
        const el = document.createElement(tagName);
        const recorder = recordAllEvents(el);

        document.body.appendChild(el);
        await tick(30);

        recorder.stop();
        const unexpected = recorder.types().filter(type => !MOUNT_ALLOWED_EVENTS.has(type));

        expect(unexpected).toEqual([]);
    });
});

/**
 * 集合型 prop：attribute 路径传 JSON 字符串，property 路径可传数组，
 * 两条路径都会规范化为新的数组实例，引用不同无法用 Object.is 比较。
 * 这里只跳过标量矩阵，行为由各自的组件测试按内容断言。
 */
const COLLECTION_PROPS = new Set(['fileList', 'treeData']);

/**
 * 只挑选「标量且框架会镜像」的 prop：
 * - object / array：按设计不镜像 attribute；
 * - value：由组件自行管理 attribute 语义；
 * - reactive: false：不会安装 property 访问器，property 路径不写 $data；
 * - reflect: false：显式关闭镜像，语义不同，直接跳过。
 */
function scalarParityProps(component: ComponentEntry) {
    return component.props.filter(
        p =>
            (p.type === 'string' || p.type === 'number' || p.type === 'boolean') &&
            p.name !== 'value' &&
            !COLLECTION_PROPS.has(p.name) &&
            p.reactive !== false &&
            p.reflect !== false,
    );
}

const parityCases = components.flatMap(component =>
    scalarParityProps(component).map(prop => [`${component.tagName}[${prop.attr}]`, component, prop] as const),
);

describe('共性契约矩阵 · attribute / property 写值一致（F-2）', () => {
    it.each(parityCases)('%s 两种写法得到同值同类型', (_label, component, prop) => {
        const raw = prop.type === 'number' ? 7 : prop.type === 'boolean' ? true : 'alpha';
        const attributeRaw = prop.type === 'boolean' ? 'true' : String(raw);

        const attrEl = mount(component.tagName);
        attrEl.setAttribute(prop.attr, attributeRaw);
        const attrValue = (attrEl as unknown as Record<string, unknown>)[prop.name];

        const propEl = mount(component.tagName);
        (propEl as unknown as Record<string, unknown>)[prop.name] = raw;
        const propValue = (propEl as unknown as Record<string, unknown>)[prop.name];

        expect(propValue).toEqual(attrValue);
        expect(typeof propValue).toBe(typeof attrValue);
    });

    const booleanCases = components.flatMap(component =>
        scalarParityProps(component)
            .filter(prop => prop.type === 'boolean')
            .map(prop => [`${component.tagName}[${prop.attr}]`, component, prop] as const),
    );

    it.each(booleanCases)('%s 写成 "false" / "0" 得到 false，移除后回退默认值', (_label, component, prop) => {
        const expectedDefault = typeof prop.default === 'boolean' ? prop.default : false;

        const el = mount(component.tagName);
        const read = () => (el as unknown as Record<string, unknown>)[prop.name];

        el.setAttribute(prop.attr, 'false');
        expect(read()).toBe(false);

        el.setAttribute(prop.attr, 'FALSE');
        expect(read()).toBe(false);

        el.setAttribute(prop.attr, ' 0 ');
        expect(read()).toBe(false);

        el.setAttribute(prop.attr, '');
        expect(read()).toBe(true);

        el.setAttribute(prop.attr, 'false');
        expect(read()).toBe(false);

        el.removeAttribute(prop.attr);
        expect(read()).toBe(expectedDefault);

        el.setAttribute(prop.attr, 'true');
        expect(read()).toBe(true);
    });
});

/**
 * select-option 是非独立渲染组件：没有 shadow DOM、没有自有模板，
 * 外观与可访问性由父 select 承担。
 * - 挂载静默、label / disabled 的 attribute ↔ property 一致性走上面的通用矩阵；
 * - value 在通用矩阵里被跳过（约定由组件自行管理 attribute 语义），这里专项补回；
 * - 跨树 ARIA / 同树 IDREF 不适用，见下方显式跳过用例。
 */
describe('共性契约矩阵 · solely-select-option 非独立渲染组件专项', () => {
    it('value 的 attribute / property 两条写值路径同值同类型', () => {
        const attrEl = mount('solely-select-option');
        attrEl.setAttribute('value', 'user');
        const attrValue = (attrEl as unknown as Record<string, unknown>).value;

        const propEl = mount('solely-select-option');
        (propEl as unknown as Record<string, unknown>).value = 'user';
        const propValue = (propEl as unknown as Record<string, unknown>).value;

        expect(attrValue).toBe('user');
        expect(propValue).toBe(attrValue);
        expect(typeof propValue).toBe('string');
    });

    it('value / label / disabled 汇总为父 select 可消费的选项数据', () => {
        const el = mount('solely-select-option');
        el.setAttribute('value', 'user');
        el.setAttribute('label', '用户');
        el.setAttribute('disabled', '');

        const data = (
            el as unknown as {
                getOptionData(): { value: string; label: string; disabled: boolean; element: unknown };
            }
        ).getOptionData();

        expect(data.value).toBe('user');
        expect(data.label).toBe('用户');
        expect(data.disabled).toBe(true);
        expect(data.element).toBe(el);
    });

    it('label 缺省时回退到元素文本内容', () => {
        const el = mount('solely-select-option');
        el.setAttribute('value', 'guest');
        el.textContent = '  访客  ';

        const data = (el as unknown as { getOptionData(): { label: string } }).getOptionData();
        expect(data.label).toBe('访客');
    });
});

describe('共性契约矩阵 · data-* / aria-* 置空移除属性', () => {
    const BINDINGS = [
        { attr: 'data-state', prop: 'dataState' },
        { attr: 'data-count', prop: 'dataCount' },
        { attr: 'aria-label', prop: 'ariaLabel' },
        { attr: 'aria-describedby', prop: 'ariaDescribedBy' },
        { attr: 'aria-hidden', prop: 'ariaHidden' },
        { attr: 'aria-live', prop: 'ariaLive' },
    ] as const;

    const template = `
        <div id="probe"
            :data-state="$data.dataState"
            :data-count="$data.dataCount"
            :aria-label="$data.ariaLabel"
            :aria-describedby="$data.ariaDescribedBy"
            :aria-hidden="$data.ariaHidden"
            :aria-live="$data.ariaLive"></div>
    `;

    it.each(BINDINGS.flatMap(b => [null, undefined].map(empty => ({ ...b, empty }))))(
        '$attr 从有值变为 $empty 时移除属性',
        ({ attr, prop, empty }) => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const scope = { $data: { [prop]: 'initial' } as Record<string, unknown> };
            const ir = buildIR(parseHtml(template), { filename: 'contract-matrix.html', source: template });
            const renderer = createRender(ir, container, scope);

            const probe = container.querySelector('#probe') as HTMLElement;
            expect(probe.getAttribute(attr)).toBe('initial');

            scope.$data[prop] = empty;
            renderer.update();

            expect(probe.hasAttribute(attr)).toBe(false);
        },
    );
});

describe('共性契约矩阵 · 跨树 ARIA 代理可解析（F-3）', () => {
    it.each(shadowHostComponents.map(c => [c.tagName, c] as const))(
        '%s 的 shadow root 内被引用节点可代理到 document 树',
        async (tagName: string) => {
            const host = document.createElement(tagName);
            document.body.appendChild(host);
            await tick();

            const shadow = getShadowRoot(host);
            const source = document.createElement('span');
            source.id = `matrix-source-${tagName}`;
            source.textContent = '描述';
            shadow.appendChild(source);

            const link = linkAria(host, 'aria-describedby', source, { role: 'tooltip' });

            expect(link.proxy).not.toBeNull();
            expect(document.getElementById(source.id)).toBe(link.proxy);
            expect(host.getAttribute('aria-describedby')?.split(/\s+/)).toContain(source.id);

            link.release();
            expect(document.getElementById(source.id)).toBeNull();
            expect(host.hasAttribute('aria-describedby')).toBe(false);
        },
    );

    it.skip.each(shadowlessComponents.map(c => [c.tagName] as const))(
        '%s 无 open shadowRoot，跳过跨树 ARIA 代理（由父组件负责）',
        () => {
            // 非独立渲染组件不产生 shadow 树，没有可代理的 shadow 节点；
            // 选项的 aria 关系由持有它的父组件（如 solely-select）统一建立。
        },
    );
});

describe('共性契约矩阵 · 组件自身 aria-* 引用同树可解析', () => {
    const scanTargets = shadowHostComponents.filter(c => !CROSS_TREE_ARIA_IN_PROGRESS.has(c.tagName));

    it.each(scanTargets.map(c => [c.tagName, c] as const))('%s 渲染后的 IDREF 均可解析', async (tagName: string) => {
        const host = document.createElement(tagName);
        document.body.appendChild(host);
        await tick(30);

        const root = host.shadowRoot;
        if (!root) return;

        const failures = findUnresolvableAriaRefs(root).map(({ attr, id, element }) => ({
            attr,
            id,
            element: element.tagName.toLowerCase(),
        }));

        expect(failures).toEqual([]);
    });

    it.skip.each(shadowlessComponents.map(c => [c.tagName] as const))(
        '%s 无 open shadowRoot，跳过同树 IDREF 扫描（自身不渲染 aria 引用）',
        () => {
            // 非独立渲染组件没有自有模板，也不输出 aria-describedby / aria-labelledby 等引用；
            // 其可访问性由父组件的选项渲染逻辑负责。
        },
    );
});
