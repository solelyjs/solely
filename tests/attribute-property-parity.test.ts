import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BaseElement from '../src/runtime/component/base-element';
import { CustomElement } from '../src/runtime/component/decorators';

type ProbeData = Record<string, unknown>;

/**
 * F-2 框架级契约测试：
 * - attribute → property 与 property → attribute 两条写值路径对称
 * - property 写入按 manifest 声明类型规整
 * - 镜像不产生 property ↔ attribute 回环
 * - 不镜像清单（value / object / array / reflect:false / null / 默认值）保持不变
 */
@CustomElement({
    tagName: 'test-attr-mirror',
    template: '<div>{{ $data.label }}</div>',
    props: [
        { name: 'label', type: 'string', default: '' },
        { name: 'name', type: 'string', default: '' },
        { name: 'count', type: 'number', default: 0 },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'value', type: 'string', default: '' },
        { name: 'items', type: 'array', default: [] },
        { name: 'config', type: 'object', default: {} },
        { name: 'optOut', type: 'string', default: '', reflect: false },
        { name: 'customSetter', type: 'string', default: '' },
    ],
    shadowDOM: { use: true },
})
class AttrMirrorProbe extends BaseElement<ProbeData> {
    attributeChangedCalls = 0;

    // manifest 声明的 prop 在运行时由框架安装访问器，这里仅用于类型检查
    declare label: string | number | boolean | null;
    declare name: string;
    declare count: number | string;
    declare disabled: boolean | string;
    declare value: string;
    declare items: unknown[];
    declare config: Record<string, unknown>;
    declare optOut: string;

    attributeChanged(): void {
        this.attributeChangedCalls++;
    }

    get customSetter(): string {
        return this.$data.customSetter as string;
    }

    set customSetter(value: string) {
        this.$data.customSetter = value;
    }
}

function mount(): AttrMirrorProbe {
    const el = document.createElement('test-attr-mirror') as AttrMirrorProbe;
    document.body.appendChild(el);
    return el;
}

/** 布尔解析专项探针：一个默认 true、一个默认 false */
@CustomElement({
    tagName: 'test-bool-attr-probe',
    template: '<div></div>',
    props: [
        { name: 'showInfo', type: 'boolean', default: true },
        { name: 'disabled', type: 'boolean', default: false },
    ],
    shadowDOM: { use: true },
})
class BooleanAttrProbe extends BaseElement<ProbeData> {
    declare showInfo: boolean;
    declare disabled: boolean;
}

