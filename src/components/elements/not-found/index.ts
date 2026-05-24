/**
 * Solely NotFound 404 组件
 * 页面未找到时的展示组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { NotFoundProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-not-found',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'title', type: 'string', default: '404' },
        { name: 'subtitle', type: 'string', default: '抱歉，您访问的页面不存在' },
        { name: 'description', type: 'string', default: '请检查网址是否正确，或点击下方按钮返回首页' },
        { name: 'backText', type: 'string', default: '返回首页' },
        { name: 'backUrl', type: 'string', default: '/' },
        { name: 'embedded', type: 'boolean', default: false },
    ],
})
class SolelyNotFound extends BaseElement<NotFoundProps> {
    /**
     * 处理返回按钮点击
     */
    handleBack(): void {
        const url = this.$data.backUrl || '/';
        // 优先使用路由跳转
        if (typeof window !== 'undefined') {
            // 检查是否存在路由实例
            const router = (window as unknown as { __SOLELY_ROUTER__?: { push: (path: string) => void } })
                .__SOLELY_ROUTER__;
            if (router) {
                router.push(url);
            } else {
                window.location.href = url;
            }
        }
    }
}

export default SolelyNotFound;
export { SolelyNotFound };
