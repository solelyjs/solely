/**
 * Solely NotFound 404 组件
 * 页面未找到时的展示组件
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { NotFoundProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** manifest default 工厂的宿主能力（避免默认值直接读取当前 prop，确保 removeAttribute 可回退） */
interface NotFoundDefaultHost {
    getDefaultSubtitleText(): string;
    getDefaultDescriptionText(): string;
    getDefaultBackText(): string;
}

@CustomElement({
    tagName: 'solely-not-found',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'title', type: 'string', default: '404' },
        // 默认文案随语言（最近 [lang] / document.lang）变化，始终可用属性覆盖
        {
            name: 'subtitle',
            type: 'string',
            default: (host: NotFoundDefaultHost) => host.getDefaultSubtitleText(),
        },
        {
            name: 'description',
            type: 'string',
            default: (host: NotFoundDefaultHost) => host.getDefaultDescriptionText(),
        },
        {
            name: 'backText',
            type: 'string',
            default: (host: NotFoundDefaultHost) => host.getDefaultBackText(),
        },
        { name: 'backUrl', type: 'string', default: '/' },
        { name: 'embedded', type: 'boolean', default: false },
        { name: 'showIcon', type: 'boolean', default: true },
    ],
})
class SolelyNotFound extends BaseElement<NotFoundProps> {
    /**
     * 是否使用中文默认文案：
     * 优先取最近的 [lang] 祖先，其次取文档根节点 lang；未声明语言时沿用中文
     */
    private prefersChinese(): boolean {
        if (typeof document === 'undefined') return true;
        const lang = (
            this.closest('[lang]')?.getAttribute('lang') ||
            document.documentElement.lang ||
            ''
        ).toLowerCase();
        return lang === '' || lang.startsWith('zh');
    }

    /**
     * 语言相关的默认副标题（不读取当前 prop 值，供 manifest default 工厂与渲染复用）
     */
    getDefaultSubtitleText(): string {
        return this.prefersChinese() ? '抱歉，您访问的页面不存在' : 'Sorry, the page you requested does not exist';
    }

    /**
     * 语言相关的默认描述文字（不读取当前 prop 值）
     */
    getDefaultDescriptionText(): string {
        return this.prefersChinese()
            ? '请检查网址是否正确，或点击下方按钮返回首页'
            : 'Please check the URL, or click the button below to go back home';
    }

    /**
     * 语言相关的默认返回按钮文字（不读取当前 prop 值）
     */
    getDefaultBackText(): string {
        return this.prefersChinese() ? '返回首页' : 'Back to Home';
    }

    /**
     * 标题（清空 title 时回退到 404，避免标题区整体消失）
     */
    getTitleText(): string {
        return this.$data.title || '404';
    }

    /**
     * 副标题（未通过属性覆盖时按语言给出）
     */
    getSubtitleText(): string {
        return this.$data.subtitle || this.getDefaultSubtitleText();
    }

    /**
     * 描述文字（未通过属性覆盖时按语言给出）
     */
    getDescriptionText(): string {
        return this.$data.description || this.getDefaultDescriptionText();
    }

    /**
     * 返回按钮文字（未通过属性覆盖时按语言给出）
     */
    getBackText(): string {
        return this.$data.backText || this.getDefaultBackText();
    }

    /**
     * 处理返回按钮点击
     *
     * 先派发可取消的 back 事件，业务方可以阻止默认跳转并自行接入路由；
     * 未阻止时优先使用旧版可选的 __SOLELY_ROUTER__ 全局实例，否则回退到 location 跳转。
     */
    handleBack(): void {
        if (typeof window === 'undefined') return;

        const url = this.$data.backUrl || '/';

        const allowed = this.dispatchEvent(
            new CustomEvent('back', {
                bubbles: true,
                composed: true,
                cancelable: true,
                detail: { url },
            }),
        );
        if (!allowed) return;

        // 可选的路由实例（旧版约定），不存在时不影响组件使用
        const router = (window as unknown as { __SOLELY_ROUTER__?: { push?: (path: string) => void } })
            .__SOLELY_ROUTER__;
        if (router && typeof router.push === 'function') {
            router.push(url);
            return;
        }

        window.location.href = url;
    }
}

export default SolelyNotFound;
export { SolelyNotFound };
