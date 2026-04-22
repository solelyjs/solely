/**
 * Badge 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './badge.html?raw';

@CustomElement({
    tagName: 'docs-badge',
    template,
})
export class DocsBadge extends BaseElement {}

export default DocsBadge;
