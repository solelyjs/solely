/**
 * Icon 图标组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { setIconSpritePath, registerIcon, registerIcons } from '../../../src/components/elements/icon';
import template from './icon.html?raw';

setIconSpritePath('/icons/bootstrap-icons.svg');

registerIcon('my-icon', '<polygon points="8,1 14.1,4.5 14.1,11.5 8,15 1.9,11.5 1.9,4.5" fill="currentColor" />');

registerIcons({
    logo: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    arrow: '<path d="M4 12l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
});

@CustomElement({
    tagName: 'docs-icon',
    template,
})
export class DocsIcon extends BaseElement {}

export default DocsIcon;
