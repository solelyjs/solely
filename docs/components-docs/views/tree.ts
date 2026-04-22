/**
 * Tree 树形控件组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './tree.html?raw';

interface TreeDocData {
    eventLogs: string[];
}

@CustomElement({
    tagName: 'docs-tree',
    template,
})
export class DocsTree extends BaseElement<TreeDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 处理选中事件
     */
    handleSelect(event: CustomEvent<{ node: { title: string; key: string }; selectedKeys: string[] }>): void {
        const { node, selectedKeys } = event.detail ?? {};
        this.addEventLog(`select: ${node?.title ?? '未知节点'} (key: ${node?.key ?? 'none'})`);
    }

    /**
     * 处理展开/收起事件
     */
    handleExpand(event: CustomEvent<{ node: { title: string; key: string }; expandedKeys: string[] }>): void {
        const { node, expandedKeys } = event.detail ?? {};
        this.addEventLog(`expand: ${node?.title ?? '未知节点'} (expandedKeys: ${expandedKeys?.join(', ') ?? 'none'})`);
    }

    /**
     * 处理勾选事件
     */
    handleCheck(event: CustomEvent<{ node: { title: string; key: string }; checkedKeys: string[] }>): void {
        const { node, checkedKeys } = event.detail ?? {};
        this.addEventLog(`check: ${node?.title ?? '未知节点'} (checkedKeys: ${checkedKeys?.join(', ') ?? 'none'})`);
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

export default DocsTree;
