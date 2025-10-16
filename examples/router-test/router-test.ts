import { BaseElement, CustomElement } from '../../src/base';
import template from './router-test.html?raw';
import styles from './router-test.css?raw';
import { IRouter } from '../../src/base/router-view';

interface RouterTestData {
  routes: IRouter[];
  currentPath: string;
}

@CustomElement({
  tagName: 'router-test',
  template,
  styles,
  className: 'router-test',
  shadowDOM: { use: true, mode: 'open' }
})
export default class RouterTestElement extends BaseElement<RouterTestData> {
  constructor() {
    super({
      routes: [
        {
          path: 'home',
          tagName: 'router-home'
        },
        {
          path: 'about',
          tagName: 'router-about'
        },
        {
          path: 'user',
          tagName: 'router-user-layout',
          children: [
            {
              path: 'profile',
              tagName: 'router-user-profile'
            },
            {
              path: 'settings',
              tagName: 'router-user-settings'
            }
          ]
        }
      ],
      currentPath: window.location.hash || '#/home'
    });
  }

  created() {
    console.log('Router Test component created');
    // this.registerRouteComponents();
  }

  mounted() {
    console.log('Router Test component mounted');
    // 更新当前路径显示
    this.updateCurrentPath();
    window.addEventListener('hashchange', () => this.updateCurrentPath());
    this.registerRouteComponents();
  }

  unmounted() {
    window.removeEventListener('hashchange', () => this.updateCurrentPath());
  }

  updateCurrentPath() {
    this.$data.currentPath = window.location.hash || '#/home';
  }

  navigateTo(path: string) {
    window.location.hash = path;
  }

  registerRouteComponents() {
    // 注册路由组件
    this.registerComponent('router-home', () => `
      <div class="route-home">
        <h2>首页</h2>
        <p>这是路由测试的首页组件。</p>
        <p>使用上方导航可以跳转到其他页面。</p>
      </div>
    `);

    this.registerComponent('router-about', () => `
      <div class="route-about">
        <h2>关于</h2>
        <p>这是关于页面组件。</p>
        <p>测试路由功能和嵌套路由。</p>
      </div>
    `);

    this.registerComponent('router-user-layout', () => `
      <div class="user-layout">
        <h2>用户中心</h2>
        <div class="user-nav">
          <button onclick="window.location.hash = '#/user/profile'">个人资料</button>
          <button onclick="window.location.hash = '#/user/settings'">设置</button>
        </div>
        <div class="user-content">
          <router-view></router-view>
        </div>
      </div>
    `);

    this.registerComponent('router-user-profile', () => `
      <div class="user-profile">
        <h3>个人资料</h3>
        <p>这是用户个人资料页面。</p>
        <p>这是一个嵌套路由的示例。</p>
      </div>
    `);

    this.registerComponent('router-user-settings', () => `
      <div class="user-settings">
        <h3>用户设置</h3>
        <p>这是用户设置页面。</p>
        <p>测试嵌套路由的功能。</p>
      </div>
    `);
  }

  private registerComponent(tagName: string, templateFn: () => string) {
    if (!customElements.get(tagName)) {
      class RouteComponent extends HTMLElement {
        private static tpl: HTMLTemplateElement;

        constructor() {
          super();
          // 初始化模板，只创建一次
          if (!RouteComponent.tpl) {
            RouteComponent.tpl = document.createElement('template');
            RouteComponent.tpl.innerHTML = templateFn();
          }
        }

        connectedCallback() {
          // 克隆模板内容并插入到当前元素
          this.appendChild(RouteComponent.tpl.content.cloneNode(true));
        }

        disconnectedCallback() {
          // 如果有事件或资源清理，可以写这里
          // 例如 this.innerHTML = ''; 清空内容
        }
      }

      customElements.define(tagName, RouteComponent);
    }
  }

}