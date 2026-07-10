import { BaseElement, CustomElement } from '../runtime/component';
import { getRouter, routerReady } from './core';
import template from './router-link.html?solely';

@CustomElement({
    tagName: 'router-link',
    template,
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

    #prefetched = false;
    private unsubscribe?: () => void;
    private mountVersion = 0;

    private readonly handleClick = (e: MouseEvent) => {
        if (e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        if (target.closest('a')?.getAttribute('target')) return;

        e.preventDefault();
        getRouter()?.push(this.$data.to);
    };

    private readonly handleMouseEnter = () => {
        this.prefetchRoute();
    };

    async mounted() {
        const mountVersion = ++this.mountVersion;
        const router = await routerReady();
        if (this.mountVersion !== mountVersion) return;

        // 监听路由变化，更新 active 状态
        this.unsubscribe = router.listen(() => this.updateState());

        // 初始化状态
        this.updateState();

        // 1. 完美拦截点击事件 (兼容新标签页等浏览器原生行为)
        this.addEventListener('click', this.handleClick);

        // 2. Prefetch 预加载逻辑 (鼠标悬停时触发，提升页面切换极速体验)
        this.addEventListener('mouseenter', this.handleMouseEnter, { once: true }); // { once: true } 保证只触发一次，避免浪费性能
    }

    unmounted() {
        this.mountVersion++;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.removeEventListener('click', this.handleClick);
        this.removeEventListener('mouseenter', this.handleMouseEnter);
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
                    const currentPathname = currentPath.split('?')[0];
                    const targetPathname = this.$data.to.split('?')[0];
                    isSelected = currentPathname === targetPathname || currentPathname.startsWith(targetPathname + '/');
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
        if (this.#prefetched || !this.hasAttribute('prefetch')) return;

        const router = getRouter();
        // 调用 Router 的 prefetch 方法预加载路由组件
        if (router) {
            router.prefetch(this.$data.to);
            this.#prefetched = true;
        }
    }
}

export default RouterLink;
