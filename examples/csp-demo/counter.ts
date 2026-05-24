import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './counter.html?solely';
import styles from './counter.css?raw';

interface CounterData {
    count: number;
}

@CustomElement({
    tagName: 'csp-counter',
    template,
    styles,
    shadowDOM: { use: true },
    props: [{ name: 'count', type: 'number', reflect: true }],
})
export class CspCounter extends BaseElement<CounterData> {
    constructor() {
        super({ count: 0 });
    }

    increment() {
        this.$data.count++;
    }

    decrement() {
        if (this.$data.count > 0) {
            this.$data.count--;
        }
    }
}
