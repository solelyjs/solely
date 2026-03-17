import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

/**
 * 计数器组件接口定义
 */
interface CounterData {
  count: number;
  step: number;
  history: Array<{
    type: 'increment' | 'decrement' | 'random';
    value: number;
    timestamp: number;
  }>;
}

/**
 * 计数器组件
 * 演示 Solely 框架的基础功能：
 * - 文本插值 {{ $data.xxx }}
 * - 属性绑定 s-disabled、s-model
 * - 事件处理 onclick
 * - 条件渲染 <If>
 */
@CustomElement({
  tagName: 'simple-counter',
  template,
  styles,
  shadowDOM: { use: true },
  props: [
    { name: 'count', type: 'number' },
    { name: 'step', type: 'number' },
  ]
})
export class SimpleCounter extends BaseElement<CounterData> {
  constructor() {
    super({
      count: 0,
      step: 1,
      history: []
    });
  }

  /**
   * 增加计数
   */
  increment() {
    this.$data.count += +this.$data.step;
    this.$data.history.push({
      type: 'increment',
      value: this.$data.count,
      timestamp: Date.now()
    });
  }

  /**
   * 减少计数
   */
  decrement() {
    if (this.$data.count > 0) {
      this.$data.count -= +this.$data.step;
      if (this.$data.count < 0) this.$data.count = 0;

      this.$data.history.push({
        type: 'decrement',
        value: this.$data.count,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 重置计数
   */
  reset() {
    this.$data.count = 0;
    this.$data.history = [];
  }

  /**
   * 设置随机值
   */
  random() {
    this.$data.count = Math.floor(Math.random() * 100) + 1;
    this.$data.history.push({
      type: 'random',
      value: this.$data.count,
      timestamp: Date.now()
    });
  }

  /**
   * 元素挂载时调用
   */
  onOptionMounted(label: HTMLLabelElement) {
    console.log('Label mounted:', label);
  }

  /**
   * 元素更新时调用
   */
  onOptionUpdated(label: HTMLLabelElement) {
    console.log('Label updated:', label);
  }
}

console.log('SimpleCounter component registered!');
