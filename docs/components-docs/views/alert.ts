/**
 * Alert 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Message } from '../../../src/components/commands/message';
import template from './alert.html?raw';

interface AlertDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-alert',
    template,
})
export class DocsAlert extends BaseElement<AlertDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    mounted(): void {
        // 为事件示例添加监听器
        const alertDemo = this.querySelector('#alert-event-demo');
        if (alertDemo) {
            alertDemo.addEventListener('close', () => {
                // eslint-disable-next-line no-console
                console.log('Alert closed');
                Message.success('Alert closed!');
            });
        }
    }

    /**
     * 处理 alert close 事件
     */
    handleAlertClose(_event: Event): void {
        this.addEventLog('close: Alert 已关闭');
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

export default DocsAlert;
