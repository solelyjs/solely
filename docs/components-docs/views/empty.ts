/**
 * Empty 空状态组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './empty.html?raw';

@CustomElement({
    tagName: 'docs-empty',
    template,
})
export class DocsEmpty extends BaseElement {
    constructor() {
        super({});
    }
}

export default DocsEmpty;
