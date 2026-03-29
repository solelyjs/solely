import { BaseElement, createRouter, CustomElement, RouteMatch } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

/**
 * 路由测试组件数据接口
 */
interface RouterTestData {
  currentPath: string;
  params: Record<string, string>;
  query: Record<string, string>;
  history: string[];
}

/**
 * 路由测试组件
 * 演示 Solely 路由系统的功能
 */
@CustomElement({
  tagName: 'router-test',
  template,
  styles,
  shadowDOM: { use: true }
})
export class RouterTest extends BaseElement<RouterTestData> {
  // 路由实例
  private router = createRouter({
    routes: [
      { path: '/', tagName: 'home-page' },
      { path: '/about', tagName: 'about-page' },
      { path: '/user/:id', tagName: 'user-page' }
    ],
    mode: 'hash',
    beforeEach: (to: RouteMatch) => {
      console.log('路由守卫 - 即将导航到:', to.fullPath);
      return true;
    },
    afterEach: (to: RouteMatch) => {
      console.log('路由守卫 - 导航完成:', to.fullPath);
    }
  });

  // 取消监听的函数
  private unsubscribe?: () => void;

  constructor() {
    super({
      currentPath: '/',
      params: {},
      query: {},
      history: []
    });
  }

  /**
   * 组件挂载时初始化路由
   */
  mounted() {
    // 监听路由变化
    this.unsubscribe = this.router.listen(() => {
      const route = this.router.getCurrentRoute();
      if (route) {
        this.$data.currentPath = route.fullPath;
        this.$data.params = route.params;
        this.$data.query = route.query;
        this.$data.history.push(route.fullPath);
        // 限制历史记录数量
        if (this.$data.history.length > 10) {
          this.$data.history.shift();
        }
      }
    });

    // 设置浏览器事件监听
    this.router.setupListeners();

    // 初始化当前路由
    this.router.push('/');
  }

  /**
   * 组件卸载时清理
   */
  unmounted() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
