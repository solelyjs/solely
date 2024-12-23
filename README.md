# Solely

## 项目简介

在当今的软件开发领域，前端框架的选择对于项目的成功至关重要。我们注意到，市面上的许多前端框架虽然功能强大，但往往过于复杂，与原生JavaScript（JS）或TypeScript（TS）的写法差异较大，这不仅增加了开发者的学习成本，也不利于技术的积累和迁移。特别是对于小型项目，这些框架的全面性反而导致了资源的浪费，因为它们往往包含了许多项目并不需要的复杂功能。

为了解决这一问题，我们开发了一款简单而高效的前端框架。它的核心优势在于：

1. **简化复杂性**：我们的框架设计简洁，易于上手，与原生JS/TS的写法保持一致，便于技术积累。
2. **专注核心功能**：针对小型项目，我们的框架专注于提供必要的响应式功能，避免了不必要的功能堆砌，从而减少了项目的臃肿。
3. **性能优化**：轻量级的设计减少了资源消耗，提高了项目运行效率。
4. **技术兼容性**：与原生JS/TS的高兼容性，使得开发者可以在不同项目间轻松迁移和应用技术。
5. **高度定制性**：根据项目需求灵活定制功能，避免功能浪费。

我们致力于持续优化框架，确保它能够适应不断变化的前端开发需求，并根据用户反馈进行调整和改进。我们的目标是提供一个既满足小型项目需求，又不牺牲性能和易用性的前端解决方案。

## 安装
  
```shell
npm i solely
```

## 语法规则

### 响应式数据

solely 中内置了响应式数据 $data,每当 $data 中的数据更改时它也会同步更新页面。

### 模板语法

使用 solely，通过基于 HTML 的模板语法，能够精准地将数据绑定到呈现的 DOM 上。solely 的所有模板都是语法正确的 HTML，可被标准的浏览器和 HTML 解析器顺利解析。

### 文本插值

文本插值是最基础的数据绑定形式，使用双大括号语法。在这些语法中，this 指向 Element 实例。为了简化书写，可以省略 $data 前面的 this，两种写法在功能上等同：

```html
<div>消息: {{ this.$data.msg }}</div>
<div>消息: {{ $data.msg }}</div>
```

双大括号标签会被替换为 Element 实例中 $data.msg 的值。同时每次 $data.msg 属性更改时它也会同步更新。

### Attribute 绑定

双大括号不能在 HTML attributes 中使用。想要响应式地绑定一个 attribute，应该使用 s-[attribute] 指令，即在需要绑定的属性前面添加 s- 前缀：

```html
<div s-id="$data.id"></div>
```

s-[attribute] 指令指示 solely 将元素的 id attribute 与组件的 $data.id 属性保持一致。

**注意：** s-[attribute] 也可以用于 Class 与 Style 绑定，如 s-class、s-style 等。

### 布尔型 Attribute​

布尔型 attribute 依据 true / false 值来决定 attribute 是否应该存在于该元素上。如：checked、 disabled、 readOnly、selected 等
s-[attribute] 在这种场景下的行为略有不同：

```html
<button s-disabled="$data.disabled">Button</button>
```

当 $data.disabled 为真值时，元素会包含这个 disabled attribute。而当其为其他假值时 attribute 将被忽略。

### 使用 JavaScript 表达式 ​

至此，我们仅在模板中绑定了一些简单的属性名。但是 solely 实际上在所有的数据绑定中都支持除了 eval、Function、setTimeout、setInterval 等部分不安全代码除外，所有的 JavaScript 表达式。

```html
<div>{{ $data.number + 1 }}</div>

<div>{{ $data.ok ? 'YES' : 'NO' }}</div>

<div>{{ this.getMessage() }}</div>
```

```ts
@CustomElement({
  // 模块名称
  tagName: "sample-message",
  // html模板字符串
  template: template,
})
export class SampleMessage extends BaseElement {
  constructor() {
    super();
  }

  // 初始化函数
  async onInit() {
    this.$data = {
      number: 1,
      ok: true,
    };
  }

  getMessage() {
    return "message";
  }
  // 其他内容
}
```

**注意：** 绑定在表达式中的方法在组件每次更新时都会被重新调用，因此不应该产生任何副作用，比如改变数据或触发异步操作。

### 事件绑定

solely 采用与标签中直接绑定事件相同的方式，不需要进行额外的处理。与文本插值和 Attribute 绑定相同，this 和$data 也已经内置，不同的是，value 也可以直接被使用。

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

### 条件判断

solely 引入了 `<If>` 标签，基于 `condition` 关键字绑定的表达式值的真假性，有条件地渲染元素或模板片段。该标签不会在 HTML 中渲染，只控制内部元素的展示。

```html
<If condition="$data.if">
  <div>内容1</div>
  <div>内容2</div>
  <div>内容3</div>
</If>
```

### 列表渲染

solely 引入了 `<For>` 标签，根据由 `each` 关键字绑定的表达式值返回的数组来渲染列表。`item` 关键字是迭代的别名，默认为 `item`，但可以通过为其赋值进行修改。标签内部的元素可以使用 `item` 关键字绑定的内容，使用 `index` 关键字绑定内容的索引。该标签不会在 HTML 中渲染，只控制内部元素的展示。

```html
<For each="$data.f" item="i">
  <For each="$data.e">
    <div>For 外层 {{i}} 内层 {{item}}</div>
    <button onclick="this.onClick(i,item)">点击</button>
  </For>
</For>
<!-- 使用index指定索引 -->
<For each="$data.pages" item="page" index="i"></For>
```
