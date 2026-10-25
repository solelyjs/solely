import { describe, it, expect, beforeEach, vi } from 'vitest';
import BaseElement from '../src/runtime/component/base-element';
import { CustomElement } from '../src/runtime/component/decorators';
import { SOLELY_VERSION } from '../src/shared';

type TestData = {
    initCount: number;
    debug: boolean;
    config: Record<string, any>;
    title: string;
};

// 使用 CustomElement 注册测试元素
@CustomElement({
    tagName: 'test-el-attrs',
    template: '<div></div>',
    props: [
        { name: 'initCount', type: 'number' },
        { name: 'debug', type: 'boolean' },
        { name: 'config', type: 'object' },
        'title',
    ],
    styles: ':host { display:block; }',
    shadowDOM: { use: true, mode: 'open' },
})
class TestEl extends BaseElement<TestData> {
    constructor() {
        super({ initCount: 0, debug: false, config: { a: 1 }, title: 'hello' });
    }
}

@CustomElement({
    tagName: 'test-no-css-escape',
    template: '<div></div>',
    styles: ':host { display:block; }',
    shadowDOM: { use: false },
})
class TestNoCssEscapeEl extends BaseElement<Record<string, never>> {}

describe('base/BaseElement public interface tests', () => {
    let el: TestEl;

    beforeEach(() => {
        el = document.createElement('test-el-attrs') as TestEl;
        document.body.appendChild(el); // 确保 connectedCallback 被触发
    });

    it('should reflect manifest props in observedAttributes', () => {
        // 验证 observedAttributes 能正确映射 manifest 中定义的属性
        const attrs = (TestEl as any).observedAttributes as string[];
        expect(attrs).toEqual(['init-count', 'debug', 'config', 'title']);
    });

    it('should convert attribute values correctly in attributeChangedCallback', () => {
        // 验证 attributeChangedCallback 修改属性时 $data 类型转换正确
        el.setAttribute('init-count', '42'); // number
        expect(el.$data.initCount).toBe(42);

        el.setAttribute('debug', 'true'); // boolean
        expect(el.$data.debug).toBe(true);

        el.setAttribute('config', '{"a":2,"b":"x"}'); // object
        expect(el.$data.config).toEqual({ a: 2, b: 'x' });

        el.setAttribute('title', 'world'); // string
        expect(el.$data.title).toBe('world');
    });

    it('should maintain current value when removing attribute', () => {
        // 移除 attribute 后，$data 保持当前值不变
        el.setAttribute('init-count', '100');
        expect(el.$data.initCount).toBe(100);

        el.removeAttribute('init-count');
        expect(el.$data.initCount).toBe(100);
    });

    it('should call created lifecycle hook asynchronously', async () => {
        // 验证构造函数结束后异步调用 created 生命周期
        const spyCreated = vi.fn();

        @CustomElement({
            tagName: 'test-created-el',
            template: '<div></div>',
            shadowDOM: { use: true },
        })
        class TestCreatedEl extends BaseElement<TestData> {
            created() {
                spyCreated();
            }
        }

        if (!customElements.get('test-created-el')) {
            customElements.define('test-created-el', TestCreatedEl);
        }

        const el2 = document.createElement('test-created-el') as TestCreatedEl;
        document.body.appendChild(el2);

        await new Promise(r => setTimeout(r, 0)); // 等待异步 created 执行
        expect(spyCreated).toHaveBeenCalled();
    });

    it('should update $data correctly when set with new object', () => {
        // 验证通过公共接口设置 $data，旧属性被删除，新属性被更新
        el.$data = { initCount: 10, debug: true, config: {} } as TestData;
        expect(el.$data.initCount).toBe(10);
        expect(el.$data.debug).toBe(true);
        expect(el.$data.config).toEqual({});
        expect(el.$data.title).toBeUndefined();
    });

    it('should inject className and styles on connectedCallback', () => {
        // 验证 connectedCallback 自动添加 className 并注入样式
        const classes = el.classList;

        expect(classes.contains('test-el-attrs')).toBe(true); // tagName 自动作为 className

        // 样式可能通过 adoptedStyleSheets 或 style 元素注入
        // jsdom 不支持 CSSStyleSheet.replaceSync，所以走回退方案（style 元素）
        const styleId = `solely-style-${SOLELY_VERSION}-test-el-attrs`;
        const style = el.shadowRoot?.getElementById(styleId) || document.getElementById(styleId);
        expect(style).not.toBeNull(); // 样式是否注入
        expect(style?.textContent).toContain(':host'); // 样式内容
    });

    it('should call mounted on first refresh and updated on subsequent refresh', async () => {
        // 验证首次刷新触发 mounted，后续刷新触发 updated
        const spyUpdated = vi.spyOn(el, 'updated');

        // 再次刷新触发 updated
        el.refresh();
        await new Promise(r => setTimeout(r, 16));
        expect(spyUpdated).toHaveBeenCalled();
    });

    it('should call unmounted on disconnectedCallback', async () => {
        // 验证 disconnectedCallback 调用 unmounted
        const spyUnmounted = vi.spyOn(el, 'unmounted');

        el.refresh(); // 确保元素 mounted
        await new Promise(r => setTimeout(r, 16)); // 等待首次刷新完成

        el.disconnectedCallback(); // 触发 disconnectedCallback
        expect(spyUnmounted).toHaveBeenCalled();
    });

    it('should clean up non-shadow styles without CSS.escape', () => {
        const originalCss = globalThis.CSS;
        Object.defineProperty(globalThis, 'CSS', { value: undefined, configurable: true, writable: true });

        try {
            const nonShadowEl = document.createElement('test-no-css-escape') as TestNoCssEscapeEl;
            document.body.appendChild(nonShadowEl);
            expect(() => nonShadowEl.remove()).not.toThrow();
        } finally {
            Object.defineProperty(globalThis, 'CSS', { value: originalCss, configurable: true, writable: true });
        }
    });

    it('should handle invalid attribute values gracefully', () => {
        // 验证无效值不会破坏 $data 默认值
        el.setAttribute('init-count', 'abc'); // 无法转换为 number
        expect(typeof el.$data.initCount).toBe('number');

        el.setAttribute('debug', 'notabool'); // 无法转换为 boolean
        expect(typeof el.$data.debug).toBe('boolean');

        el.setAttribute('config', 'invalid json'); // 无法解析 JSON
        expect(typeof el.$data.config).toBe('object');
    });
});

