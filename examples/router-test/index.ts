import { BaseElement, createRouter, CustomElement, RouteMatch } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

/**
 * 首页组件
 */
@CustomElement({
    tagName: 'home-page',
    template: `
    <div class="page home">
      <h3>首页</h3>
      <p>欢迎来到 Solely 路由测试！</p>
    </div>
  `,
})
export class HomePage extends BaseElement {}

/**
 * 关于页面组件
 */
@CustomElement({
    tagName: 'about-page',
    template: `
    <div class="page about">
      <h3>关于</h3>
      <p>Solely 是一个轻量级 Web 组件框架</p>
    </div>
  `,
})
export class AboutPage extends BaseElement {}

/**
 * 用户详情页面组件
 */
@CustomElement({
    tagName: 'user-page',
    template: `
    <div class="page user">
      <h3>用户详情</h3>
      <p>用户ID: {{ $data.id || '未提供' }}</p>
      <p>这是动态路由参数的示例</p>
    </div>
  `,
    props: [{ name: 'id', type: 'string' }],
})
export class UserPage extends BaseElement<{ id: string }> {
    constructor() {
        super({ id: '' });
    }
}

/**
 * 异步加载页面组件 - 模拟异步加载成功
 */
@CustomElement({
    tagName: 'async-page',
    template: `
    <div class="page async">
      <h3>异步加载页面</h3>
      <p>此页面通过异步加载成功！</p>
    </div>
  `,
})
export class AsyncPage extends BaseElement {}

/**
 * Query 参数示例页面
 */
@CustomElement({
    tagName: 'query-page',
    template: `
    <div class="page query">
      <h3>Query 参数示例</h3>
      <p>搜索关键词: {{ $data.queryKeyword || '无' }}</p>
      <p>分类: {{ $data.queryCategory || '全部' }}</p>
      <p>页码: {{ $data.queryPage || 1 }}</p>
    </div>
  `,
    props: [
        { name: 'queryKeyword', type: 'string' },
        { name: 'queryCategory', type: 'string' },
        { name: 'queryPage', type: 'string' },
    ],
})
export class QueryPage extends BaseElement<{
    queryKeyword: string;
    queryCategory: string;
    queryPage: string;
}> {
    constructor() {
        super({ queryKeyword: '', queryCategory: '', queryPage: '1' });
    }
}

/**
 * 嵌套路由父页面
 */
@CustomElement({
    tagName: 'nested-layout',
    template: `
    <div class="page nested">
      <h3>嵌套路由示例</h3>
      <div class="nested-nav">
        <router-link to="/nested/child1" class="nested-link">子页面1</router-link>
        <router-link to="/nested/child2" class="nested-link">子页面2</router-link>
      </div>
      <div class="nested-content">
        <p>输入框: <input type="text" s-model="$data.text" /></p>
        <router-view></router-view>
      </div>
    </div>
  `,
    styles: `
    :host {
      display: block;
    }
    .nested {
      color: #333;
      line-height: 1.5;
    }
    .nested h3 {
      color: #13c2c2;
      margin-bottom: 16px;
      font-size: 22px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }
    .nested h3::before {
      content: '📁';
      font-size: 24px;
    }
    .nested-nav {
      margin: 16px 0;
      display: flex;
      gap: 10px;
    }
    .nested-link {
      padding: 8px 16px;
      border-radius: 6px;
      background: #f0f5ff;
      color: #2b4acb;
      text-decoration: none;
      display: inline-block;
      transition: all 0.2s;
      font-size: 13px;
    }
    .nested-link:hover {
      background: #d6e4ff;
    }
    .nested-content {
      background: #fafafa;
      padding: 16px;
      border-radius: 8px;
      margin-top: 16px;
      border: 1px solid #f0f0f0;
    }
    .nested-content input[type="text"] {
      padding: 8px 12px;
      border: 1px solid #d9d9d9;
      border-radius: 6px;
      margin-left: 8px;
      background: white;
      color: #333;
      font-size: 13px;
      transition: all 0.2s;
    }
    .nested-content input[type="text"]:focus {
      border-color: #13c2c2;
      box-shadow: 0 0 0 2px rgba(19, 194, 194, 0.2);
      outline: none;
    }
    `,
    shadowDOM: {
        use: true,
        mode: 'open',
    },
})
export class NestedLayout extends BaseElement<{ text: string }> {
    constructor() {
        super({ text: '' });
    }
}

/**
 * 嵌套路由子页面1
 */
@CustomElement({
    tagName: 'nested-child1',
    template: `
    <div class="nested-child">
      <h4>子页面 1</h4>
      <p>这是嵌套路由的第一个子页面</p>
      <p>输入内容会被缓存: <input type="text" s-model="$data.text" ></p>
    </div>
  `,
})
export class NestedChild1 extends BaseElement<{ text: string }> {
    constructor() {
        super({ text: '' });
    }
}

/**
 * 嵌套路由子页面2
 */
@CustomElement({
    tagName: 'nested-child2',
    template: `
    <div class="nested-child">
      <h4>子页面 2</h4>
      <p>这是嵌套路由的第二个子页面</p>
      <p>输入内容会被缓存: <input type="text" s-model="$data.text" /></p>
    </div>
  `,
})
export class NestedChild2 extends BaseElement<{ text: string }> {
    constructor() {
        super({ text: '' });
    }
}

