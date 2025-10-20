# Solely

## 项目简介

Solely 是一款基于 Web Components 标准的轻量级前端框架，专为简化小型项目开发而设计。它保留了与原生 JavaScript/TypeScript 的高兼容性，同时提供了现代前端框架的核心功能，如响应式数据绑定、虚拟 DOM 渲染和组件化开发。

核心优势：

1. **简化复杂性**：设计简洁，易于上手，与原生 JS/TS 语法保持一致
2. **响应式系统**：基于 Proxy 实现的高效响应式数据绑定
3. **虚拟 DOM**：轻量级虚拟 DOM 系统，提高渲染性能
4. **组件化开发**：基于 Web Components 标准，支持自定义元素
5. **TypeScript 支持**：完整的类型定义，提供良好的开发体验
6. **路由功能**：内置简单路由系统，支持单页应用开发

Solely 适用于需要快速开发且不希望引入大型框架复杂性的项目，它既保持了原生开发的灵活性，又提供了现代框架的便利性。

## 安装

```shell
npm i solely
```

## 语法规则

### 响应式数据

Solely 通过 `$data` 属性提供响应式数据绑定功能。框架使用 JavaScript 的 Proxy API 实现深度响应式系统，每当 `$data` 中的数据更改时，页面会自动同步更新。

```ts
// 初始化响应式数据
this.$data = {
  count: 0,
  user: {
    name: 'John',
    age: 30
  }
};

// 修改数据会自动触发视图更新
this.$data.count++;
this.$data.user.name = 'Jane';
```

响应式系统特性：

- 支持嵌套对象和数组的深度响应式
- 自动追踪数据变化并触发视图更新
- 优化的批量更新机制，避免频繁渲染

### TypeScript 泛型支持

Solely 提供了完整的 TypeScript 支持，您可以通过泛型定义 `$data` 的类型结构，获得更好的类型推断和编辑器智能提示。

```ts
class MyComponent extends BaseElement<{
  count: number;
  message: string;
  items: string[];
}> {
  onInit() {
    this.$data = {
      count: 0,
      message: 'Hello',
      items: ['item1', 'item2']
    };
  }
}
```

### 模板语法

Solely 使用 HTML 字符串作为视图模板，结合虚拟DOM和响应式系统，提供高效的模板渲染能力。框架内部会将模板解析为抽象语法树(AST)，并生成高效的更新函数。所有模板都是语法正确的 HTML，可被标准的浏览器和 HTML 解析器顺利解析。

模板支持以下功能：

### 文本插值

文本插值是最基础的数据绑定形式，使用双大括号语法。在这些语法中，`this` 指向 `Element` 实例。为了简化书写，可以省略 `$data` 前面的 `this`，两种写法在功能上等同：

```html
<div>消息: {{ this.$data.msg }}</div>
<div>消息: {{ $data.msg }}</div>
```

框架内部会将模板解析为抽象语法树(AST)，并生成高效的更新函数。当 `$data` 中的数据发生变化时，响应式系统会通过虚拟DOM进行精确的差异比较，只更新必要的DOM节点，确保渲染性能。

双大括号标签会被替换为 `Element` 实例中 `$data.msg` 的值。同时，每次 `$data.msg` 属性更改时，它也会同步更新。

### Attribute 绑定

双大括号不能在 HTML attributes 中使用。想要响应式地绑定一个 attribute，应该使用 `s-[attribute]` 指令，即在需要绑定的属性前面添加 `s-` 前缀：

```html
<div s-id="$data.id"></div>
```

`s-[attribute]` 指令指示 Solely 将元素的 `id` attribute 与组件的 `$data.id` 属性保持一致。

**注意：** `s-[attribute]` 也可以用于 Class 与 Style 绑定，如 `s-class`、`s-style` 等。

### 布尔型 Attribute

布尔型 attribute 依据 `true` / `false` 值来决定 attribute 是否应该存在于该元素上。如：`checked`、`disabled`、`readOnly`、`selected` 等。`s-[attribute]` 在这种场景下的行为略有不同：

```html
<button s-disabled="$data.disabled">Button</button>
```

