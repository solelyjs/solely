/**
 * Slider 滑块组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './slider.html?raw';

interface SliderDocData {
    sliderValue: number;
    rangeValue: number;
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-slider',
    template,
})
export class DocsSlider extends BaseElement<SliderDocData> {
    constructor() {
        super({
            sliderValue: 30,
            rangeValue: 50,
            eventLogs: [],
        });
    }

    /**
     * 处理滑块 change 事件
     */
    handleSliderChange(event: Event): void {
        const target = event.target as HTMLElement & { value: number };
        const value = target?.value ?? this.$data.rangeValue;
        this.addEventLog(`change: ${value}`);
    }

    /**
     * 处理范围滑块 input 事件
     */
    handleRangeInput(event: Event): void {
        const target = event.target as HTMLElement & { value: number };
        const value = target?.value ?? this.$data.rangeValue;
        this.$data.rangeValue = value;
    }

    /**
     * 添加事件日志
     */
    addEventLog(message: string): void {
        const logs = this.$data.eventLogs || [];
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.length > 5) logs.pop();
        this.$data.eventLogs = logs;
        if (this.$refs.eventLog) {
            this.$refs.eventLog.textContent = logs.join('\n');
        }
    }
}

export default DocsSlider;
