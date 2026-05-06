/**
 * Badge 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './badge.html?raw';

interface BadgeDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-badge',
    template,
})
export class DocsBadge extends BaseElement<BadgeDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 获取徽章元素
     */
    private getBadgeEl():
        | (unknown & {
              increase: () => void;
              decrease: () => void;
              showDot: () => void;
              hideDot: () => void;
          })
        | null {
        const el = this.querySelector('#badge-method-demo');
        return el as unknown as {
            increase: () => void;
            decrease: () => void;
            showDot: () => void;
            hideDot: () => void;
        } | null;
    }

    /**
     * 增加数字
     */
    handleBadgeIncrease(): void {
        const badge = this.getBadgeEl();
        if (badge && typeof badge.increase === 'function') {
            badge.increase();
            this.addEventLog('increase: 数字 +1');
        }
    }

    /**
     * 减少数字
     */
    handleBadgeDecrease(): void {
        const badge = this.getBadgeEl();
        if (badge && typeof badge.decrease === 'function') {
            badge.decrease();
            this.addEventLog('decrease: 数字 -1');
        }
    }

    /**
     * 显示红点
     */
    handleBadgeShowDot(): void {
        const badge = this.getBadgeEl();
        if (badge && typeof badge.showDot === 'function') {
            badge.showDot();
            this.addEventLog('showDot: 显示小红点');
        }
    }

    /**
     * 隐藏红点
     */
    handleBadgeHideDot(): void {
        const badge = this.getBadgeEl();
        if (badge && typeof badge.hideDot === 'function') {
            badge.hideDot();
            this.addEventLog('hideDot: 隐藏小红点');
        }
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

export default DocsBadge;
