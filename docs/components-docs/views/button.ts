/**
 * Button 按钮组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './button.html?raw';

@CustomElement({
    tagName: 'docs-button',
    template,
})
export class DocsButton extends BaseElement {
    /**
     * 处理按钮点击
     */
    handleButtonClick(event: MouseEvent): void {
        const button = event.target as HTMLElement;
        const text = button?.textContent || '按钮';
        alert(`${text} 被点击了！`);
        // eslint-disable-next-line no-console
        console.log('Button click event:', event);
    }
}

export default DocsButton;
