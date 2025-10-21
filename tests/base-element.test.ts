import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseElement, CustomElement } from '../src/base';

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
    { name: 'init-count', type: 'number' },
    { name: 'debug', type: 'boolean' },
    { name: 'config', type: 'object' },
    'title'
  ],
  styles: ':host { display:block; }',
  shadowDOM: { use: true, mode: 'open' }
})
class TestEl extends BaseElement<TestData> {
  constructor() {
    super({ initCount: 0, debug: false, config: { a: 1 }, title: 'hello' });
  }
}

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
      shadowDOM: { use: true }
    })
    class TestCreatedEl extends BaseElement<TestData> {
      created() { spyCreated(); }
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
    const style = el.shadowRoot?.querySelector('style[data-manifest-style]');
    const classes = el.classList;

    expect(classes.contains('test-el-attrs')).toBe(true); // tagName 自动作为 className
    expect(style).not.toBeNull(); // 样式是否注入
    expect(style?.textContent).toContain(':host'); // 样式内容
  });

  it('should call mounted on first refresh and updated on subsequent refresh', async () => {
    // 验证首次刷新触发 mounted，后续刷新触发 updated
    const spyMounted = vi.spyOn(el, 'mounted');
    const spyUpdated = vi.spyOn(el, 'updated');

    // 强制首次刷新，确保 runInAsyncQueue 被调度
    el.refresh();
    await new Promise(r => setTimeout(r, 16)); // 等待宏任务执行 patch

    expect(spyMounted).toHaveBeenCalled();

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
