/**
 * Timeline 时间轴组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './timeline.html?raw';

interface DocsTimelineData {
    pendingDemo: boolean;
    pendingContent: string;
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
        });
    }
}

export default DocsTimeline;