当 `$data.disabled` 为真值时，元素会包含这个 `disabled` attribute。而当其为其他假值时，attribute 将被忽略。

### 使用 JavaScript 表达式

Solely 在所有的数据绑定中都支持 JavaScript 表达式，除了 `eval`、`Function`、`setTimeout`、`setInterval` 等部分不安全代码。

```html
<div>{{ $data.number + 1 }}</div>
<div>{{ $data.ok ? 'YES' : 'NO' }}</div>
<div>{{ this.getMessage() }}</div>
```

```ts
@CustomElement({
  tagName: "sample-message",
  template: template,
})
export class SampleMessage extends BaseElement {
  constructor() {
    super();
  }

  async onInit() {
    this.$data = {
      number: 1,
      ok: true,
    };
  }

  getMessage() {
    return "message";
  }
}
```

**注意：** 绑定在表达式中的方法在组件每次更新时都会被重新调用，因此不应该产生任何副作用，比如改变数据或触发异步操作。

### 事件绑定

Solely 采用与标签中直接绑定事件相同的方式，不需要进行额外的处理。与文本插值和 Attribute 绑定相同，`this` 和 `$data` 也已经内置，不同的是，`value` 也可以直接被使用。

```html
<button onclick="$data.count++">Add 1</button>
<input
  type="search"
  placeholder="搜索"
  s-value="$data.searchText"
  onchange="$data.searchText=value"
/>
<button onclick="this.search()">搜索</button>
```

### 双向绑定（s-model）

`s-model` 为表单元素提供 `$data` 上属性的双向绑定。表达式会被规范化为属性路径：会去除前缀 `this.` 与 `$data.`，因此仅支持将值同步到 `$data` 的某个字段（不支持函数调用或任意表达式）。

- 书写形式等价：`s-model="$data.message"`、`s-model="message"`、`s-model="this.$data.message"`
- 目标字段应为可写属性路径（例如 `user.name`、`todo.done`），不支持方法调用或计算表达式

支持的表单元素与行为：

- `<input type="text|password|search|...">`
  - 绑定：`value`
  - 事件：`input` → 将输入框 `value` 同步到 `$data.key`
- `<textarea>`
  - 绑定：`value`
  - 事件：`input` → 同步到 `$data.key`
- `<select>`
  - 绑定：`value`
  - 事件：`change` → 同步到 `$data.key`
- `<input type="checkbox">`
  - 绑定：`checked`
  - 事件：`change` → 将布尔值 `checked` 同步到 `$data.key`
- `<input type="radio" value="...">`
  - 绑定：`checked`（当 `$data.key == value` 时为选中）
  - 事件：`change`（仅在选中时）→ 将 `$data.key` 设置为该 radio 的 `value`

示例：

```html
<!-- 文本输入：值实时写入 $data.message -->
<input type="text" s-model="$data.message" />

<!-- 文本域：同上，使用 input 事件同步 -->
<textarea s-model="message"></textarea>

<!-- 下拉框：选择变更使用 change 事件同步 -->
<select s-model="$data.selected">
  <option value="A">选项A</option>
  <option value="B">选项B</option>
</select>

<!-- 复选框：checked 布尔值写入 $data.debug -->
<label><input type="checkbox" s-model="debug" /> Debug 模式</label>

<!-- 单选框：当选中时将 user.role 设置为对应的 value -->
<label><input type="radio" name="role" value="guest" s-model="$data.user.role" /> guest</label>
<label><input type="radio" name="role" value="admin" s-model="user.role" /> admin</label>
<label><input type="radio" name="role" value="editor" s-model="user.role" /> editor</label>
```

注意事项：

- 不进行类型自动转换：文本与下拉为字符串，复选框为布尔值；如需数值，请在逻辑层做转换
- Radio 通常通过相同的 `name` 分组，但框架的值同步逻辑只依赖 `value` 与选中状态
- `s-model` 仅支持绑定到 `$data` 路径，不能绑定到临时变量或计算结果

### 条件判断

Solely 提供了内置的条件渲染标签，使您可以根据条件动态地显示或隐藏DOM元素：

