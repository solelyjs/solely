/**
 * Tag 标签组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './tag.html?raw';

interface TagDocData {
    closedTags: string[];
}

@CustomElement({
    tagName: 'docs-tag',
    template,
})
export class DocsTag extends BaseElement<TagDocData> {
    constructor() {
        super({
            closedTags: [],
        });
    }

    /**
     * 处理关闭事件
     */
    handleClose(event: CustomEvent<{ content: string }>): void {
        const content = event.detail.content;
        this.$data.closedTags = [...this.$data.closedTags, content];
        // 3秒后清除提示
        setTimeout(() => {
            this.$data.closedTags = this.$data.closedTags.filter(t => t !== content);
        }, 3000);
    }
}

export default DocsTag;
