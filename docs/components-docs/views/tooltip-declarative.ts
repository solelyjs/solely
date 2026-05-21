/**
 * 声明式 Tooltip 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './tooltip-declarative.html?raw';

interface TooltipDeclarativeDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-tooltip-declarative',
    template,
})
export class DocsTooltipDeclarative extends BaseElement<TooltipDeclarativeDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
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

    /**
     * 显示手动控制的 Tooltip
     */
    handleShowManual(): void {
        const tooltip = this.querySelector('#manual-tooltip-demo') as unknown as { show: () => void };
        if (tooltip && typeof tooltip.show === 'function') {
            tooltip.show();
            this.addEventLog('手动调用 show() - Tooltip 已显示');
        }
    }

    /**
     * 隐藏手动控制的 Tooltip
     */
    handleHideManual(): void {
        const tooltip = this.querySelector('#manual-tooltip-demo') as unknown as { hide: () => void };
        if (tooltip && typeof tooltip.hide === 'function') {
            tooltip.hide();
            this.addEventLog('手动调用 hide() - Tooltip 已隐藏');
        }
    }
}

export default DocsTooltipDeclarative;