```html
<If condition="$data.show">
  <div>显示的内容</div>
</If>

<If condition="$data.condition1">
  <div>内容1</div>
</If>
<ElseIf condition="$data.condition2">
  <div>内容2</div>
</ElseIf>
<Else>
  <div>默认内容</div>
</Else>

<div s-style="{ display: $data.show ? 'block' : 'none' }"></div>
```

Solely 引入的条件标签基于 `condition` 关键字绑定的表达式值的真假性，有条件地渲染元素或模板片段。这些标签不会在 HTML 中渲染，只控制内部元素的展示。

### 列表渲染

Solely 提供了内置的 `<For>` 标签，用于高效地渲染列表数据。该标签会根据由 `each` 关键字绑定的表达式值返回的数组来动态生成DOM元素，标签本身不会在HTML中渲染，只控制内部元素的展示。

```html
<!-- 基本列表渲染 -->
<For each="$data.items">
  <div>{{ item }}</div>
</For>

<!-- 访问索引 -->
<For each="$data.items">
  <div>{{ index }}: {{ item }}</div>
</For>

<!-- 对象属性访问 -->
<For each="$data.users">
  <div>{{ item.name }} - {{ item.age }}</div>
</For>

<!-- 自定义循环变量名 -->
<For each="$data.users" item="user">
  <div>{{ user.name }}</div>
</For>

<!-- 使用index指定索引 -->
<For each="$data.pages" item="page" index="i">
  <div>{{ i }}: {{ page.title }}</div>
</For>

<!-- 嵌套循环示例 -->
<For each="$data.groups" item="group">
  <div>{{ group.name }}</div>
  <For each="group.users">
    <div>  - {{ item.name }}</div>
  </For>
</For>
</html>

<!-- 组件代码示例 -->
<script>
class UserListComponent extends BaseElement {
  onInit() {
    this.$data = {
      users: [
        { id: 1, name: 'John', age: 30 },
        { id: 2, name: 'Jane', age: 28 },
        { id: 3, name: 'Bob', age: 32 }
      ]
    };
  }
}
</script>

<!-- 渲染结果示例 -->
<!--
<div>John - 30</div>
<div>Jane - 28</div>
<div>Bob - 32</div>
-->

**注意**：在处理列表数据时，如果列表项可能会发生变化（如添加、删除、重新排序），建议为每个列表项提供唯一的标识，这有助于 Solely 的虚拟 DOM 系统进行高效的节点复用和更新，提高渲染性能。

## 类绑定

在 Solely 中，您可以使用 `s-class` 属性动态绑定类名。

```html
<template>
  <!-- 简单的布尔值切换 -->
  <div s-class="{ active: $data.isActive }"></div>
  
  <!-- 多个类名条件 -->
  <div s-class="{ active: $data.isActive, disabled: $data.isDisabled }"></div>
  
  <!-- 数组语法 -->
  <div s-class="[ $data.baseClass, { active: $data.isActive } ]"></div>
  
  <!-- 直接绑定表达式结果 -->
  <div s-class="$data.className"></div>
</template>

<script>
class MyComponent extends BaseElement {
  onInit() {
    this.$data = {
      isActive: true,
      isDisabled: false,
      baseClass: 'container',
      className: 'user-card highlighted'
    };
  }
}
</script>

<!-- 渲染结果 -->
<!-- <div class="active container"></div> -->

```

支持三种形式实现动态类绑定：

1. **对象语法**：

```html
<div s-class="{ active: $data.isActive, 'text-danger': $data.hasError }"></div>
```

2. **字符串语法**：

```html
<div s-class="static-class dynamic-class"></div>
```

3. **数组语法**：

```html
<div s-class="[$data.class1, $data.class2, { highlight: $data.isHighlight }]"></div>
```

### 样式绑定

在 Solely 中，您可以使用 `s-style` 属性动态绑定样式。

```html
<template>
  <!-- 对象语法 -->
  <div s-style="{
    color: $data.textColor,
    fontSize: $data.fontSize + 'px',
    border: { 
      width: '1px',
      style: 'solid'
    }
  }"></div>
  
  <!-- 字符串语法 -->
  <div s-style="color: red; font-size: 14px;"></div>
  
  <!-- 数组语法 -->
  <div s-style="[$data.baseStyles, { padding: $data.padding + 'px' }]"></div>
  
  <!-- 简单表达式 -->
  <div s-style="color: {{ $data.isActive ? 'red' : 'blue' }}"></div>