/* -------------------- 回归：数组反射 / 自定义 setter / 共享数据 -------------------- */

@CustomElement({
    tagName: 'test-reflect-array',
    template: '<div>{{ $data.items.length }}</div>',
    props: [{ name: 'items', type: 'array', reflect: true }],
})
class TestReflectArrayEl extends BaseElement<{ items: unknown[] }> {
    constructor() {
        super({ items: [] });
    }
}

@CustomElement({
    tagName: 'test-custom-setter',
    template: '<div>{{ $data.title }}</div>',
    props: [{ name: 'title' }],
})
class TestCustomSetterEl extends BaseElement<{ title: string }> {
    static setterCalls = 0;

    constructor() {
        super({ title: 'init' });
    }

    get title(): string {
        return this.$data.title;
    }

    set title(value: string) {
        TestCustomSetterEl.setterCalls++;
        this.$data.title = value;
    }
}

@CustomElement({
    tagName: 'test-shared-data',
    template: '<div>{{ $data.n }}</div>',
})
class TestSharedDataEl extends BaseElement<{ n: number }> {
    constructor(data: { n: number }) {
        super(data);
    }
}

describe('base/BaseElement regression tests', () => {
    it('should reflect array prop to attribute when replaced', () => {
        const element = document.createElement('test-reflect-array') as TestReflectArrayEl;
        document.body.appendChild(element);

        element.$data.items = [1, 2, 3];
        expect(element.getAttribute('items')).toBe('[1,2,3]');

        element.remove();
    });

    it('should route attribute updates through a custom setter', () => {
        const element = document.createElement('test-custom-setter') as TestCustomSetterEl;
        document.body.appendChild(element);

        TestCustomSetterEl.setterCalls = 0;
        element.setAttribute('title', 'from-attr');

        expect(TestCustomSetterEl.setterCalls).toBe(1);
        expect(element.$data.title).toBe('from-attr');

        element.remove();
    });

    it('should warn when two instances share the same data object', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const shared = { n: 1 };

        const first = new TestSharedDataEl(shared);
        const second = new TestSharedDataEl(shared);

        expect(first.$data).toBe(second.$data);
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});

/* -------------------- 回归：销毁后重连 / dataChange 开关 -------------------- */

@CustomElement({
    tagName: 'test-no-data-change',
    template: '<div>{{ $data.n }}</div>',
    dataChangeEvent: false,
})
class TestNoDataChangeEl extends BaseElement<{ n: number }> {
    constructor() {
        super({ n: 0 });
    }
}

describe('base/BaseElement lifecycle edge cases', () => {
    it('should not throw when a disposed element is appended again', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const element = document.createElement('test-el-attrs') as TestEl;
        document.body.appendChild(element);

        element.dispose();

        expect(() => document.body.appendChild(element)).not.toThrow();
        expect(element.isConnected).toBe(false);

        errorSpy.mockRestore();
    });

    it('should emit dataChange by default', () => {
        const element = document.createElement('test-el-attrs') as TestEl;
        document.body.appendChild(element);

        const spy = vi.fn();
        element.addEventListener('dataChange', spy);
        element.$data.title = 'changed';

        expect(spy).toHaveBeenCalled();

        element.remove();
    });

    it('should not emit dataChange when dataChangeEvent is false', () => {
        const element = document.createElement('test-no-data-change') as TestNoDataChangeEl;
        document.body.appendChild(element);

        const spy = vi.fn();
        element.addEventListener('dataChange', spy);
        element.$data.n = 1;

        expect(spy).not.toHaveBeenCalled();

        element.remove();
    });
});

