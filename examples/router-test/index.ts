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
      <h3>🏠 首页</h3>
      <p>欢迎来到 Solely 路由测试！</p>
    </div>
  `,
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class HomePage extends BaseElement {}

/**
 * 关于页面组件
 */
@CustomElement({
    tagName: 'about-page',
    template: `
    <div class="page about">
      <h3>ℹ️ 关于</h3>
      <p>Solely 是一个轻量级 Web 组件框架</p>
    </div>
  `,
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class AboutPage extends BaseElement {}

/**
 * 用户详情页面组件
 */
@CustomElement({
    tagName: 'user-page',
    template: `
    <div class="page user">
      <h3>👤 用户详情</h3>
      <p>用户ID: {{ $data.id || '未提供' }}</p>
      <p>这是动态路由参数的示例</p>
    </div>
  `,
    props: [{ name: 'id', type: 'string' }],
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class UserPage extends BaseElement<{ id: string }> {
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
      <h3>⚡ 异步加载页面</h3>
      <p>此页面通过异步加载成功！</p>
    </div>
  `,
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class AsyncPage extends BaseElement {}

/**
 * Query 参数示例页面
 */
@CustomElement({
    tagName: 'query-page',
    template: `
    <div class="page query">
      <h3>🔍 Query 参数示例</h3>
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
// @ts-expect-error: 类通过装饰器注册为自定义元素
class QueryPage extends BaseElement<{
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
      <h3>📁 嵌套路由示例</h3>
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
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class NestedLayout extends BaseElement<{ text: string }> {
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
// @ts-expect-error: 类通过装饰器注册为自定义元素
class NestedChild1 extends BaseElement<{ text: string }> {
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
// @ts-expect-error: 类通过装饰器注册为自定义元素
class NestedChild2 extends BaseElement<{ text: string }> {
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
      <h3>💾 KeepAlive 缓存示例</h3>
      <p>此页面启用 KeepAlive，切换路由后状态会被保留</p>
      <p>计数器: {{ $data.count }}</p>
      <button @click="$data.count++">增加</button>
      <p>输入框: <input type="text" s-model="$data.text" /></p>
    </div>
  `,
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class KeepAlivePage extends BaseElement<{ count: number; text: string }> {
    constructor() {
        super({ count: 0, text: '' });
    }
}

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
