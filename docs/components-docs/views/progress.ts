/**
 * Progress 进度条组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './progress.html?raw';

interface ProgressDocData {
    percent: number;
    circlePercent: number;
}

@CustomElement({
    tagName: 'docs-progress',
    template,
})
export class DocsProgress extends BaseElement<ProgressDocData> {
    constructor() {
        super({
            percent: 50,
            circlePercent: 75,
        });
    }

    /**
     * 增加进度
     */
    increase(): void {
        this.$data.percent = Math.min(100, this.$data.percent + 10);
        const progress = this.$refs.progress as HTMLElement;
        if (progress) {
            progress.setAttribute('percent', this.$data.percent.toString());
        }
    }

    /**
     * 减少进度
     */
    decrease(): void {
        this.$data.percent = Math.max(0, this.$data.percent - 10);
        const progress = this.$refs.progress as HTMLElement;
        if (progress) {
            progress.setAttribute('percent', this.$data.percent.toString());
        }
    }

    /**
     * 增加圆形进度
     */
    increaseCircle(): void {
        this.$data.circlePercent = Math.min(100, this.$data.circlePercent + 10);
        const progress = this.$refs.circleProgress as HTMLElement;
        if (progress) {
            progress.setAttribute('percent', this.$data.circlePercent.toString());
        }
    }

    /**
     * 减少圆形进度
     */
    decreaseCircle(): void {
        this.$data.circlePercent = Math.max(0, this.$data.circlePercent - 10);
        const progress = this.$refs.circleProgress as HTMLElement;
        if (progress) {
            progress.setAttribute('percent', this.$data.circlePercent.toString());
        }
    }
}

export default DocsProgress;
