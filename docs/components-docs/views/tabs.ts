/**
 * Tabs 标签页组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './tabs.html?raw';

interface TabsDocData {
    eventLogs: string[];
    lineItems: string;
    cardItems: string;
    sizeItems: string;
    closableItems: string;
}

@CustomElement({
    tagName: 'docs-tabs',
    template,
})
export class DocsTabs extends BaseElement<TabsDocData> {
    constructor() {
        super({
            eventLogs: [],
            lineItems: JSON.stringify([
                { key: '1', label: 'Tab 1' },
                { key: '2', label: 'Tab 2' },
                { key: '3', label: 'Tab 3' },
            ]),
            cardItems: JSON.stringify([
                { key: '1', label: '用户管理' },
                { key: '2', label: '系统配置' },
                { key: '3', label: '权限设置' },
            ]),
            sizeItems: JSON.stringify([
                { key: '1', label: '小尺寸' },
                { key: '2', label: '默认尺寸' },
                { key: '3', label: '大尺寸' },
            ]),
            closableItems: JSON.stringify([
                { key: '1', label: '标签 1' },
                { key: '2', label: '标签 2' },
                { key: '3', label: '标签 3' },
            ]),
        });
    }

    /**
     * 处理 change 事件
     */
    handleChange(event: Event): void {
        const target = event.target as unknown as { activeKey: string };
        const key = target?.activeKey ?? '';
        this.addEventLog(`change: activeKey = "${key}"`);
    }

    /**
     * 处理 close 事件
     */
    handleClose(event: CustomEvent<{ key: string; label: string }>): void {
        const detail = event.detail;
        this.addEventLog(`close: key = "${detail.key}", label = "${detail.label}"`);
    }

    /**
     * 处理 add 事件
     */
    handleAdd(): void {
        this.addEventLog('add: 新增标签');
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

export default DocsTabs;
