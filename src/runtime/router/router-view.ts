import { BaseElement, CustomElement } from '../component';
import type { RouteMatch } from './types';
import { routerReady } from './core';

@CustomElement({
  tagName: 'router-view',
  // 注意：删除了 shadowDOM 配置，默认为 false
})
class RouterView extends BaseElement {
  private unsubscribe?: () => void;
  private level = 0;
  private currentElement: HTMLElement | null = null;
  private currentTagName: string | null = null;

  private routerAttrs = new Set<string>();
  private prevPropKeys = new Set<string>();

  private scheduled = false;
  private cache = new Map<string, HTMLElement>();
  private latestLoadId = 0;

  /* -------------------- 生命周期 -------------------- */

  async mounted() {
    this.detectLevel();
    const router = await routerReady;

    this.unsubscribe = router.listen(() => {
      this.scheduleLoad(router.getCurrentRoute());
    });

    this.loadRoute(router.getCurrentRoute());
  }

  unmounted() {
    this.unsubscribe?.();
    this.cache.forEach(el => el.remove());
    this.cache.clear();
  }

  /* -------------------- 逻辑核心 -------------------- */

  private scheduleLoad(route: RouteMatch | null) {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.loadRoute(route);
    });
  }

  private detectLevel() {
    let level = 0;
    let node = this.parentElement;
    while (node) {
      if (node instanceof RouterView) level++;
      node = node.parentElement;
    }
    this.level = level;
  }

  public async loadRoute(route: RouteMatch | null) {
    const loadId = ++this.latestLoadId;
    const matched = route?.matched[this.level];

    if (!matched) {
      this.handleEmptyRoute();
      return;
    }

    const { config } = matched;
    let tagName = config.tagName;

    // 异步组件处理
    if (!tagName && typeof config.component === 'function') {
      this.renderLoading();
      try {
        const result = await config.component();
        tagName = typeof result === 'string' ? result : result.tagName;
      } catch (err) {
        this.renderError(`Load Error: ${err}`);
        return;
      }
    }

    if (loadId !== this.latestLoadId) return;
    if (!tagName) { this.clear(); return; }

    // 复用逻辑
    if (!config.forceReload && this.currentElement && this.currentTagName === tagName.toLowerCase()) {
      this.syncState(this.currentElement, route?.params, route?.query || {}, config.props);
      return;
    }

    // 在切换前，先清理旧组件。如果旧组件需要 keepAlive，则仅仅 removeChild
    // 我们通过检查当前 currentElement 的 tagName 是否在缓存配置中来实现
    this.clear(config.keepAlive);

    const el = this.getOrCreateComponent(tagName, config);
    this.syncState(el, route?.params, route?.query || {}, config.props);

    this.appendChild(el); // 直接 append 到 this (Host) 之下
    this.currentElement = el;
    this.currentTagName = tagName.toLowerCase();
  }

  private getOrCreateComponent(tagName: string, config: any): HTMLElement {
    const key = tagName.toLowerCase();
    if (config.keepAlive && this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const el = document.createElement(tagName);
    if (config.keepAlive) this.cache.set(key, el);
    return el;
  }

  private syncState(el: HTMLElement, params: any, query: any, props: any = {}) {
    const toKebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const newAttrs = new Map<string, string>();

    Object.entries(params).forEach(([k, v]) => newAttrs.set(toKebab(k), String(v)));
    Object.entries(query).forEach(([k, v]) => newAttrs.set(`query-${toKebab(k)}`, String(v)));

    this.routerAttrs.forEach(attr => {
      if (!newAttrs.has(attr)) { el.removeAttribute(attr); this.routerAttrs.delete(attr); }
    });
    newAttrs.forEach((val, attr) => {
      if (el.getAttribute(attr) !== val) el.setAttribute(attr, val);
      this.routerAttrs.add(attr);
    });

    const newPropKeys = new Set(Object.keys(props));
    this.prevPropKeys.forEach(k => { if (!newPropKeys.has(k)) (el as any)[k] = undefined; });
    Object.entries(props).forEach(([k, v]) => { if ((el as any)[k] !== v) (el as any)[k] = v; });
    this.prevPropKeys = newPropKeys;
  }

  private handleEmptyRoute() {
    this.clear();
    if (this.level === 0) this.renderError('404 Not Found');
  }

  private renderLoading() {
    this.innerHTML = `<div style="padding:20px; color:#999;">Loading...</div>`;
  }

  private renderError(msg: string) {
    this.innerHTML = `<div style="padding:20px; color:#ff4d4f;">${msg}</div>`;
  }

  private clear(keepInCache: boolean = false) {
    // 如果当前有元素，且我们需要缓存它，则通过 removeChild 移出 DOM 但保留内存引用
    if (this.currentElement) {
      if (this.contains(this.currentElement)) {
        this.removeChild(this.currentElement);
      }
    } else if (!keepInCache) {
      this.innerHTML = '';
    }

    this.currentElement = null;
    this.currentTagName = null;
    this.routerAttrs.clear();
    this.prevPropKeys.clear();
  }
}

export default RouterView;