describe('attribute / property 写值路径对称（F-2）', () => {
    let el: AttrMirrorProbe;

    beforeEach(() => {
        el = mount();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('property 写入会镜像 attribute，attribute 选择器可命中', () => {
        el.name = 'group-a';

        expect(el.hasAttribute('name')).toBe(true);
        expect(el.getAttribute('name')).toBe('group-a');
        expect(document.querySelectorAll('[name="group-a"]')).toContain(el);
    });

    it('挂载前用 property 赋的值在挂载后同样镜像 attribute', () => {
        const pre = document.createElement('test-attr-mirror') as AttrMirrorProbe;
        pre.name = 'pre-mount';
        document.body.appendChild(pre);

        expect(pre.getAttribute('name')).toBe('pre-mount');
        expect(pre.$data.name).toBe('pre-mount');
    });

    it('number 类型：property 写入与 attribute 写入得到同值同类型', () => {
        // attribute 写入
        el.setAttribute('count', '4');
        expect(typeof el.count).toBe('number');
        expect(el.count).toBe(4);

        // property 写入
        el.count = '42';
        expect(typeof el.count).toBe('number');
        expect(el.count).toBe(42);
        expect(el.getAttribute('count')).toBe('42');
    });

    it('boolean 类型：字符串语义按 HTML 规则规整', () => {
        el.disabled = 'false';
        expect(el.disabled).toBe(false);
        expect(el.hasAttribute('disabled')).toBe(false);

        el.disabled = 'true';
        expect(el.disabled).toBe(true);
        expect(el.hasAttribute('disabled')).toBe(true);
        expect(el.getAttribute('disabled')).toBe('');

        el.disabled = '0';
        expect(el.disabled).toBe(false);
        expect(el.hasAttribute('disabled')).toBe(false);

        el.disabled = false;
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('boolean 类型：property 与 attribute 对空字符串都按 HTML 语义视为 true', () => {
        el.disabled = '';
        expect(el.disabled).toBe(true);
        expect(el.getAttribute('disabled')).toBe('');

        el.removeAttribute('disabled');
        el.setAttribute('disabled', '');
        expect(el.disabled).toBe(true);
        expect(el.$data.disabled).toBe(true);
    });

    it('string 类型：number / boolean 写入规整为字符串', () => {
        el.label = 42 as unknown as string;
        expect(el.label).toBe('42');
        expect(el.getAttribute('label')).toBe('42');

        el.label = true as unknown as string;
        expect(el.label).toBe('true');
        expect(el.getAttribute('label')).toBe('true');
    });

    it('attribute → property 仍按类型转换（两条路径结果一致）', () => {
        el.setAttribute('count', '7');
        el.setAttribute('disabled', '');
        el.setAttribute('label', 'primary');

        expect(typeof el.count).toBe('number');
        expect(el.count).toBe(7);
        expect(el.disabled).toBe(true);
        expect(typeof el.label).toBe('string');
        expect(el.label).toBe('primary');
    });

    it('property 写入经自定义 setter 后也会镜像 attribute', () => {
        el.customSetter = 'via-setter';

        expect(el.$data.customSetter).toBe('via-setter');
        expect(el.getAttribute('custom-setter')).toBe('via-setter');
    });

    it('镜像不触发 attributeChanged 钩子，attribute 写入只触发一次（无回环）', () => {
        el.attributeChangedCalls = 0;
        el.name = 'no-loop';
        expect(el.attributeChangedCalls).toBe(0);
        expect(el.getAttribute('name')).toBe('no-loop');

        el.setAttribute('name', 'from-attribute');
        expect(el.attributeChangedCalls).toBe(1);
        expect(el.$data.name).toBe('from-attribute');
    });

    it('镜像不会重复派发 dataChange', () => {
        const spy = vi.fn();
        el.addEventListener('dataChange', spy);

        el.name = 'once';

        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('布尔属性声明式关闭（attribute 路径）', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('默认 true 的属性：不写 → true，="false" → false，移除 → 回默认 true', () => {
        const el = document.createElement('test-bool-attr-probe') as BooleanAttrProbe;
        document.body.appendChild(el);

        expect(el.hasAttribute('show-info')).toBe(true);
        expect(el.showInfo).toBe(true);

        el.setAttribute('show-info', 'false');
        expect(el.showInfo).toBe(false);

        el.removeAttribute('show-info');
        expect(el.showInfo).toBe(true);

        el.setAttribute('show-info', '');
        expect(el.showInfo).toBe(true);

        el.setAttribute('show-info', '0');
        expect(el.showInfo).toBe(false);

        el.setAttribute('show-info', 'FALSE');
        expect(el.showInfo).toBe(false);
    });

    it('默认 false 的属性：="false" 不会误开，="true" 才会开', () => {
        const el = document.createElement('test-bool-attr-probe') as BooleanAttrProbe;
        document.body.appendChild(el);

        expect(el.disabled).toBe(false);

        el.setAttribute('disabled', 'false');
        expect(el.disabled).toBe(false);

        el.setAttribute('disabled', 'true');
        expect(el.disabled).toBe(true);

        el.removeAttribute('disabled');
        expect(el.disabled).toBe(false);
    });

    it('property 路径与 attribute 路径结果一致，且 false 会移除镜像 attribute', () => {
        const el = document.createElement('test-bool-attr-probe') as BooleanAttrProbe;
        document.body.appendChild(el);

        el.showInfo = false;
        expect(el.showInfo).toBe(false);
        expect(el.hasAttribute('show-info')).toBe(false);

        el.showInfo = 'false' as unknown as boolean;
        expect(el.showInfo).toBe(false);

        el.showInfo = true;
        expect(el.showInfo).toBe(true);
        expect(el.getAttribute('show-info')).toBe('');
    });
});

describe('不镜像清单', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('挂载默认值不写 attribute（避免空 attribute 污染 DOM）', () => {
        const el = mount();

        expect(el.hasAttribute('label')).toBe(false);
        expect(el.hasAttribute('count')).toBe(false);
        expect(el.hasAttribute('disabled')).toBe(false);
        expect(el.hasAttribute('name')).toBe(false);
        expect(el.hasAttribute('value')).toBe(false);
    });

    it('value 由组件自行管理，property 写入不镜像', () => {
        const el = mount();

        el.value = 'typed';
        expect(el.$data.value).toBe('typed');
        expect(el.hasAttribute('value')).toBe(false);
    });

    it('object / array 类型不镜像 attribute', () => {
        const el = mount();

        el.items = [1, 2, 3];
        el.config = { a: 1 };

        expect(el.$data.items).toEqual([1, 2, 3]);
        expect(el.hasAttribute('items')).toBe(false);
        expect(el.hasAttribute('config')).toBe(false);

        // attribute 路径仍可用（JSON）
        el.setAttribute('items', '[3,4]');
        expect(el.$data.items).toEqual([3, 4]);
    });

    it('reflect: false 的 prop 不镜像', () => {
        const el = mount();

        el.optOut = 'set-by-property';

        expect(el.$data.optOut).toBe('set-by-property');
        expect(el.hasAttribute('opt-out')).toBe(false);
    });

    it('null / undefined 清空 property 时移除镜像 attribute，保持 DOM 与状态一致（U-08）', () => {
        const el = mount();
        el.setAttribute('label', 'user-written');

        el.label = null as unknown as string;

        expect(el.$data.label).toBeNull();
        expect(el.hasAttribute('label')).toBe(false);
    });
});

/** F-10 探针：无 default 的非布尔 prop / 有 default 的 prop / 默认 true 的布尔 prop */
@CustomElement({
    tagName: 'test-f10-probe',
    template: '<div></div>',
    props: [
        { name: 'loose', type: 'number' },
        { name: 'bounded', type: 'number', default: 7 },
        { name: 'flag', type: 'boolean', default: true },
    ],
})
class F10Probe extends BaseElement<Record<string, unknown>> {
    looseSnapshots: unknown[] = [];

    attributeChanged(): void {
        this.looseSnapshots.push(this.$data.loose);
    }
}

describe('F-10 属性移除语义', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('无 default 的非布尔 prop：移除后回落 undefined，并触发 attributeChanged', () => {
        const el = document.createElement('test-f10-probe') as F10Probe;
        document.body.appendChild(el);

        el.setAttribute('loose', '5');
        expect(el.$data.loose).toBe(5);
        const before = el.looseSnapshots.length;

        el.removeAttribute('loose');
        expect(el.$data.loose).toBeUndefined();
        expect(el.hasAttribute('loose')).toBe(false);
        expect(el.looseSnapshots.length).toBe(before + 1);
        expect(el.looseSnapshots[el.looseSnapshots.length - 1]).toBeUndefined();
    });

    it('有 default 的回落默认值；布尔仍回退 default；非法值保留旧值不清空', () => {
        const el = document.createElement('test-f10-probe') as F10Probe;
        document.body.appendChild(el);

        el.setAttribute('bounded', '9');
        el.removeAttribute('bounded');
        expect(el.$data.bounded).toBe(7);

        el.setAttribute('flag', 'false');
        el.removeAttribute('flag');
        expect(el.$data.flag).toBe(true);

        el.setAttribute('loose', '3');
        el.setAttribute('loose', 'abc');
        expect(el.$data.loose).toBe(3);
    });
});