/**
 * KeepAlive 缓存示例页面
 */
@CustomElement({
    tagName: 'keepalive-page',
    template: `
    <div class="page keepalive">
      <h3>KeepAlive 缓存示例</h3>
      <p>此页面启用 KeepAlive，切换路由后状态会被保留</p>
      <p>计数器: {{ $data.count }}</p>
      <button @click="$data.count++">增加</button>
      <p>输入框: <input type="text" s-model="$data.text" /></p>
    </div>
  `,
})
export class KeepAlivePage extends BaseElement<{ count: number; text: string }> {
    constructor() {
        super({ count: 0, text: '' });
    }
}

/**
 * 启动占位组件
 * 首导航（setupListeners → 首次 navigate）尚未 settled 时，由 router-view 的 loading 属性渲染
 */
@CustomElement({
    tagName: 'boot-placeholder',
    template: `
    <div class="boot">
      <div class="boot__bar"></div>
      <div class="boot__line boot__line--w90"></div>
      <div class="boot__line boot__line--w70"></div>
      <div class="boot__line boot__line--w50"></div>
      <p class="boot__hint">启动中 · 首导航尚未完成（router-view 的 loading 占位）</p>
    </div>
  `,
    styles: `
    :host {
      display: block;
    }
    .boot {
      padding: 4px 0;
    }
    .boot__bar,
    .boot__line {
      background: linear-gradient(90deg, #eef0f5 25%, #e3e6ee 37%, #eef0f5 63%);
      background-size: 400% 100%;
      border-radius: 6px;
      animation: boot-shimmer 1.4s ease-in-out infinite;
    }
    .boot__bar {
      width: 40%;
      height: 28px;
      margin-bottom: 22px;
    }
    .boot__line {
      height: 14px;
      margin-bottom: 12px;
    }
    .boot__line--w90 {
      width: 90%;
    }
    .boot__line--w70 {
      width: 70%;
    }
    .boot__line--w50 {
      width: 50%;
    }
    .boot__hint {
      margin: 22px 0 0;
      font-size: 12px;
      color: #9aa3b2;
    }
    @keyframes boot-shimmer {
      0% {
        background-position: 100% 0;
      }
      100% {
        background-position: 0 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .boot__bar,
      .boot__line {
        animation: none;
      }
    }
  `,
    shadowDOM: { use: true },
})
export class BootPlaceholder extends BaseElement {}

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
    shadowDOM: { use: true },
})
export class RouterTest extends BaseElement<RouterTestData> {
    // 路由实例
    private router = createRouter({
        routes: [
            { path: '/', tagName: 'home-page' },
            { path: '/about', tagName: 'about-page' },
            { path: '/user/:id', tagName: 'user-page' },
            { path: '/search', tagName: 'query-page' },
            {
                path: '/async',
                component: async () => {
                    // 模拟异步加载成功 - 延迟 800ms
                    await new Promise(resolve => setTimeout(resolve, 800));
                    return 'async-page';
                },
            },
            {
                path: '/error-demo',
                component: async () => {
                    // 模拟异步加载失败
                    await new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('组件加载失败：网络错误或模块不存在')), 1000);
                    });
                    return 'error-page';
                },
            },
            {
                path: '/nested',
                tagName: 'nested-layout',
                // keepAlive: true,
                children: [
                    { path: 'child1', tagName: 'nested-child1', keepAlive: true },
                    { path: 'child2', tagName: 'nested-child2', keepAlive: true },
                ],
            },
            {
                path: '/keepalive',
                tagName: 'keepalive-page',
                keepAlive: true,
            },
        ],
        mode: 'hash',
        beforeEach: (to: RouteMatch) => {
            console.log('路由守卫 - 即将导航到:', to.fullPath);
            return true;
        },
        afterEach: (to: RouteMatch) => {
            console.log('路由守卫 - 导航完成:', to.fullPath);
        },
    });

    // 取消监听的函数
    private unsubscribe?: () => void;

    // 慢启动演示的定时器
    private bootTimer?: number;

    constructor() {
        super({
            currentPath: '/',
            params: {},
            query: {},
            history: [],
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
        // ?boot=slow 时故意延迟首次导航，用于观察 router-view 的启动占位（loading）
        const slowBoot = new URLSearchParams(window.location.search).get('boot') === 'slow';
        const start = () => {
            this.router.setupListeners();
            // 初始化当前路由
            this.router.push('/');
        };
        if (slowBoot) {
            // 首导航未 settled 期间 currentRoute 恒为 null，router-view 渲染 boot-placeholder
            this.bootTimer = window.setTimeout(start, 1200);
        } else {
            start();
        }
    }

    /**
     * 重载页面并切换启动模式
     * @param slow 是否模拟慢启动（?boot=slow）
     */
    reloadWithBoot(slow: boolean) {
        const url = new URL(window.location.href);
        if (slow) url.searchParams.set('boot', 'slow');
        else url.searchParams.delete('boot');
        window.location.href = url.toString();
    }

    /**
     * 组件卸载时清理
     */
    unmounted() {
        if (this.bootTimer !== undefined) {
            window.clearTimeout(this.bootTimer);
            this.bootTimer = undefined;
        }
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}
