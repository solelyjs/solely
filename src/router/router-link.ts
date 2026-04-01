import { BaseElement, CustomElement } from '../runtime/component';
import { getRouter, routerReady } from './core';

@CustomElement({
    tagName: 'router-link',
    // template 中 slot 包裹 label 作为 fallback：
    // 如果有子节点，显示子节点；如果没有，显示 label 属性的内容。
    template: `
    <a part="link" :href="$data.href" :class="{active: $data.isActive}">
      <slot>{{$data.label || ''}}</slot>
    </a>
  `,
    styles: `
    :host {
    }

    a {
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    /* 内部 <a> 标签的默认高亮 */
    a.active {
      font-weight: 600;
    }

    /* custom 模式：消除包裹 a 标签的视觉/布局影响，由 slot 内部元素接管 */
    :host([custom]) a {
      display: contents;
    }
  `,
    shadowDOM: { use: true, mode: 'open' },
    // 注册所有支持的 props
    props: ['to', 'active', 'exact', 'label', 'custom', 'activeClass', 'prefetch'],
})
class RouterLink extends BaseElement<{
    active: boolean;
    to: string; // 路由目标，动态
    label: string; // slot fallback，静态
    href: string;
    isActive: boolean;
    custom: boolean; // custom 模式，静态
    activeClass: string;
    prefetch: boolean; // 预加载标记，静态
}> {
    set to(value: string) {
        this.$data.to = value;
        this.updateState();
    }

    get to(): string {
        return this.$data.to;
    }

    private _prefetched = false;

    async mounted() {
        const router = await routerReady;

        // 监听路由变化，更新 active 状态
        router.listen(() => this.updateState());

        // 初始化状态
        this.updateState();

        // 1. 完美拦截点击事件 (兼容新标签页等浏览器原生行为)
        this.addEventListener('click', e => {
            // 被阻止过则忽略
            if (e.defaultPrevented) return;
            // 存在键盘修饰键，交给浏览器原生处理（新标签页/新窗口）
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            // 非鼠标左键点击，交给浏览器原生处理
            if (e.button !== 0) return;
            // 目标带有 target="_blank" 等属性，交给浏览器原生处理
            const target = e.target as HTMLElement;
            if (target.closest('a')?.getAttribute('target')) return;

            e.preventDefault();
            getRouter()?.push(this.$data.to);
        });

        // 2. Prefetch 预加载逻辑 (鼠标悬停时触发，提升页面切换极速体验)
        this.addEventListener(
            'mouseenter',
            () => {
                this.prefetchRoute();
            },
            { once: true },
        ); // { once: true } 保证只触发一次，避免浪费性能
    }

    updateState() {
        const router = getRouter();
        if (!router) return;

        // 生成真实的 href 路径
        this.$data.href = router.resolve(this.$data.to);

        let isSelected = false;

        // 计算 Active 状态
        if (this.$data.active) {
            isSelected = true;
        } else {
            const currentRoute = router.getCurrentRoute();

            if (currentRoute) {
                const currentPath = currentRoute.fullPath;
                const isExact = this.hasAttribute('exact');

                if (isExact) {
                    isSelected = currentPath === this.$data.to;
                } else {
                    isSelected = currentPath === this.$data.to || currentPath.startsWith(this.$data.to + '/');
                }
            }
        }

        this.$data.isActive = isSelected;

        // 3. 将 active 状态和自定义 class 同步到组件宿主 (Host) 上
        const cls = this.$data.activeClass || 'active';
        this.classList.toggle(cls, isSelected);
    }

    // 预加载路由的具体实现
    private prefetchRoute() {
        // 如果已经预加载过，或者用户没有显式开启 prefetch 属性，则跳过
        if (this._prefetched || !this.hasAttribute('prefetch')) return;

        const router = getRouter();
        // 假设你的 Router 核心里有 prefetch 方法，如果没有可以去掉这段逻辑或在 core 里实现
        if (router && typeof (router as any).prefetch === 'function') {
            (router as any).prefetch(this.$data.to);
            this._prefetched = true;
        }
    }
}

export default RouterLink;
