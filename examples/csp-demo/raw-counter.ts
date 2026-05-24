import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './raw-counter.html?raw';
import styles from './raw-counter.css?raw';

interface RawCounterData {
    count: number;
}

@CustomElement({
    tagName: 'raw-counter',
    template,
    styles,
    shadowDOM: { use: true },
    props: [{ name: 'count', type: 'number', reflect: true }],
})
export class RawCounter extends BaseElement<RawCounterData> {
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