</template>

<script>
class MyComponent extends BaseElement {
  onInit() {
    this.$data = {
      textColor: 'red',
      fontSize: 16,
      baseStyles: { backgroundColor: 'lightgray' },
      padding: 10,
      isActive: true
    };
  }
}
</script>

<!-- 渲染结果 -->
<!-- <div style="color: red; font-size: 16px; border: 1px solid;"></div> -->

支持三种形式实现动态样式绑定：

1. **对象语法**：

```html
<div s-style="{
  color: $data.textColor,
  fontSize: $data.fontSize + 'px'
}"></div>
```

2. **字符串语法**：

```html
<div s-style="color: red; font-size: 14px;"></div>
```

3. **数组语法**（支持混合类型）：

```html
<div s-style="[$data.baseStyles, { padding: $data.padding + 'px' }]"></div>
```

4. **嵌套对象**：

```html
<div s-style="{
  border: {
    width: '1px',
    style: 'solid',
    color: $data.borderColor
  }
}"></div>
```

### 自定义元素

Solely 基于 Web Components 标准，通过继承 `BaseElement` 和使用 `@CustomElement` 装饰器可以轻松创建自定义组件。

```ts
import { BaseElement, CustomElement } from "solely";

// 基本组件定义
@CustomElement({
  tagName: "my-component",
  template: `<div>{{ $data.count }}</div>`
})
export class MyComponent extends BaseElement {
  onInit() {
    this.$data = { count: 0 };
  }
}

// 带样式和影子DOM的组件
@CustomElement({
  tagName: "styled-component",
  template: `<div class="container">{{ $data.message }}</div>`,
  className: "my-class", // 添加额外的类名
  style: ".container { color: blue; }", // 内联样式
  shadowDOM: true // 使用影子DOM隔离样式和结构
})
export class StyledComponent extends BaseElement {
  onInit() {
    this.$data = { message: 'Hello with style!' };
  }
}

// 使用TypeScript泛型定义数据类型
@CustomElement({
  tagName: "typed-component"
})
export class TypedComponent extends BaseElement<{
  title: string;
  items: Array<{id: number, name: string}>;
}> {
  template = `
    <h1>{{ $data.title }}</h1>
    <For each="{{ $data.items }}">
      <div>{{ item.id }}: {{ item.name }}</div>
    </For>
  `;
  
  onInit() {
    this.$data = {
      title: 'Typed Component',
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]
    };
  }
}
```

#### 使用自定义元素

在HTML中使用自定义元素就像使用普通HTML标签一样简单：

```html
<!-- 基本用法 -->
<my-component></my-component>

<!-- 传递属性 -->
<my-component s-initial-count="10"></my-component>

<!-- 监听自定义事件 -->
<my-component on-update="handleUpdate(event)"></my-component>
```

#### 组件间通信

组件间通信可以通过以下方式实现：

1. **属性传递**：使用 `s-` 前缀的属性将数据传递给子组件

2. **事件冒泡**：子组件通过 `dispatchEvent` 触发自定义事件，父组件通过事件监听器接收

```ts
// 子组件中触发事件
this.dispatchEvent(new CustomEvent('update', {
  bubbles: true,
  detail: { value: this.$data.count }
}));

// 父组件中监听事件
<child-component on-update="this.handleChildUpdate(event)"></child-component>

// 父组件中的处理方法
handleChildUpdate(event) {
  console.log('Received update from child:', event.detail.value);
}
```

3. **共享服务**：创建全局服务类来管理共享状态

4. **Context API**：使用自定义的Context机制在组件树中传递数据

### 生命周期

Solely 提供了完整的组件生命周期钩子，让您可以在组件的不同阶段执行特定操作：

