/**
 * Solely Divider 组件
 * 分割线组件，用于内容的分隔
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { DividerProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-divider',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'horizontal' },
        { name: 'orientation', type: 'string', default: 'center' },
        { name: 'dashed', type: 'boolean', default: false },
        { name: 'content', type: 'string', default: '' },
        { name: 'hasSlotContent', type: 'boolean', default: false },
    ],
})
class SolelyDivider extends BaseElement<DividerProps & { hasSlotContent: boolean }> {
    /**
     * 获取 divider class 对象
     */
    getDividerClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.type) {
            classes[`divider--${this.$data.type}`] = true;
        }
        if (this.$data.orientation) {
            classes[`divider--${this.$data.orientation}`] = true;
        }
        classes['divider--dashed'] = !!this.$data.dashed;
        return classes;
    }

    mounted(): void {
        // 检查是否有 slot 内容
        this.$data.hasSlotContent = this.childNodes.length > 0;
    }
}

export default SolelyDivider;
export { SolelyDivider };
