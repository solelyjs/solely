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

    /** 0.8.0 新增特性样例：range 值 / 提示格式 / 刻度只支持 JS property 赋值 */
    mounted(): void {
        const range = this.$refs.featureRangeSlider as unknown as { value: [number, number] } | undefined;
        if (range) range.value = [20, 70];

        const fmt = this.$refs.featureFmtSlider as unknown as
            | { tooltipFormatter?: (value: number) => string }
            | undefined;
        if (fmt) fmt.tooltipFormatter = value => `${value}%`;

        const marks = this.$refs.featureMarksSlider as unknown as
            | (HTMLElement & { marksData?: Record<string, unknown> })
            | undefined;
        if (marks) {
            marks.setAttribute('marks', '');
            marks.marksData = {
                0: '0℃',
                50: { label: '中点', style: 'color:#dc2626;font-weight:600' },
                100: '100℃',
            };
        }
    }
}

export default DocsSlider;