| 生命周期钩子 | 调用时机 | 用途 |
|-------------|---------|------|
| `created()` | 组件构造函数执行完毕后 | 组件初始化的最早阶段，可用于设置初始状态 |
| `onInit()` | 组件首次挂载到DOM前 | 初始化数据和设置（保持向后兼容） |
| `beforeUpdate()` | 每次组件更新渲染前 | 可以在数据更新后、渲染前执行逻辑 |
| `mounted()` | 组件首次挂载到DOM后 | 可以访问DOM元素，绑定事件监听器等 |
| `updated()` | 组件每次更新渲染后 | 可以执行依赖于DOM更新的操作 |
| `unmounted()` | 组件从DOM中移除时 | 清理资源，移除事件监听器，避免内存泄漏 |

```ts
class MyComponent extends BaseElement {
  created() {
    // 组件创建完成
    console.log('Component created');
  }
  
  onInit() {
    // 初始化数据
    this.$data = { count: 0 };
  }
  
  mounted() {
    // 组件已挂载到DOM
    console.log('Component mounted');
    // 可以在这里访问DOM元素
    this.querySelector('button').addEventListener('click', this.onClick);
  }
  
  beforeUpdate() {
    // 组件即将更新
    console.log('Before update');
  }
  
  updated() {
    // 组件已更新
    console.log('Component updated');
  }
  
  unmounted() {
    // 组件即将被移除
    console.log('Component unmounted');
    // 清理资源
    this.querySelector('button').removeEventListener('click', this.onClick);
  }
}

### 路由功能

Solely 内置了简单但功能强大的路由系统，通过 `router-view` 组件实现。该组件会根据当前 URL 的 hash 部分（如 `#/home`）自动渲染匹配的组件。

#### 路由配置

```ts
// 创建路由配置
const router = {
  routes: [
    {
      path: '/',
      component: HomeComponent
    },
    {
      path: '/about',
      component: AboutComponent
    },
    {
      path: '/user/:id', // 动态路由参数
      component: UserComponent
    }
  ]
};

// 在自定义元素中使用路由
class MyApp extends BaseElement {
  onInit() {
    this.$data = {
      router // 将路由配置传递给模板
    };
  }
}
```

#### 在模板中使用路由

```html
<template>
  <div>
    <nav>
      <a href="#/">首页</a>
      <a href="#/about">关于</a>
      <a href="#/user/123">用户详情</a>
    </nav>
    <!-- 路由视图组件 -->
    <router-view s-$routes="$data.routes"></router-view>
  </div>
</template>
```

#### 获取路由参数

在组件内部，您可以通过 `this.params` 访问路由参数：

```ts
class UserComponent extends BaseElement {
  onInit() {
    // 访问路由参数
    const userId = this.params.id;
    console.log('User ID:', userId);
  }
}
```

### 注意事项

#### 性能优化

- **避免复杂计算**：避免在模板表达式中进行复杂计算或调用可能产生副作用的函数
- **列表渲染优化**：对于频繁变化的列表，确保提供唯一标识符以优化虚拟DOM更新
- **批量更新**：框架会自动合并短时间内的多次数据更新，减少不必要的渲染
- **事件处理**：对于频繁触发的事件（如滚动、输入），考虑使用节流或防抖

#### 命名空间

SVG 元素会自动应用 `svg` 命名空间：

```html
<svg s-width="$data.size">
  <circle cx="50" cy="50" r="40"/>
</svg>
```

#### 组件通信

组件间通信可以通过以下方式实现：

1. **属性传递**：使用 `s-` 前缀的属性将数据传递给子组件

2. **事件冒泡**：子组件通过 `dispatchEvent` 触发自定义事件，父组件通过事件监听器接收

```ts
// 子组件中触发事件
this.dispatchEvent(new CustomEvent('update', {
  bubbles: true,
  detail: { value: this.$data.count }
}));

// 父组件中监听事件
<child-component on-update="this.handleChildUpdate(event)"></child-component>
```

3. **共享服务**：创建全局服务类来管理共享状态

#### 开发最佳实践

- `$data` 可以在任何生命周期钩子中设置，框架会自动处理响应式转换
- 自定义元素的名称必须包含连字符，例如 `my-component`
- 在类中使用 `@CustomElement` 装饰器时，需要正确设置参数
- 使用路由功能时，请确保在 `router-view` 组件中正确传递路由配置
- 避免在模板中使用 `eval`、`Function`、`setTimeout`、`setInterval` 等可能导致安全问题的代码
- 当组件被移除时，确保在 `unmounted` 钩子中清理资源，避免内存泄漏

