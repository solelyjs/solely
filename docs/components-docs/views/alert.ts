/**
 * Alert 组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './alert.html?raw';

@CustomElement({
    tagName: 'docs-alert',
    template,
})
export class DocsAlert extends BaseElement {
    mounted(): void {
        // 为事件示例添加监听器
        const alertDemo = this.querySelector('#alert-event-demo');
        if (alertDemo) {
            alertDemo.addEventListener('close', () => {
                // eslint-disable-next-line no-console
                console.log('Alert closed');
                // eslint-disable-next-line no-undef
                if (typeof SolelyMessage !== 'undefined') {
                    // eslint-disable-next-line no-undef
                    SolelyMessage.success('Alert closed!');
                }
            });
        }
    }
}

export default DocsAlert;