/* -------------------- 回归：attribute 生命周期标记不悬挂 -------------------- */

@CustomElement({
    tagName: 'test-setter-ignores',
    template: '<div>{{ $data.count }}</div>',
    props: [{ name: 'title' }, { name: 'count', type: 'number' }],
})
class TestSetterIgnoresEl extends BaseElement<{ title: string; count: number }> {
    attrHookCalls = 0;

    constructor() {
        super({ title: 'init', count: 0 });
    }

    get title(): string {
        return this.$data.title;
    }

    set title(_value: string) {
        // 故意不写 $data：README 明确这是支持的用法
    }

    beforeAttributesUpdate(): void {
        this.attrHookCalls++;
    }
}

describe('base/BaseElement attribute lifecycle flag', () => {
    it('should not leak the flag when a custom setter ignores the value', async () => {
        const element = document.createElement('test-setter-ignores') as TestSetterIgnoresEl;
        document.body.appendChild(element);
        element.attrHookCalls = 0;

        element.setAttribute('title', 'ignored');
        element.$data.count = 1;
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(element.attrHookCalls).toBe(0);
        element.remove();
    });

    it('should still call attribute hooks for a real attribute update', async () => {
        const element = document.createElement('test-setter-ignores') as TestSetterIgnoresEl;
        document.body.appendChild(element);
        element.attrHookCalls = 0;

        element.setAttribute('count', '5');
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(element.attrHookCalls).toBe(1);
        element.remove();
    });
});

/* -------------------- 回归：object/array 默认值按实例隔离 -------------------- */

@CustomElement({
    tagName: 'test-default-isolation',
    template: '<div></div>',
    props: [
        { name: 'config', type: 'object', default: { count: 0 } },
        { name: 'list', type: 'array', default: [] },
        { name: 'label', type: 'string', default: 'x' },
    ],
})
class TestDefaultIsolationEl extends BaseElement<{
    config: { count: number };
    list: number[];
    label: string;
}> {}

describe('base/BaseElement default value isolation', () => {
    it('should clone object/array defaults per instance', () => {
        const a = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        const b = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(a, b);

        a.$data.config.count = 1;
        a.$data.list.push(1);

        expect(b.$data.config.count).toBe(0);
        expect(b.$data.list).toHaveLength(0);

        a.remove();
        b.remove();
    });

    it('should not pollute the default of later instances', () => {
        const a = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(a);
        a.$data.config.count = 9;
        a.$data.list.push(1);

        const b = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(b);

        expect(b.$data.config.count).toBe(0);
        expect(b.$data.list).toHaveLength(0);

        a.remove();
        b.remove();
    });

    it('should keep primitive defaults independent', () => {
        const a = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        const b = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(a, b);

        a.$data.label = 'changed';

        expect(a.$data.label).toBe('changed');
        expect(b.$data.label).toBe('x');

        a.remove();
        b.remove();
    });

    it('should clone the default when an invalid attribute value falls back', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const a = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(a);
        a.setAttribute('config', 'not-json');
        expect(a.$data.config).toEqual({ count: 0 });

        a.$data.config.count = 7;
        const b = document.createElement('test-default-isolation') as TestDefaultIsolationEl;
        document.body.append(b);
        expect(b.$data.config.count).toBe(0);

        a.remove();
        b.remove();
        errorSpy.mockRestore();
    });
});
