# Solely API 文档

## 目录

- [核心装饰器](#核心装饰器)
  - [@CustomElement](#customelement)
- [基类](#基类)
  - [BaseElement](#baseelement)
- [响应式系统](#响应式系统)
  - [observe](#observe)
  - [toRaw](#toraw)
- [路由系统](#路由系统)
  - [createRouter](#createrouter)
  - [Router 类](#router-类)
  - [RouterView](#routerview)
  - [RouterLink](#routerlink)
- [生命周期钩子](#生命周期钩子)
- [类型定义](#类型定义)

---

## 核心装饰器

### @CustomElement

类装饰器，用于将类注册为自定义元素。

```typescript
import { CustomElement, BaseElement } from 'solely';

@CustomElement({
  tagName: 'my-component',
  template: '<div>{{ $data.message }}</div>',
  styles: ':host { display: block; }',
  props: ['message'],
  shadowDOM: { use: true, mode: 'open' }
})
class MyComponent extends BaseElement<{ message: string }> {
  constructor() {
    super({ message: 'Hello' });
  }
}
```

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tagName` | `string` | ✓ | 自定义元素标签名，必须包含连字符 |
| `template` | `string \| Function` | - | HTML 模板字符串或预编译函数 |
| `styles` | `string` | - | 组件 CSS 样式 |
| `props` | `Array<string \| PropDescriptor>` | - | 属性定义列表 |
| `shadowDOM` | `{ use: boolean; mode?: 'open' \| 'closed' }` | - | Shadow DOM 配置 |
| `className` | `string` | - | 组件根元素类名 |

#### PropDescriptor

```typescript
interface PropDescriptor {
  name: string;       // 属性名（camelCase 或 kebab-case）
  type?: 'string' | 'number' | 'boolean' | 'object';  // 数据类型
  default?: any;      // 默认值
  reflect?: boolean;  // 是否同步回 HTML Attribute
}
```

**示例：**

```typescript
@CustomElement({
  tagName: 'user-card',
  props: [
    'name',                                    // 简写形式
    { name: 'age', type: 'number' },          // 带类型
    { name: 'is-vip', type: 'boolean', default: false },
    { name: 'config', type: 'object' }
  ]
})
class UserCard extends BaseElement<{
  name: string;
  age: number;
  isVip: boolean;
  config: any;
}> {
  constructor() {
    super({
      name: '',
      age: 0,
      isVip: false,
      config: {}
    });
  }
}
```

---

## 基类

### BaseElement

所有 Solely 组件的基类，继承自 `HTMLElement`。

```typescript
class MyComponent extends BaseElement<MyDataType> {
  // ...
}
```

#### 构造函数

```typescript
constructor(initialData: TData)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `initialData` | `TData` | 组件初始数据对象 |

#### 公共属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `$data` | `TData` | 组件响应式数据对象 |
| `$refs` | `Record<string, HTMLElement>` | 模板 ref 引用集合 |

#### 公共方法

##### refresh()

手动触发组件重新渲染。

```typescript
this.refresh();
```

##### emit()

触发自定义事件。

```typescript
emit(eventName: string, detail?: any, options?: Partial<CustomEventInit>): void
```

**示例：**

```typescript
// 触发简单事件
this.emit('change');

// 带数据的事件
this.emit('update', { id: 1, value: 'new' });

// 自定义事件选项
this.emit('custom', data, { bubbles: false, composed: false });
```

---

## 响应式系统

### observe

创建对象的响应式代理，监听数据变化。

```typescript
import { observe, ChangeItem } from 'solely';

const { proxy, unobserve, resume } = observe(
  target,
  (change: ChangeItem) => {
    console.log('数据变化:', change);
  },
  options
);
```

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target` | `object` | ✓ | 要观察的目标对象 |
| `callback` | `(change: ChangeItem) => void` | ✓ | 变化回调函数 |
| `options` | `ObserveOptions` | - | 观察选项 |

#### ObserveOptions

```typescript
interface ObserveOptions {
  throttle?: number;              // 节流时间（毫秒）
  onBatch?: (changes: ChangeItem[]) => void;  // 批量变化回调
  immediate?: boolean;            // 是否立即触发初始值
  filter?: string | string[];     // 路径过滤模式
  deepCompare?: boolean;          // 是否深度比较
}
```

#### ChangeItem

```typescript
type ChangeItem = {
  path: (string | symbol)[];  // 变化路径
} & (
  | { type: 'set'; key: string | symbol; newValue: unknown; oldValue: unknown }
  | { type: 'delete'; key: string | symbol; oldValue: unknown }
  | { type: 'array-push'; index: number; values: unknown[] }
  | { type: 'array-splice'; index: number; deleteCount: number; insert: unknown[] }
  | { type: 'array-replace'; oldValue: unknown[]; newValue: unknown[] }
  | { type: 'array-reset'; method: string }
);
```

#### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `proxy` | `T` | 响应式代理对象 |
| `unobserve` | `() => void` | 停止观察 |
| `resume` | `() => void` | 恢复观察 |

**示例：**

```typescript
import { observe } from 'solely';

const data = { count: 0, user: { name: 'Tom' } };

const { proxy, unobserve } = observe(
  data,
  (change) => {
    console.log(`${change.path.join('.')}:`, change);
  },
  { throttle: 16 }  // 16ms 节流
);

proxy.count++;  // 触发回调
proxy.user.name = 'Jerry';  // 嵌套对象变化也会触发

unobserve();  // 停止观察
```

### toRaw

获取响应式对象的原始对象。

```typescript
import { toRaw } from 'solely';

const raw = toRaw(proxy);
```

---

## 路由系统

### createRouter

创建路由实例（单例模式）。

```typescript
import { createRouter, RouteConfig } from 'solely';

const routes: RouteConfig[] = [
  { path: '/', tagName: 'home-page', name: 'home' },
  { path: '/about', tagName: 'about-page' },
  { path: '/user/:id', tagName: 'user-page' },
  { 
    path: '/products',
    tagName: 'product-list',
    children: [
      { path: ':id', tagName: 'product-detail' }
    ]
  }
];

const router = createRouter({
  routes,
  mode: 'hash',  // 或 'history'
  base: '/app',
  beforeEach: (to, from) => {
    // 导航守卫
    return true;  // 返回 false 取消导航
  },
  afterEach: (to, from) => {
    // 导航完成回调
  }
});
```

#### RouterOptions

```typescript
interface RouterOptions {
  routes: RouteConfig[];           // 路由配置数组
  base?: string;                   // 基础路径
  mode?: 'hash' | 'history';       // 路由模式
  beforeEach?: NavigationGuard;    // 全局前置守卫
  afterEach?: (to: RouteMatch, from: RouteMatch) => void;  // 全局后置钩子
}
```

#### RouteConfig

```typescript
interface RouteConfig {
  path: string;                    // 路由路径
  tagName?: string;                // 组件标签名
  component?: () => Promise<any>;  // 异步加载函数
  name?: string;                   // 路由名称
  keepAlive?: boolean;             // 是否缓存组件
  forceReload?: boolean;           // 是否强制重新加载
  redirect?: string;               // 重定向路径
  props?: Record<string, any>;     // 传递给组件的属性
  meta?: Record<string, any>;      // 路由元信息
  children?: RouteConfig[];        // 嵌套子路由
  async?: boolean;                 // 是否为异步路由
}
```

### Router 类

#### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `modeType` | `'hash' \| 'history'` | 当前路由模式 |

#### 方法

##### navigate()

导航到指定路径。

```typescript
navigate(path: string, options?: { replace?: boolean }): Promise<NavigationResult>
```

##### push()

使用 pushState 导航。

```typescript
push(path: string): Promise<NavigationResult>
```

##### replace()

使用 replaceState 导航。

```typescript
replace(path: string): Promise<NavigationResult>
```

##### pushWithQuery()

导航并设置查询参数。

```typescript
pushWithQuery(path: string, query: Record<string, string>): Promise<NavigationResult>
```

##### getCurrentRoute()

获取当前路由信息。

```typescript
getCurrentRoute(): RouteMatch | null
```

##### matchRoute()

匹配路径到路由配置。

```typescript
matchRoute(path: string): RouteMatch | null
```

##### listen()

监听路由变化。

```typescript
listen(callback: () => void): () => void
```

**示例：**

```typescript
// 监听路由变化
const unlisten = router.listen(() => {
  console.log('路由变化:', router.getCurrentRoute());
});

// 取消监听
unlisten();
```

##### resolve()

解析路径为完整 URL。

```typescript
resolve(path: string): string
```

#### RouteMatch

```typescript
interface RouteMatch {
  fullPath: string;                // 完整路径
  params: Record<string, string>;  // 路径参数
  query: Record<string, string>;   // 查询参数
  matched: MatchedRoute[];         // 匹配的路由链
  meta: Record<string, any>;       // 合并的元信息
}
```

### RouterView

路由视图组件，自动渲染匹配的路由组件。

```html
<router-view></router-view>
```

**特性：**

- 自动根据当前路由渲染对应组件
- 支持嵌套路由
- 支持组件缓存（keepAlive）
- 支持路由层级检测

### RouterLink

路由链接组件，用于导航。

```html
<router-link href="/about">关于</router-link>
<router-link href="/user/123" active-class="active">用户</router-link>
```

**属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `href` | `string` | 目标路径 |
| `replace` | `boolean` | 是否使用 replace 模式 |
| `active-class` | `string` | 激活状态类名 |

---

## 生命周期钩子

### created()

组件创建完成时调用（异步，在构造函数微任务中执行）。

```typescript
created(): void
```

### mounted()

组件挂载到 DOM 时调用（首次渲染后）。

```typescript
mounted(): void
```

### onInit()

在 `mounted()` 之后调用，支持返回 Promise，适用于需要异步初始化的场景。

```typescript
onInit(): void | Promise<void>
```

### beforeUpdate()

组件更新前调用。

```typescript
beforeUpdate(): void
```

### updated()

组件更新后调用。

```typescript
updated(): void
```

### unmounted()

组件从 DOM 移除时调用。

```typescript
unmounted(): void
```

### attributeChanged()

属性变化时调用。

```typescript
attributeChanged(name: string, oldValue: any, newValue: any): void
```

**生命周期流程：**

```
构造函数
  ↓
created() (异步微任务)
  ↓
connectedCallback
  ↓
mounted() (首次渲染后)
  ↓
onInit() (异步)
  ↓
beforeUpdate() → 渲染 → updated() (数据变化时)
  ↓
disconnectedCallback
  ↓
unmounted()
```

---

## 类型定义

### 完整类型导出

```typescript
import {
  // 装饰器
  CustomElement,
  Manifest,
  PropDescriptor,
  PropType,
  
  // 基类
  BaseElement,
  
  // 响应式
  observe,
  toRaw,
  ChangeItem,
  ObserveOptions,
  ObserveReturn,
  
  // 路由
  createRouter,
  getRouter,
  routerReady,
  Router,
  RouteConfig,
  RouteMatch,
  MatchedRoute,
  NavigationGuard,
  RouterOptions,
  NavigationResult
} from 'solely';
```

---

## 最佳实践

### 1. 组件设计

```typescript
// 定义数据类型
interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

interface TodoData {
  items: TodoItem[];
  newTodo: string;
}

@CustomElement({
  tagName: 'todo-list',
  template: `
    <div class="todo-app">
      <input s-model="$data.newTodo" @keyup.enter="addTodo()">
      <button @click="addTodo()">添加</button>
      <ul>
        <For each="$data.items" item="todo">
          <li :class="{ done: todo.done }">
            <input type="checkbox" :checked="todo.done" @change="toggle(todo)">
            <span>{{ todo.text }}</span>
            <button @click="remove(todo)">删除</button>
          </li>
        </For>
      </ul>
    </div>
  `,
  styles: `
    .todo-app { padding: 20px; }
    .done { text-decoration: line-through; }
  `
})
class TodoList extends BaseElement<TodoData> {
  constructor() {
    super({
      items: [],
      newTodo: ''
    });
  }

  addTodo() {
    if (!this.$data.newTodo.trim()) return;
    
    this.$data.items.push({
      id: Date.now(),
      text: this.$data.newTodo,
      done: false
    });
    this.$data.newTodo = '';
  }

  toggle(todo: TodoItem) {
    todo.done = !todo.done;
  }

  remove(todo: TodoItem) {
    const index = this.$data.items.indexOf(todo);
    if (index > -1) {
      this.$data.items.splice(index, 1);
    }
  }
}
```

### 2. 路由配置

```typescript
const routes: RouteConfig[] = [
  {
    path: '/',
    tagName: 'home-page',
    name: 'home',
    meta: { title: '首页' }
  },
  {
    path: '/about',
    tagName: 'about-page',
    meta: { title: '关于' }
  },
  {
    path: '/dashboard',
    tagName: 'dashboard-layout',
    meta: { requiresAuth: true },
    children: [
      { path: '', tagName: 'dashboard-home' },
      { path: 'settings', tagName: 'dashboard-settings' },
      { path: 'profile/:id', tagName: 'user-profile' }
    ]
  },
  {
    path: '/products',
    component: async () => {
      // 懒加载
      await import('./pages/products.js');
      return 'product-list';
    }
  },
  { path: '/:pathMatch(.*)*', tagName: 'not-found-page' }
];

const router = createRouter({
  routes,
  mode: 'history',
  beforeEach: (to, from) => {
    // 权限检查
    if (to.meta.requiresAuth && !isAuthenticated()) {
      router.push('/login');
      return false;
    }
    return true;
  },
  afterEach: (to) => {
    // 更新页面标题
    document.title = to.meta.title || 'Solely App';
  }
});
```

### 3. 响应式数据管理

```typescript
// 创建全局状态
const globalState = observe(
  { user: null, isLoggedIn: false },
  (change) => {
    console.log('全局状态变化:', change);
  }
);

// 在组件中使用
@CustomElement({
  tagName: 'user-profile',
  template: `
    <div>
      <If test="$data.isLoggedIn">
        <p>欢迎, {{ $data.user.name }}</p>
      </If>
    </div>
  `
})
class UserProfile extends BaseElement<any> {
  constructor() {
    super(globalState.proxy);
  }
}
```
