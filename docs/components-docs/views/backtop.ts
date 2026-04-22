/**
 * BackTop 回到顶部组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './backtop.html?raw';

interface BackTopDocData {
    clickCount: number;
}

@CustomElement({
    tagName: 'docs-backtop',
    template,
})
export class DocsBackTop extends BaseElement<BackTopDocData> {
    constructor() {
        super({
            clickCount: 0,
        });
    }

    /**
     * 处理点击事件
     */
    handleClick(): void {
        this.$data.clickCount++;
    }
}

export default DocsBackTop;
