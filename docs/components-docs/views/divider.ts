/**
 * Divider 分割线组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './divider.html?raw';

@CustomElement({
    tagName: 'docs-divider',
    template,
})
export class DocsDivider extends BaseElement {
    constructor() {
        super({});
    }
}

export default DocsDivider;
