# Solely

基于 Web Components 的轻量级响应式框架  
< 10 kB（gzip）· 零依赖 · TypeScript 友好 · 单文件即可跑

---

## 项目简介

Solely 是一款基于 Web Components 标准的轻量级前端框架，专为简化小型项目开发而设计。它保留了与原生 JavaScript/TypeScript 的高兼容性，同时提供了现代前端框架的核心功能：响应式数据绑定、虚拟 DOM 渲染、组件化开发、简单路由。

核心优势  

1. 简化复杂性：设计简洁，与原生 JS/TS 语法保持一致  
2. 响应式系统：基于 Proxy 的深度响应式  
3. 虚拟 DOM：轻量级 diff，批量更新  
4. 组件化：继承 `BaseElement` + `@CustomElement` 装饰器  
5. 完整 TypeScript 泛型支持  
6. 内置 hash 路由，单页应用开箱即用  

适用于快速原型、嵌入式小部件、不愿引入大型框架的场景。

---

## 安装

```bash
npm i solely
```

---

## 快速开始（最小可跑示例）

```ts
import { BaseElement, CustomElement } from 'solely'

@CustomElement({
  tagName: 'hello-world',
  template: `
    <div class="box">
      <h1>{{ $data.title }}</h1>
      <button onclick="this.$data.count++">Count: {{ $data.count }}</button>
    </div>`,
  styles: `
    .box { padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
    button { margin-top: 8px; }`,
  shadowDOM: { use: true }
})
class HelloWorld extends BaseElement<{ title: string; count: number }> {
  onInit() {
    this.$data = { title: 'Hello Solely', count: 0 }
  }
}
```

```html
<body>
  <hello-world></hello-world>
  <script type="module" src="/src/main.ts"></script>
</body>
```

本地克隆体验  

```bash
git clone <repo>
cd solely
npm i
npm run dev        # http://localhost:5173/ 查看 examples/
```

---

## 模板语法速查

> 所有模板必须是**合法 HTML**；框架会提前编译成高效更新函数，无运行时解析开销。

| 功能 | 语法格式 | 完整示例 |
|---|---|---|
| **文本插值** | `{{ 表达式 }}` | `<span>{{ $data.msg }}</span>` |
| **属性绑定** | `s-属性名="表达式"` | `<img s-src="$data.url" s-alt="$data.name">` |
| **布尔属性** | `s-属性名="表达式"`（真值才输出） | `<button s-disabled="$data.loading">提交</button>` |
| **双向绑定** | `s-model="字段路径"` | `<input s-model="$data.username">` |
| **原始事件** | `on事件名="语句"`（可直读 `$data`） | `<button onclick="$data.count++">+</button>` |
| **条件渲染** | `<If condition="表达式">...</If>`<br>`<ElseIf condition="...">...</ElseIf>`<br>`<Else>..</Else>` | `<If condition="$data.ok"><p>成功</p></If>` |
| **列表渲染** | `<For each="数组" item="项变量" index="下标变量">...</For>` | `<For each="$data.list" item="it">{{ it }}</For>` |
| **动态类** | `s-class="对象/数组/字符串"` | `<div s-class="{ active: $data.isActive }">` |
| **动态样式** | `s-style="对象"` | `<div s-style="{ color: $data.c }">` |

---

### 1. 文本插值

```html
<!-- 基本 -->
<p>{{ $data.message }}</p>

<!-- 表达式 -->
<p>总价：{{ $data.price * $data.quantity }}</p>

<!-- 三元 -->
<span>{{ $data.online ? '在线' : '离线' }}</span>

<!-- 函数调用 -->
<div>{{ this.formatDate($data.date) }}</div>
```

---

### 2. 属性绑定

```html
<!-- 普通属性 -->
<img s-src="$data.avatar" s-alt="$data.name">
<a s-href="$data.link">跳转</a>

<!-- data-* 属性 -->
<div s-data-user-id="$data.uid"></div>

<!-- class 拼接 -->
<div class="btn" s-class="$data.variant"></div>
```

---

### 3. 布尔属性

```html
<button s-disabled="$data.isSubmitting">提交中…</button>
<input type="checkbox" s-checked="$data.selected">
```

---

### 4. 双向绑定 `s-model`

```html
<!-- 文本 -->
<input type="text" s-model="$data.username">

<!-- 多行 -->
<textarea s-model="$data.desc"></textarea>

<!-- 单选按钮组 -->
<label><input type="radio" name="sex" value="m" s-model="$data.sex"> 男</label>
<label><input type="radio" name="sex" value="f" s-model="$data.sex"> 女</label>

<!-- 单个复选框 -->
<input type="checkbox" s-model="$data.agree"> 同意协议

<!-- 单选下拉框 -->
<select s-model="$data.city">
  <option value="">请选择</option>
  <option value="beijing">北京</option>
  <option value="shanghai">上海</option>
  <option value="guangzhou">广州</option>
</select>

<!-- 多选下拉框（重要：绑定值建议是数组类型） -->
<select multiple s-model="$data.selectedCities">
  <option value="beijing">北京</option>
  <option value="shanghai">上海</option>
  <option value="guangzhou">广州</option>
  <option value="shenzhen">深圳</option>
</select>

<!-- 初始化示例 -->
<!-- this.$data = {
     selectedCities: ['beijing', 'shanghai']
   } -->
```

---

### 5. 条件渲染

```html
<If condition="$data.isLoggedIn">
  <p>欢迎，{{ $data.name }}！</p>
</If>
<Else>
  <p>请先登录</p>
</Else>
```

---

### 6. 列表渲染

```html
<!-- 基本 -->
<ul>
  <For each="$data.users" item="user" index="i">
    <li>{{ i + 1 }}. {{ user.name }}</li>
  </For>
</ul>

<!-- 带唯一 key（推荐） -->
<For each="$data.products" item="p">
  <div class="item" s-data-id="p.id">{{ p.name }}</div>
</For>

<!-- 嵌套循环 -->
<For each="$data.categories" item="cat">
  <h3>{{ cat.name }}</h3>
  <ul>
    <For each="cat.items" item="it">
      <li>{{ it }}</li>
    </For>
  </ul>
</For>
```

---

### 7. 动态类

```html
<!-- 对象 -->
<div s-class="{ active: $data.isActive, error: $data.err }"></div>

<!-- 数组 -->
<div s-class="[$data.base, $data.isActive ? 'on' : 'off']"></div>

<!-- 字符串 -->
<div s-class="$data.statusClass"></div>
```

---

### 8. 动态样式

```html
<!-- 基本 -->
<div s-style="{ color: $data.c, fontSize: $data.fs + 'px' }"></div>

<!-- 条件 -->
<div s-style="{ backgroundColor: $data.ok ? '#0f0' : '#f00' }"></div>

<!-- 直接绑对象 -->
<div s-style="$data.styleObj"></div>
```

---

### 9. 表达式限制

- 支持任意**纯 JS 表达式**；  
- 禁止 `eval`、`Function`、`setTimeout`、`setInterval` 等副作用代码；  
- 绑定函数在每次渲染都会执行，请保持**纯函数**以保证性能。

---

## 响应式数据

框架通过 `this.$data` 提供深度响应式代理。

```ts
// 推荐：构造函数一次性注入，首帧无闪烁
class MyComponent extends BaseElement<{ count: number; user: { name: string } }> {
  constructor() {
    super({ count: 0, user: { name: 'John' } })
  }
}

// 兼容：生命周期里赋值
created() { this.$data = { ... } }
async onInit() {
  const user = await fetch('/api/user').then(r => r.json())
  this.$data = { count: 0, user }
}
```

特性  

- 嵌套对象/数组全部递归代理  
- 批量异步更新，避免频繁渲染  
- 支持路径过滤（`filter`）：可监听特定数据路径变化  
- 支持深度比较（`deepCompare`）：避免不必要的重复触发  
- 支持节流控制（`throttle`）：自定义更新频率  
- 提供变更路径信息：精确追踪数据变化位置  

---

## 自定义元素

```ts
import { BaseElement, CustomElement } from 'solely'

// 最简单组件
@CustomElement({ tagName: 'my-card', template: `<p>{{ $data.txt }}</p>` })
class MyCard extends BaseElement<{ txt: string }> {
  constructor() { super({ txt: 'hi' }) }
}

// 影子 DOM + 内联样式
@CustomElement({
  tagName: 'styled-card',
  template: `<div class="box">{{ $data.txt }}</div>`,
  styles: `.box{ color: red; }`,
  shadowDOM: { use: true }
})
class StyledCard extends BaseElement<{ txt: string }> {
  onInit() { this.$data = { txt: 'shadow' } }
}
```

使用  

```html
<my-card></my-card>
<styled-card></styled-card>
```

---

## 组件通信

| 方式 | 示例 |
|---|---|
| 属性下行 | `<child s-$data="$data.message"></child>` |
| 事件上行 | 子 `this.dispatchEvent(new CustomEvent('update', {detail, bubbles:true}))` <br> 父 `<child on-update="this.handleUpdate(event)">` |
| 全局 Store | 任意单例 class / Context 均可，框架无侵入 |

---

## 生命周期（按顺序）

| 钩子 | 触发时机 | 用途 |
|---|---|---|
| `constructor()` | 实例创建 | 通过 `super(data)` 一次性注入响应式状态（推荐） |
| `created()` | 构造函数结束后微任务 | 同步初始化，首帧前执行 |
| `connectedCallback()` | 元素连接到 DOM | **内部使用**，负责样式注入和首次渲染，请勿重写 |
| `beforeUpdate()` | 每次数据变更 → DOM 更新前 | 可读取新数据，准备更新 |
| `mounted()` | 首次 DOM 更新完成后 | 访问真实 DOM |
| `onInit()` | 首次 `mounted()` 后立即调用 | 兼容旧组件的初始化钩子，可用于依赖 DOM 或异步接口的操作 |
| `updated()` | 后续每次 DOM 更新完成后 | 依赖 DOM 的后处理 |
| `disconnectedCallback()` | 元素从 DOM 移除 | **内部使用**，负责清理和调用 `unmounted()`，请勿重写 |
| `unmounted()` | 组件卸载时 | 清理定时器 / 事件监听器，防止内存泄漏 |

---

## 路由（hash 模式）

```ts
const routes = [
  { path: 'home', tagName: 'home-page' },
  { path: 'user/:id', tagName: 'user-page' },
  {
    path: 'dashboard',
    tagName: 'dashboard-layout',
    children: [
      { path: 'profile', tagName: 'profile-page' },
      { path: 'settings', tagName: 'settings-page' }
    ]
  }
]

class App extends BaseElement {
  constructor() {
    super({ routes })
  }
}
```

```html
<nav>
  <a href="#/home">首页</a>
  <a href="#/user/123">用户</a>
</nav>
<router-view s-$routes="$data.routes"></router-view>
```

在组件内通过 `this.params.id` 获取动态段。

---

## 性能与最佳实践

- 避免在模板里做重计算 / 副作用函数  
- 高频事件（scroll / input）自行节流  
- 批量更新已内置，无需手动 `$nextTick`  
- 自定义元素名称 **必须含连字符**  
- 元素被移除时请在 `unmounted()` 内解绑事件 / 清定时器  

---

## 目录结构

```
src/              核心源码（base/、utils/、solely.ts）
dist/             构建产物（ESM、UMD、*.d.ts）
examples/         官方示例（组件、路由、模板标签等）
tests/            单元测试（Vitest + JSDOM）
public/           静态资源
```

---

## 脚本命令

```bash
npm run dev             # Vite 开发服务器，热更新
npm run build           # 编译 TypeScript & 打包到 dist/
npm run preview         # 本地预览构建结果
npm run test            # 单元测试
npm run test:ui         # Vitest UI 交互模式
npm run test:coverage   # 生成覆盖率报告
npm run link            # 全局 link，供其他项目本地引用
npm run pack:local      # 生成 solely-<ver>.tgz，file: 引用
```

---

## 浏览器支持

- **ES2020 + 原生 Web Components**  
- 最近 2 个主版本的 Chrome / Edge / Firefox / Safari  
- **不支持 IE**；旧环境请自行加 polyfill 并降级编译

---

## 常见问题（FAQ）

| 问题 | 答复 |
|---|---|
| 必须先写 `this.` 吗？ | 模板中可省略，直接写 `$data.xxx` |
| 什么时候用 Shadow DOM？ | 需要样式/结构隔离时，在 `@CustomElement({shadowDOM: { use: true }})` 开启 |
| 能给子组件传对象吗？ | 可以，用 `s-对象='json-string'` 或在父组件里直接 `querySelector('child').$data = {...}` |
| 路由能否用 history 模式？ | 当前仅实现 hash 模式，history 模式可自行扩展 |
| 如何调试响应式数据？ | 浏览器 DevTools 控制台直接 `document.querySelector('my-el').$data` 即可读写 |
| 如何在组件中获取路由参数？ | 路由参数会自动作为组件属性传入，可通过 `this.$data.id` 或直接使用 `id` 获取（如路径为 `/user/:id`） |

---

## 贡献指南

1. Fork 仓库并创建特性分支  
2. 保持代码风格一致，补充对应测试与文档  
3. 运行 `npm run test` 确保通过  
4. 对公共 API 的变更请遵循 **SemVer**  
5. 提交 Pull Request，标题注明 `feat:` / `fix:` / `docs:` 等

---

## 版本与发布

- 当前版本：**0.0.27**
- 遵循语义化版本（SemVer）  
- 构建产物位于 `dist/`，`package.json` 的 `"module"` 指向 `dist/solely.js`，类型声明 `dist/solely.d.ts`

---

## 许可证

MIT License
