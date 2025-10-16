import { BaseElement, CustomElement } from '../../src/base';
import template from './counter.html?raw';
import styles from './counter.css?raw';

interface CounterData {
  count: number;
  step: number;
}

@CustomElement({
  tagName: 'solely-counter',
  template,
  styles,
  props: ['count', 'step'],
  className: 'solely-counter',
  shadowDOM: { use: true, mode: 'open' }
})
export default class CounterElement extends BaseElement<CounterData> {
  constructor() {
    super({
      count: 0,
      step: 1
    });
  }

  created() {
    console.log('Counter component created');
  }

  mounted() {
    console.log('Counter component mounted');
  }

  increment() {
    this.$data.count += this.$data.step;
  }

  decrement() {
    this.$data.count -= this.$data.step;
  }

  reset() {
    this.$data.count = 0;
  }

  handleStepChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.$data.step = parseInt(target.value) || 1;
  }
}