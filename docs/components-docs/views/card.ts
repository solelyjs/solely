/**
 * Card 卡片组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './card.html?raw';

interface CardDocData {
    loading: boolean;
}

@CustomElement({
    tagName: 'docs-card',
    template,
})
export class DocsCard extends BaseElement<CardDocData> {
    constructor() {
        super({ loading: false });
    }

    /**
     * 切换加载状态
     */
    toggleLoading(): void {
        const card = this.$refs.loadingCard as unknown as {
            setLoading: (loading: boolean) => void;
            $data: { loading: boolean };
        };
        if (card && typeof card.setLoading === 'function') {
            const newLoading = !card.$data.loading;
            card.setLoading(newLoading);
        }
    }

    /**
     * 处理更多按钮点击
     */
    handleMoreClick(): void {
        alert('点击了更多按钮！');
    }

    /**
     * 处理操作项点击
     */
    handleAction(event: CustomEvent<{ index: number; action: string }>): void {
        alert(`点击了操作：${event.detail.action}（索引：${event.detail.index}）`);
    }
}

export default DocsCard;
