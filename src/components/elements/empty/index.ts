/**
 * Solely Empty 组件
 * 空状态组件，用于页面无数据时的占位展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { fallbackBrokenImage } from '../utils/helpers';
import type { EmptyProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-empty',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'description', type: 'string', default: '暂无数据' },
        { name: 'image', type: 'string', default: '' },
        { name: 'showIcon', type: 'boolean', default: true },
    ],
})
class SolelyEmpty extends BaseElement<EmptyProps> {
    /** 自定义图片加载失败时回退到内置占位图，避免破图 */
    handleImageError(event: Event): void {
        fallbackBrokenImage(event);
    }

    /** 监听 light DOM 变化，动态插入/移除 slot 内容后重新渲染 */
    private slotObserver?: MutationObserver;

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.slotObserver = new MutationObserver(() => {
            this.refresh();
        });
        this.slotObserver.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['slot'],
        });
    }

    /**
     * 组件卸载时释放观察器
     */
    unmounted(): void {
        this.slotObserver?.disconnect();
        this.slotObserver = undefined;
    }

    /**
     * 检查是否有 image 插槽
     */
    hasImageSlot(): boolean {
        return this.querySelector('[slot="image"]') !== null;
    }

    /**
     * 设置描述文字
     */
    public setDescription(description: string): void {
        this.$data.description = description;
    }
}

export default SolelyEmpty;
export { SolelyEmpty };
