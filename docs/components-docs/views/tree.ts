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
        const { node } = event.detail ?? {};
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

    /** 0.8.0 新增特性样例：loadData 只支持 JS property 赋值 */
    mounted(): void {
        type AsyncNode = { key: string; title: string };
        const tree = this.$refs.featureAsyncTree as unknown as
            | { loadData?: (node: AsyncNode) => Promise<AsyncNode[]> }
            | undefined;
        if (!tree) return;

        // 验收清单 #19 需要一个可触发失败的入口：勾选期间每次加载都抛错。
        // 组件在失败时会释放 _loadedKeys / _loadingKeys，取消勾选后再次展开即为重试。
        const failToggle = this.$refs.failToggle as HTMLInputElement | undefined;
        failToggle?.addEventListener('change', () => {
            this.addEventLog(
                failToggle.checked
                    ? '模拟加载失败已开启：展开应失败，圆环消失且箭头恢复可点'
                    : '模拟加载失败已关闭：再次展开即重试',
            );
        });

        tree.loadData = async node => {
            await new Promise(resolve => setTimeout(resolve, 600));
            if (failToggle?.checked) {
                this.addEventLog('loadData 模拟失败：取消勾选后再展开可重试');
                throw new Error('模拟加载失败（可重试）');
            }
            return [
                { key: `${node.key}-a`, title: '异步子节点 A' },
                { key: `${node.key}-b`, title: '异步子节点 B' },
            ];
        };
    }
}

export default DocsTree;
