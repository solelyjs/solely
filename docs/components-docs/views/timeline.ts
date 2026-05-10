/**
 * Timeline 时间轴组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './timeline.html?raw';

interface TimelineItem {
    title: string;
    content?: string;
    time?: string;
    color?: string;
    icon?: string;
    loading?: boolean;
}

interface DocsTimelineData {
    pendingDemo: boolean;
    pendingContent: string;
    dynamicItems: TimelineItem[];
    timelineLogs: string[];
    bindItems: TimelineItem[];
}

@CustomElement({
    tagName: 'docs-timeline',
    template,
})
export class DocsTimeline extends BaseElement<DocsTimelineData> {
    constructor() {
        super({
            pendingDemo: true,
            pendingContent: '加载更多...',
            dynamicItems: [{ title: '初始数据', time: '2024-01-01' }],
            timelineLogs: [],
            bindItems: [
                { title: '项目启动', time: '2024-01-01', color: 'blue', icon: '🚀' },
                { title: '开发阶段', time: '2024-01-15', color: 'green', icon: '💻' },
            ],
        });
    }

    /**
     * 获取绑定的时间轴数据（用于 :items 绑定）
     */
    getTimelineItems(): TimelineItem[] {
        return this.$data.bindItems;
    }

    /**
     * 添加绑定数据节点
     */
    addBindItem(): void {
        const titles = ['需求分析', 'UI设计', '后端开发', '前端开发', '测试验收', '部署上线'];
        const icons = ['📝', '🎨', '⚙️', '💻', '🧪', '🚀'];
        const colors = ['blue', 'green', 'orange', 'red'];

        const randomIndex = Math.floor(Math.random() * titles.length);
        const newItem: TimelineItem = {
            title: titles[randomIndex],
            time: new Date().toLocaleString('zh-CN'),
            color: colors[Math.floor(Math.random() * colors.length)],
            icon: icons[randomIndex],
        };

        this.$data.bindItems = [...this.$data.bindItems, newItem];
    }

    /**
     * 重置绑定数据
     */
    resetBindItems(): void {
        this.$data.bindItems = [
            { title: '项目启动', time: '2024-01-01', color: 'blue', icon: '🚀' },
            { title: '开发阶段', time: '2024-01-15', color: 'green', icon: '💻' },
        ];
    }

    /**
     * 获取时间轴元素
     */
    private getTimelineEl(): (unknown & { setItems: (items: TimelineItem[]) => void }) | null {
        const el = this.querySelector('#timeline-dynamic-demo');
        return el as unknown as { setItems: (items: TimelineItem[]) => void } | null;
    }

    /**
     * 添加日志
     */
    private addLog(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.$data.timelineLogs.unshift(`[${timestamp}] ${message}`);
        // 只保留最近5条
        if (this.$data.timelineLogs.length > 5) {
            this.$data.timelineLogs.pop();
        }
        // 使用 $refs 访问 ref 元素
        if (this.$refs.timelineLog) {
            (this.$refs.timelineLog as HTMLElement).textContent = this.$data.timelineLogs.join('\n');
        }
    }

    /**
     * 添加时间轴节点
     */
    addTimelineItem(): void {
        const timeline = this.getTimelineEl();
        if (!timeline || typeof timeline.setItems !== 'function') return;

        const colors = ['blue', 'green', 'orange', 'red'];
        const icons = ['🚀', '💻', '🧪', '🎉', '✨', '📦'];
        const titles = ['项目启动', '开发阶段', '测试验收', '正式发布', '功能迭代', '版本更新'];

        const randomIndex = Math.floor(Math.random() * titles.length);
        const newItem: TimelineItem = {
            title: titles[randomIndex],
            time: new Date().toLocaleString('zh-CN'),
            color: colors[Math.floor(Math.random() * colors.length)],
            icon: icons[randomIndex],
        };

        this.$data.dynamicItems.push(newItem);
        timeline.setItems([...this.$data.dynamicItems]);
        this.addLog(`添加节点: ${newItem.title}`);
    }

    /**
     * 更新首个节点
     */
    updateTimelineItem(): void {
        const timeline = this.getTimelineEl();
        if (!timeline || typeof timeline.setItems !== 'function') return;

        if (this.$data.dynamicItems.length === 0) {
            this.addLog('没有可更新的节点');
            return;
        }

        this.$data.dynamicItems[0] = {
            ...this.$data.dynamicItems[0],
            title: '已更新: ' + this.$data.dynamicItems[0].title,
            color: 'green',
            icon: '✅',
        };
        timeline.setItems([...this.$data.dynamicItems]);
        this.addLog('更新首个节点');
    }

    /**
     * 清空时间轴数据
     */
    clearTimelineItems(): void {
        const timeline = this.getTimelineEl();
        if (!timeline || typeof timeline.setItems !== 'function') return;

        this.$data.dynamicItems = [];
        timeline.setItems([]);
        this.addLog('清空所有数据');
    }
}

export default DocsTimeline;