## 快速开始

- 在项目中使用 Solely（从 npm 安装）：
  - `npm i solely`
  - 最小示例：

```ts
import { BaseElement, CustomElement } from 'solely';

@CustomElement({
  tagName: 'hello-world',
  template: `
    <div class="box">
      <h1>{{ $data.title }}</h1>
      <button onclick="this.$data.count++">Count: {{ $data.count }}</button>
    </div>
  `,
  styles: `
    .box { padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
    button { margin-top: 8px; }
  `,
  shadowDOM: { use: true }
})
class HelloWorld extends BaseElement<{ title: string; count: number }> {
  onInit() {
    this.$data = { title: 'Hello Solely', count: 0 };
  }
}
```

- 本仓库本地运行：
  - `npm i`
  - `npm run dev`
  - 打开 `http://localhost:5175/` 查看示例与演示页面（如 `examples/index.html`）

## 脚本命令

- `npm run dev`：启动开发服务器（Vite），支持热更新
- `npm run build`：TypeScript 编译并构建到 `dist/`（包含 `solely.js`、`solely.d.ts`、`solely.umd.cjs`）
- `npm run preview`：本地预览构建结果
- `npm run test`：运行单元测试（Vitest + JSDOM）
- `npm run test:ui`：以交互式 UI 运行测试
- `npm run test:coverage`：生成覆盖率报告
- `npm run link`：全局链接当前包，供其他项目本地引用
- `npm run pack:local`：打包为 `.tgz`，可通过 `file:` 在其他项目引用

## 目录结构

- `src/`：核心源码（`base/`、`utils/`、`solely.ts`）
- `dist/`：构建输出（ESM 与 UMD、类型声明）
- `examples/`：示例与演示（组件、路由、模板标签等）
- `tests/`：测试代码与环境配置
- `public/`：静态资源
- `vite.config.js`、`vitest.config.js`：构建与测试配置

## 指令与模板速览

- 文本插值：`{{ ... }}`
- 属性绑定：`s-<attr>`（例如 `<router-view s-$routes="$data.routes">`）
- 双向绑定：`s-model`（`input/textarea/select` 支持）
- 条件渲染：`<If> / <ElseIf> / <Else>`
- 列表渲染：`<For each="...">`，支持 `item`、`index` 自定义
- 类名绑定：`s-class`
- 样式绑定：`s-style`
- 事件绑定：原生事件属性（如 `onclick`）与 `on-<event>` 自定义事件监听

## 测试

- 框架使用 Vitest 与 JSDOM 进行单元测试，示例见 `tests/observe.test.ts`
- 运行测试：`npm run test`；生成覆盖率：`npm run test:coverage`

## 浏览器支持

- 基于原生 Web Components 与 ES2020，适配现代浏览器：`Chrome/Edge/Firefox/Safari` 最新两个大版本
- 不支持 IE；旧版本浏览器如需支持，请使用构建工具降级并谨慎评估 Web Components 支持情况

## 常见问题

- `this` 与 `$data`：模板表达式中 `this` 指向组件实例，`$data` 为响应式数据，可省略 `this.` 前缀
- 何时使用 Shadow DOM：通过 `manifest.shadowDOM.use` 开启，默认关闭
- 传递复杂数据：优先使用属性绑定 `:` 或在父组件中直接设置子组件 `$data`
- 路由：当前实现基于 `hash`，通过 `<router-view>` 组合路由配置
- 性能：避免在模板表达式中执行复杂计算，必要时将计算逻辑移至类方法

## 贡献指南

- Fork 仓库并创建特性分支
- 保持代码风格一致，补充相应测试与文档
- 运行 `npm run test` 确认通过，再发起 Pull Request
- 对公共 API 变更遵循语义化版本规范

## 版本与发布

- 当前版本：`0.0.24`
- 遵循语义化版本（SemVer），构建产物位于 `dist/`，模块入口 `package.json:module` 指向 `dist/solely.js`，类型声明位于 `dist/solely.d.ts`

## 许可证

MIT License
