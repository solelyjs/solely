/**
 * Solely Empty 组件
 * 空状态组件，用于页面无数据时的占位展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { EmptyProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-empty',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'description', type: 'string', default: '' },
        { name: 'image', type: 'string', default: '' },
    ],
})
class SolelyEmpty extends BaseElement<EmptyProps> {
    /**
     * 设置描述文字
     */
    public setDescription(description: string): void {
        this.$data.description = description;
    }
}

export default SolelyEmpty;
export { SolelyEmpty };
