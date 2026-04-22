/**
 * 快速上手页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './quickstart.html?raw';

@CustomElement({
    tagName: 'docs-quickstart',
    template,
})
export class DocsQuickStart extends BaseElement {}

export default DocsQuickStart;
