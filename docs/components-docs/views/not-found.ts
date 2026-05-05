/**
 * NotFound 404 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './not-found.html?raw';

@CustomElement({
    tagName: 'docs-not-found',
    template,
})
export class DocsNotFound extends BaseElement {
    constructor() {
        super({});
    }
}

export default DocsNotFound;
