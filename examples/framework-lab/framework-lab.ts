import { BaseElement, CustomElement } from '../../src/base';
import template from './framework-lab.html?raw';
import styles from './framework-lab.css?raw';
import type { IRouter } from '../../src/base/router-view';

interface TodoItem {
  id: number;
  title: string;
  done: boolean;
}

interface UserProfile {
  name: string;
  role: 'guest' | 'admin' | 'editor';
  locale: 'zh-CN' | 'en-US' | 'ja-JP';
  bio: string;
}

interface LabData {
  // 来自 HTML attribute 的 props
  title: string;
  initCount: number;
  debug: boolean;
  config: { theme: string; enableRouter: boolean };

  // 组件内部数据
  count: number;
  user: UserProfile;
  todos: TodoItem[];
  filter: 'all' | 'active' | 'done';
  showList: boolean;
  logs: string[];
  nextTodoId: number;

  // 路由数据
  routes: IRouter[];
  routerPipe: Record<string, any>;
}

@CustomElement({
  tagName: 'framework-lab',
  template,
  styles,
  className: 'framework-lab',
  shadowDOM: { use: true, mode: 'open' },
  props: [
    { name: 'title', type: 'string' },
    { name: 'init-count', type: 'number' },
    { name: 'debug', type: 'boolean' },
    { name: 'config', type: 'object' }
  ]
})
export default class FrameworkLabElement extends BaseElement<LabData> {
  // ---------------- 日志系统 ----------------
  private logQueue: string[] = [];
  private logScheduled = false;

  constructor() {
    super({
      // props 初始值
      title: '综合功能实验室',
      initCount: 1,
      debug: false,
      config: { theme: 'light', enableRouter: true },

      // 内部状态
      count: 0,
      user: { name: '访客', role: 'guest', locale: 'zh-CN', bio: '' },
      todos: [
        { id: 1, title: '了解 BaseElement 生命周期', done: false },
        { id: 2, title: '练习 s-model 双向绑定', done: true },
        { id: 3, title: '测试 If/Else 与 For 嵌套', done: false }
      ],
      filter: 'all',
      showList: true,
      logs: [],
      nextTodoId: 4,

      // 路由与管道
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
      routerPipe: {}
    });
  }

  // ---------------- 生命周期 ----------------
  created() {
    this.enqueueLog('created');
    this.$data.count = this.$data.initCount;
  }

  mounted() {
    this.enqueueLog('mounted');
    // 仅在启用路由时注册
    if (this.$data.config.enableRouter) {
      this.registerRouteComponents();
    }
    this.$data.routerPipe = {
      onClick: (_e: Event) => this.enqueueLog('router pipe click'),
      info: '来自 pipe 的字符串'
    };
  }

  beforeUpdate() {
    // 可用于节流/预处理
  }

  updated() {
    this.enqueueLog('updated');
  }

  unmounted() {
    this.enqueueLog('unmounted');
  }

  // ---------------- 日志方法 ----------------
  /**
   * 安全入队日志，微任务批量刷新到 $data.logs，避免过多渲染
   */
  private enqueueLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    this.logQueue.push(`[${ts}] ${msg}`);
    if (!this.logScheduled) {
      this.logScheduled = true;
      Promise.resolve().then(() => {
        this.$data.logs = this.logQueue.slice(-50);
        this.logScheduled = false;
      });
    }
  }

  // ---------------- 业务方法 ----------------
  inc() { this.$data.count++; }
  dec() { this.$data.count--; }

  setAttrProgrammatically() {
    this.setAttribute('init-count', String(this.$data.initCount + 1));
    this.setAttribute('debug', this.$data.debug ? 'false' : 'true');
    this.setAttribute('config', JSON.stringify({ theme: 'dark', enableRouter: true }));
    this.enqueueLog('attributes changed');
  }

  toggleList() { this.$data.showList = !this.$data.showList; }
  setFilter(filter: LabData['filter']) { if (this.$data.filter !== filter) this.$data.filter = filter; }

  pushTodo() {
    const id = this.$data.nextTodoId++;
    this.$data.todos.push({ id, title: `新任务 #${id}`, done: false });
  }

  popTodo() { this.$data.todos.pop(); }
  reverseTodos() { this.$data.todos.reverse(); }

  shuffleTodos() {
    const arr = this.$data.todos;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  spliceTodos() {
    if (this.$data.todos.length >= 1) {
      const lastIndex = this.$data.todos.length - 1;
      this.$data.todos.splice(lastIndex, 1, {
        id: this.$data.nextTodoId++,
        title: '替换项',
        done: false
      });
    }
  }

  toggleTodo(id: number) {
    const t = this.$data.todos.find(x => x.id === id);
    if (t) t.done = !t.done;
  }

  updateNested() {
    this.$data.user.name += ' *';
    this.$data.user.role = this.$data.user.role === 'guest' ? 'admin' : 'guest';
    this.$data.config.theme = this.$data.config.theme === 'light' ? 'dark' : 'light';
  }

  // 过滤后的列表，避免在模板中进行复杂表达式计算
  filteredTodos() {
    const f = this.$data.filter;
    return this.$data.todos.filter(t => f === 'all' ? true : f === 'done' ? t.done : !t.done);
  }

  // ---------------- 路由注册 ----------------
  private registerRouteComponents() {
    const register = (tagName: string, tpl: string) => {
      if (customElements.get(tagName)) return;
      class RouteComponent extends HTMLElement {
        private static tpl: HTMLTemplateElement;
        constructor() {
          super();
          if (!RouteComponent.tpl) {
            RouteComponent.tpl = document.createElement('template');
            RouteComponent.tpl.innerHTML = tpl;
          }
        }
        connectedCallback() {
          this.appendChild(RouteComponent.tpl.content.cloneNode(true));
        }
      }
      customElements.define(tagName, RouteComponent);
    };

    register('router-home', `
      <div class="lab-route home">
        <h3>Lab 首页</h3>
        <p>用于演示 router-view 的基本渲染。</p>
        <button onclick="window.location.hash = '#/about'">转到 About</button>
      </div>
    `);

    register('router-about', `
      <div class="lab-route about">
        <h3>Lab 关于</h3>
        <p>你可以点击下面按钮进入用户中心。</p>
        <button onclick="window.location.hash = '#/user/profile'">用户中心</button>
      </div>
    `);

    register('router-user-layout', `
      <div class="lab-route user-layout">
        <h3>用户中心</h3>
        <div class="nav">
          <button onclick="window.location.hash = '#/user/profile'">资料</button>
          <button onclick="window.location.hash = '#/user/settings'">设置</button>
        </div>
        <router-view></router-view>
      </div>
    `);

    register('router-user-profile', `
      <div class="lab-route user-profile">
        <h4>个人资料</h4>
        <p>这是嵌套路由中的子页面。</p>
      </div>
    `);

    register('router-user-settings', `
      <div class="lab-route user-settings">
        <h4>用户设置</h4>
        <p>用于测试嵌套路由。</p>
      </div>
    `);

    // 备用通配符页面（当前未在 routes 中使用）
    register('router-wildcard', `
      <div class="lab-route wildcard">
        <h4>通配符页面</h4>
        <p>匹配任意路径。</p>
      </div>
    `);
  }
}
