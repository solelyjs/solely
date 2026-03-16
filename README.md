# Solely - 轻量级 Web 组件框架

<div align="center">

![Solely Logo](https://raw.githubusercontent.com/solelyjs/solely/main/public/solely.svg)

**一个轻量级、现代化的 Web 组件开发框架**

[![npm version](https://img.shields.io/npm/v/solely.svg)](https://www.npmjs.com/package/solely)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

</div>

## ✨ 核心特性

- **🚀 高性能**：轻量级架构，零运行时依赖，快速渲染
- **🔧 类型安全**：完整的 TypeScript 支持，类型提示完善
- **🎨 强大模板**：基于 AST 的模板编译，支持条件渲染和列表渲染
- **⚡ 响应式系统**：高效的响应式数据绑定，自动追踪依赖
- **🧩 Web 组件**：原生 Web 组件支持，可自定义元素
- **📦 插件系统**：灵活的插件扩展机制
- **🧪 测试完善**：完整的单元测试覆盖
- **🗺️ 路由支持**：内置路由系统，支持单页应用开发

## 📦 安装

```bash
# 使用 npm
npm install solely

# 使用 yarn
yarn add solely

# 使用 pnpm
pnpm add solely
```

## 🎯 快速开始

### 1. 创建一个简单的组件

创建一个 TypeScript 文件：

```typescript
// counter.ts
import { BaseElement, CustomElement } from 'solely';

@CustomElement({
  tagName: 'my-counter',
  template: `
    <div class="counter">
      <h2>计数器: {{ $data.count }}</h2>
      <button @click="$data.count++">增加</button>
    </div>
  `,
  props: [
    { name: 'count', type: 'number' }
  ],
  styles: `
    .counter {
      text-align: center;
      padding: 20px;
    }
    button {
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
    }
  `
})
class MyCounter extends BaseElement<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }
}
```

### 2. 在 HTML 中使用

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solely 示例</title>
  <script type="module" src="./counter.ts"></script>
</head>
<body>
  <my-counter></my-counter>
</body>
</html>
```

## 📚 模板语法

所有模板必须是 **合法 HTML**；框架会提前编译成高效更新函数，无运行时解析开销。

### 语法对照表

| 功能 | 推荐语法 | 兼容语法 | 完整示例 |
|---|---|---|---|
| **文本插值** | `{{ 表达式 }}` | `{{ 表达式 }}` | `<span>{{ $data.msg }}</span>` |
| **属性绑定** | `:属性名="表达式"` | `s-属性名="表达式"` | `<img :src="$data.url" s-alt="$data.name">` |
| **布尔属性** | `:属性名="表达式"` | `s-属性名="表达式"` | `<button :disabled="$data.loading">提交</button>` |
| **双向绑定** | `s-model="字段路径"` | `s-model="字段路径"` | `<input s-model="$data.username">` |
| **原始事件** | `@事件名="语句"` | `on-事件名="语句"` | `<button @click="$data.count++">增加</button>` |
| **条件渲染** | `<If test="表达式">` | `<If condition="表达式">` | `<If test="$data.ok"><p>成功</p></If>` |
| **列表渲染** | `<For each="数组" item="项变量">` | `<For each="数组" item="项变量">` | `<For each="$data.list" item="it">{{ it }}</For>` |
| **动态类** | `:class="对象/数组/字符串"` | `s-class="对象/数组/字符串"` | `<div :class="{ active: $data.isActive }">` |
| **动态样式** | `:style="对象"` | `s-style="对象"` | `<div :style="{ color: $data.c }">` |

### 详细语法说明

#### 1. 文本插值

使用 `{{ 表达式 }}` 在模板中插入动态文本：

```html
<h1>Hello, {{ $data.name }}!</h1>
<p>总数: {{ $data.items.length }}</p>
<p>{{ $data.price * $data.quantity }}</p>
```

#### 2. 属性绑定

使用 `:属性名` 绑定动态属性（推荐）：

```html
<img :src="$data.imageUrl" :alt="$data.imageAlt">
<a :href="$data.linkUrl">访问链接</a>
```

兼容语法：

```html
<img s-src="$data.imageUrl" s-alt="$data.imageAlt">
<a s-href="$data.linkUrl">访问链接</a>
```

#### 3. 布尔属性

当表达式为真值时才会输出属性：

```html
<button :disabled="$data.isLoading">提交</button>
<input :checked="$data.isAgreed">
```

兼容语法：

```html
<button s-disabled="$data.isLoading">提交</button>
<input s-checked="$data.isAgreed">
```

#### 4. 双向绑定

使用 `s-model` 实现表单双向绑定（推荐）：

```html
<input s-model="$data.username">
<textarea s-model="$data.content"></textarea>
<select s-model="$data.selectedId">
  <option value="1">选项1</option>
  <option value="2">选项2</option>
</select>
```

兼容语法：

```html
<input s-model="$data.username">
<textarea s-model="$data.content"></textarea>
<select s-model="$data.selectedId">
  <option value="1">选项1</option>
  <option value="2">选项2</option>
</select>
```

#### 5. 事件处理

使用 `@事件名` 绑定事件，可直接读写 `$data`（推荐）：

```html
<button @click="$data.count++">增加</button>
<button @click="$data.items.push($data.newItem); $data.newItem=''">添加</button>
<input @input="$data.searchText = event.target.value">
```

兼容语法：

```html
<button onclick="$data.count++">增加</button>
<button onclick="$data.items.push($data.newItem); $data.newItem=''">添加</button>
<input oninput="$data.searchText = event.target.value">
```

#### 6. 条件渲染

使用 `<If>`、`<ElseIf>`、`<Else>` 进行条件渲染：

```html
<If test="$data.isLoggedIn">
  <p>欢迎回来，{{ $data.username }}!</p>
</If>
<ElseIf test="$data.isLoading">
  <p>加载中...</p>
</ElseIf>
<Else>
  <p>请登录</p>
</Else>
```

兼容语法：

```html
<If condition="$data.isLoggedIn">
  <p>欢迎回来，{{ $data.username }}!</p>
</If>
<ElseIf condition="$data.isLoading">
  <p>加载中...</p>
</ElseIf>
<Else>
  <p>请登录</p>
</Else>
```

#### 7. 列表渲染

使用 `<For>` 渲染列表：

```html
<ul>
  <For each="$data.items" item="item" index="i">
    <li>{{ i + 1 }}. {{ item.name }}</li>
  </For>
</ul>
```

兼容语法：

```html
<ul>
  <For each="$data.items" item="item" index="i">
    <li>{{ i + 1 }}. {{ item.name }}</li>
  </For>
</ul>
```

#### 8. 动态类

使用 `:class` 动态控制 CSS 类（推荐）：

```html
<div :class="{ active: $data.isActive, 'has-error': $data.hasError }">
  内容
</div>
<!-- 也支持数组和字符串 -->
<div :class="[$data.class1, $data.class2]">内容</div>
```

兼容语法：

```html
<div s-class="{ active: $data.isActive, 'has-error': $data.hasError }">
  内容
</div>
<!-- 也支持数组和字符串 -->
<div s-class="[$data.class1, $data.class2]">内容</div>
```

#### 9. 动态样式

使用 `:style` 动态设置样式（推荐）：

```html
<div :style="{ color: $data.textColor, fontSize: $data.fontSize + 'px' }">
  动态样式
</div>
```

兼容语法：

```html
<div s-style="{ color: $data.textColor, fontSize: $data.fontSize + 'px' }">
  动态样式
</div>
```

## 🏗️ 技术架构

Solely 采用模块化设计，主要由以下部分组成：

```
solely/
├── compiler/          # 模板编译器
│   ├── ir/           # 中间表示层
│   └── parser/       # AST 解析器
├── runtime/          # 运行时核心
│   ├── component/    # 组件基类和装饰器
│   ├── reactivity/   # 响应式系统
│   ├── renderer/     # 渲染器
│   └── router/       # 路由系统
├── shared/           # 共享工具函数
├── types/            # TypeScript 类型定义
├── plugins/          # 插件系统
└── tests/            # 测试文件
```

### 核心模块说明

1. **编译器**：将模板转换为高效的渲染函数，支持 AST 解析和中间表示优化
2. **运行时**：包含组件系统、响应式系统、渲染器和路由系统
3. **响应式系统**：基于 Proxy 的响应式数据绑定，自动追踪依赖
4. **路由系统**：支持单页应用的路由管理，包括路由定义、导航和组件挂载
5. **插件系统**：提供扩展机制，支持自定义功能

## 🔧 API 参考

### CustomElement 装饰器

组件的注册装饰器，用于定义组件的元信息：

```typescript
@CustomElement({
  tagName: 'my-component',     // 必须：组件标签名
  template: '...',             // 必须：HTML 模板字符串
  props: [...],                // 可选：属性定义
  styles: '...',               // 可选：组件样式
  shadowDOM: { use: true }     // 可选：使用 Shadow DOM
})
class MyComponent extends BaseElement<MyData> {
  // 组件逻辑
}
```

### BaseElement

组件的基类，提供响应式属性、生命周期钩子和渲染方法。

#### 生命周期钩子

Solely 提供了完整的生命周期钩子函数，用于在组件的不同阶段执行自定义逻辑：

| 钩子函数 | 调用时机 | 说明 |
|---|---|---|
| `created()` | 组件实例创建后 | 在组件构造函数执行完成后调用，此时组件尚未挂载到 DOM |
| `mounted()` | 组件挂载到 DOM 后 | 组件首次渲染完成后调用，可在此进行 DOM 操作 |
| `beforeUpdate()` | 数据更新前 | 在组件数据更新导致重新渲染前调用 |
| `updated()` | 数据更新后 | 在组件数据更新导致重新渲染后调用 |
| `unmounted()` | 组件从 DOM 移除后 | 组件被销毁时调用，可在此清理资源 |
| `attributeChanged(name, oldValue, newValue)` | 属性变化时 | 当组件的观察属性发生变化时调用 |
| `beforeAttributesUpdate()` | 属性更新前 | 在属性更新导致重新渲染前调用 |
| `afterAttributesUpdate()` | 属性更新后 | 在属性更新导致重新渲染后调用 |
| `onInit()` | 组件初始化后 | 组件挂载完成后调用，支持异步操作 |

#### 示例代码

```typescript
class MyComponent extends BaseElement<MyData> {
  constructor() {
    super({ /* 初始数据 */ });
  }

  // 组件实例创建后调用
  created() {
    console.log('组件实例已创建');
  }

  // 组件挂载到 DOM 后调用
  mounted() {
    console.log('组件已挂载到 DOM');
    // 可在此进行 DOM 操作
  }

  // 数据更新前调用
  beforeUpdate() {
    console.log('组件即将更新');
  }

  // 数据更新后调用
  updated() {
    console.log('组件已更新');
  }

  // 组件从 DOM 移除后调用
  unmounted() {
    console.log('组件已卸载');
    // 可在此清理资源
  }

  // 属性变化时调用
  attributeChanged(name, oldValue, newValue) {
    console.log(`属性 ${name} 从 ${oldValue} 变为 ${newValue}`);
  }

  // 组件初始化后调用，支持异步操作
  async onInit() {
    console.log('组件初始化中');
    // 可在此进行异步操作，如数据获取
    await fetchData();
    console.log('组件初始化完成');
  }
}
```

#### 核心方法

| 方法 | 说明 | 参数 | 返回值 |
|---|---|---|---|
| `$data` | 获取/设置组件数据 | 新数据对象（设置时） | 当前数据对象 |
| `refresh()` | 手动触发组件刷新 | 无 | 无 |
| `emit(eventName, detail, options)` | 派发自定义事件 | eventName: 事件名<br>detail: 事件详情<br>options: 事件选项 | 无 |

### observe

创建响应式数据对象，用于非组件场景的响应式数据：

```typescript
import { observe } from 'solely';

const state = observe({
  name: 'Solely',
  items: [1, 2, 3]
}, (path, newValue, oldValue) => {
  console.log('数据变化:', path, oldValue, '->', newValue);
});

state.name = 'New Name'; // 触发回调
```

### 路由系统

Solely 提供了功能强大的内置路由系统，支持单页应用开发，包括路由定义、导航、参数传递、路由守卫等功能。

#### 路由配置

首先，定义路由配置：

```typescript
import { createRouter } from 'solely';

const routes = [
  { path: '/', tagName: 'home-page' },
  { path: '/about', tagName: 'about-page' },
  { path: '/users/:id', tagName: 'user-detail' },
  { path: '*', tagName: 'not-found' } // 404 页面
];

const router = createRouter({
  routes,
  base: '/', // 基础路径
  mode: 'history' // 路由模式：'hash' | 'history'
});

// 启动路由监听
router.setupListeners();
```

#### 路由配置选项

| 选项 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `path` | `string` | 路由路径，支持动态参数 | `'/users/:id'` |
| `tagName` | `string` | 组件标签名 | `'user-detail'` |
| `component` | `Function` | 异步组件加载函数 | `() => import('./pages/user.js')` |
| `name` | `string` | 路由名称 | `'user'` |
| `keepAlive` | `boolean` | 是否缓存组件实例 | `true` |
| `forceReload` | `boolean` | 是否强制重新加载 | `true` |
| `redirect` | `string` | 重定向路径 | `'/login'` |
| `props` | `Object` | 传递给组件的属性 | `{ title: '用户详情' }` |
| `meta` | `Object` | 路由元信息 | `{ requiresAuth: true }` |
| `children` | `RouteConfig[]` | 嵌套子路由 | `[{ path: 'profile', tagName: 'user-profile' }]` |

#### 路由导航

使用路由方法进行页面导航：

```typescript
// 基本导航
router.push('/about');

// 替换当前历史记录
router.replace('/about');

// 带查询参数
router.pushWithQuery('/search', { q: 'solely', page: '1' });

// 返回上一页
router.back();

// 解析路径为真实 URL
const url = router.resolve('/users/1'); // 根据模式返回 #/users/1 或 /users/1
```

#### 路由参数

获取路由参数：

```typescript
// 获取当前路由信息
const currentRoute = router.getCurrentRoute();

if (currentRoute) {
  // 获取路径参数
  console.log(currentRoute.params.id); // 从 /users/:id 中获取 id

  // 获取查询参数
  console.log(currentRoute.query.q); // 从 ?q=solely 中获取 q

  // 获取完整路径
  console.log(currentRoute.fullPath); // /users/123?q=solely

  // 获取路由元信息
  console.log(currentRoute.meta); // { requiresAuth: true }

  // 获取匹配的路由层级
  console.log(currentRoute.matched); // 匹配的路由数组
}
```

#### 路由守卫

Solely 支持全局路由守卫，用于控制导航流程：

```typescript
// 创建路由时配置守卫
const router = createRouter({
  routes,
  beforeEach: async (to, from) => {
    // 验证权限
    if (to.meta.requiresAuth && !isLoggedIn) {
      return '/login'; // 重定向到登录页
    }

    // 阻止导航
    if (to.path === '/admin' && !isAdmin) {
      return false;
    }

    // 允许导航
    return true;
  },
  afterEach: (to, from) => {
    // 导航完成后执行
    console.log('从', from.fullPath, '导航到', to.fullPath);
    document.title = to.meta.title || 'Solely App';
  }
});
```

#### 嵌套路由

Solely 支持嵌套路由，实现复杂的页面结构：

```typescript
const routes = [
  {
    path: '/user',
    tagName: 'user-layout',
    children: [
      { path: 'profile', tagName: 'user-profile' },
      { path: 'settings', tagName: 'user-settings' },
      { path: ':id', tagName: 'user-detail' }
    ]
  }
];

// 对应的 URL：
// /user/profile
// /user/settings
// /user/123
```

#### 异步路由

支持异步组件加载，实现代码分割：

```typescript
const routes = [
  {
    path: '/dashboard',
    component: async () => {
      const module = await import('./pages/dashboard.js');
      return module.default; // 返回包含 tagName 的对象
    }
  }
];
```

#### 路由缓存

使用 `keepAlive` 选项缓存组件实例，提升切换性能：

```typescript
const routes = [
  {
    path: '/profile',
    tagName: 'user-profile',
    keepAlive: true // 缓存组件实例
  }
];
```

#### 路由模式

Solely 支持两种路由模式：

| 模式 | 说明 | URL 格式 | 适用场景 |
|---|---|---|---|
| `hash` | 基于 URL hash | `#/users/123` | 兼容旧浏览器，无需服务器配置 |
| `history` | 基于 HTML5 History API | `/users/123` | 更美观的 URL，需要服务器支持 |

```typescript
// Hash 模式（默认）
const router = createRouter({
  routes,
  mode: 'hash'
});

// History 模式
const router = createRouter({
  routes,
  mode: 'history',
  base: '/app' // 应用基础路径
});
```

#### 路由监听

监听路由变化：

```typescript
// 添加监听器
const unsubscribe = router.listen(() => {
  console.log('路由已变化');
});

// 移除监听器
unsubscribe();
```

#### 路由组件

Solely 提供了两个内置的路由组件：

**router-link**

```html
<!-- 基本用法 -->
<router-link to="/about">关于我们</router-link>

<!-- 带激活状态 -->
<router-link to="/users" active-class="active">用户列表</router-link>

<!-- 精确匹配 -->
<router-link to="/users" exact>用户列表</router-link>

<!-- 自定义链接内容 -->
<router-link to="/profile">
  <img src="avatar.png" alt="个人资料">
  <span>个人资料</span>
</router-link>

<!-- 自定义模式（移除 a 标签包裹） -->
<router-link to="/dashboard" custom>
  <button @click="event.preventDefault()">仪表盘</button>
</router-link>

<!-- 预加载路由 -->
<router-link to="/heavy-page" prefetch>重型页面</router-link>
```

**router-view**

```html
<!-- 基本用法 -->
<router-view></router-view>

<!-- 嵌套路由视图 -->
<div class="layout">
  <aside>
    <router-link to="/user/profile">个人资料</router-link>
    <router-link to="/user/settings">设置</router-link>
  </aside>
  <main>
    <router-view></router-view>
  </main>
</div>
```

#### 路由匹配规则

Solely 的路由匹配遵循以下优先级：

1. **精确匹配**：完全匹配路径
2. **动态参数**：`/users/:id` 匹配 `/users/123`
3. **通配符**：`*` 匹配所有未匹配的路径

```typescript
const routes = [
  { path: '/users', tagName: 'user-list' },      // 精确匹配 /users
  { path: '/users/:id', tagName: 'user-detail' }, // 匹配 /users/123
  { path: '*', tagName: 'not-found' }           // 匹配所有其他路径
];
```

#### 路由元信息

使用路由元信息存储自定义数据：

```typescript
const routes = [
  {
    path: '/admin',
    tagName: 'admin-panel',
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: '管理面板'
    }
  }
];

// 在守卫中使用
beforeEach: (to, from) => {
  if (to.meta.requiresAuth && !isLoggedIn) {
    return '/login';
  }
}
```

## 📖 示例项目

查看 [examples](./examples) 目录获取更多示例：

- **计数器示例** (`examples/counter/`) - 基础交互示例
- **待办事项示例** (`examples/todo/`) - 列表管理和状态示例
- **表单示例** (`examples/form/`) - 表单处理和验证示例
- **天气示例** (`examples/weather/`) - 异步数据获取示例

### 运行示例

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问示例
# 打开浏览器访问 http://localhost:5173/examples/
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行测试并查看 UI
npm run test:ui

# 生成测试覆盖率报告
npm run test:coverage
```

## 🔧 构建和开发

```bash
# 构建生产版本
npm run build

# 本地预览构建结果
npm run preview

# 全局链接（用于本地测试）
npm run link

# 本地打包（用于其他项目引用）
npm run pack:local
```

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. **Fork 仓库**：在 GitHub 上 fork 本项目
2. **克隆仓库**：`git clone https://github.com/your-username/solely.git`
3. **创建分支**：`git checkout -b feature/your-feature`
4. **安装依赖**：`npm install`
5. **开发和测试**：编写代码并运行测试
6. **提交代码**：`git commit -m "Add your feature"`
7. **推送到远程**：`git push origin feature/your-feature`
8. **创建 Pull Request**：在 GitHub 上创建 PR

### 代码规范

- 遵循 TypeScript 编码规范
- 确保所有测试通过
- 保持代码风格一致
- 提供清晰的注释

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢所有为这个项目做出贡献的人！

---

**Happy Coding with Solely! 🚀**
