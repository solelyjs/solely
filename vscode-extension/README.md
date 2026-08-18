# Solely Framework Support

VS Code 扩展，为 [Solely](https://github.com/solelyjs/solely) 框架的 HTML 模板提供语法高亮、代码补全、智能跳转、悬停提示和错误诊断。

## 功能总览

| 功能         | 说明                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| **语法高亮** | 插值表达式、控制流标签、事件/属性绑定、指令、生命周期等均有独立配色           |
| **代码补全** | `this.`/`$data.`/`$refs.` 成员补全，控制流标签 snippet，`s-`/`@`/`:` 指令补全 |
| **定义跳转** | 模板中 Ctrl+点击跳转到 TS 方法定义、属性定义、ref 引用                        |
| **悬停提示** | 鼠标悬停显示方法签名、属性类型、ref 说明等信息                                |
| **错误诊断** | 控制流配对、插值闭合、属性语法、HTML 引用诊断（方法/属性是否存在）            |
| **模板关联** | 自动识别 `?solely`/`?raw` 导入，关联 HTML 模板与 TS 组件                      |
| **快速切换** | 命令面板一键在 HTML 模板与 TS 组件之间切换                                    |

---

## 语法高亮

打开任意 HTML 模板文件即可自动启用，支持以下语法着色：

### 插值表达式

```html
<span>{{ $data.message }}</span> <span>{{ this.getTitle() }}</span>
```

`$data`、`this`、属性名、方法名均有独立配色。

### 控制流标签

```html
<If test="$data.loading">加载中</If>
<ElseIf test="$data.error">出错了</ElseIf>
<Else>正常</Else>

<For each="$data.items" item="item" index="i"> {{ item }} - {{ i }} </For>

<Show test="$data.visible">可见内容</Show>
```

`<If>`、`<ElseIf>`、`<Else>`、`<For>`、`<Show>` 标签名及 `test`/`each`/`item`/`index`/`condition` 属性均有着色。

### 事件与属性绑定

```html
<button @click="this.handleClick(event)">点击</button>
<input :value="$data.text" />
<div :class="this.getClasses()" :style="this.getStyle()">内容</div>
<img :src="$data.imageUrl" :alt="$data.title" />
```

`@click` 事件绑定、`:src` 属性绑定、`:class`/`:style` 特殊绑定均有着色。

### 指令

```html
<input s-model="$data.formData.name" />
<div s-class="this.getClasses()" />
<button s-disabled="$data.isDisabled" s-visible="$data.isVisible">按钮</button>
```

`s-model`、`s-class`、`s-visible`/`s-disabled` 等布尔指令均有着色。

### 生命周期

```html
<div mounted="this.onMount(el)" updated="this.onUpdate(el)" unmounted="this.onUnmount(el)">内容</div>
<div activated="this.onActivate(el)" deactivated="this.onDeactivate(el)">缓存组件</div>
```

支持 `mounted`/`updated`/`unmounted`/`activated`/`deactivated` 及其 `onXxx` 别名。

### 模板引用

```html
<input ref="inputRef" />
<div ref="container">内容</div>
```

`ref="xxx"` 属性值有着色。

---

## 代码补全

在 HTML 模板中输入时自动触发补全：

### `this.` 成员补全

输入 `this.` 后，自动列出组件自身及父类的所有方法和 getter：

```
this.|→  handleClick(event: MouseEvent): void
        getButtonClasses(): Record<string, boolean>
        setLoading(loading: boolean): void
        ...
```

### `$data.` 属性补全

输入 `$data.` 后，自动列出组件的响应式数据属性（从 `super({...})` 和 `interface` 解析）：

```
$data.|→  todos
         newTodoText
         filter
         testData
         ...
```

### `$refs.` 引用补全

输入 `$refs.` 后，自动列出当前模板中所有 `ref="xxx"` 定义的引用名：

```
$refs.|→  inputRef
          container
          buttonRef
          ...
```

### 控制流标签补全

输入 `<` 后，自动列出 Solely 控制流标签，选择后自动生成完整结构：

```
<|→  If      → <If test="">...</If>
     ElseIf  → <ElseIf test="">...</ElseIf>
     Else    → <Else>...</Else>
     For     → <For each="" item="" index="">...</For>
     Show    → <Show test="">...</Show>
```

### `s-` 指令补全

输入 `s-` 后，自动列出 Solely 指令，选择后自动插入 `="..."` 结构：

```
s-|→  s-model     → s-model="..."
      s-class     → s-class="..."
      s-visible   → s-visible="..."
      s-disabled  → s-disabled="..."
      ...
```

### `@` 事件补全

输入 `@` 后，自动列出 DOM 事件，选择后自动插入 `="..."` 结构：

```
@|→  @click     → @click="..."
     @change    → @change="..."
     @keydown   → @keydown="..."
     ...
```

### `:` 属性绑定补全

输入 `:` 后，自动列出常用属性绑定，选择后自动插入 `="..."` 结构：

```
:|→  :class      → :class="..."
     :style      → :style="..."
     :src        → :src="..."
     ...
```

---

## 定义跳转

按住 `Ctrl`（Mac: `Cmd`）点击模板中的标识符，跳转到 TS 文件中对应的定义：

| 模板表达式           | 跳转目标                                         |
| -------------------- | ------------------------------------------------ |
| `this.method()`      | TS 类方法定义                                    |
| `this.prop`          | TS getter 定义                                   |
| `this.prop.method()` | 链式调用：先找属性类型，再跳转到对应类的方法     |
| `$data.prop`         | `super({...})` 或 `interface` 中的属性定义       |
| `$data`              | 数据定义（`interface`/`BaseElement<`/`super({`） |
| `ref="xxx"`          | TS 中 `this.$refs.xxx` 的使用位置                |
| `s-model="prop"`     | 同 `$data.prop`，跳转到属性定义                  |

跳转支持继承链：如果当前组件类中找不到定义，会自动向上查找父类文件。

---

## 悬停提示

鼠标悬停在模板中的标识符上，显示相关信息：

| 悬停目标        | 显示内容                                 |
| --------------- | ---------------------------------------- |
| `this.method()` | 方法签名 + 来源类 + 跳转提示             |
| `this.prop`     | getter 类型 + 来源类 + 跳转提示          |
| `$data.prop`    | 属性类型 + 定义位置 + 跳转提示           |
| `$data`         | 响应式数据说明                           |
| `ref="xxx"`     | 模板引用说明 + `this.$refs.xxx` 访问方式 |

---

## 错误诊断

打开 HTML 模板时自动检查以下问题：

### 控制流标签配对

```html
<!-- ✅ 正确 -->
<If test="...">...</If>

<!-- ❌ 错误: <If> 未闭合 -->
<If test="..."
    >...

    <!-- ❌ 错误: <ElseIf> 必须在 <If> 或 <ElseIf> 之后 -->
    <div>内容</div>
    <ElseIf test="...">...</ElseIf></If
>
```

### 插值表达式闭合

```html
<!-- ✅ 正确 -->
<span>{{ $data.name }}</span>

<!-- ❌ 错误: 未闭合的插值 -->
<span>{{ $data.name </span>
```

### 属性语法

```html
<!-- ❌ 警告: @click 值未加引号 -->
<button @click="this.handleClick()">点击</button>
```

### HTML 引用诊断

检查模板中引用的方法和数据属性是否在 TS 组件中存在，帮助发现拼写错误：

```html
<!-- ❌ 错误: 方法 'hanldeClick' 在组件及其父类中未定义 -->
<button @click="this.hanldeClick()">点击</button>

<!-- ❌ 错误: 数据属性 'nweTodo' 在 super({}) 或 interface 中未定义 -->
<span>{{ $data.nweTodo }}</span>

<!-- ✅ 不报错: 框架内置成员($emit/$nextTick 等)自动跳过 -->
<button @click="this.$emit('change')">触发事件</button>
```

诊断采用保守策略，避免误报：

- 只检查 `this.method()`（带括号）和 `$data.prop`
- 跳过 `$` 开头的框架内置成员
- 检查继承链（组件类 + 所有父类）
- 无法解析 `super({})` 时跳过 `$data.xxx` 检查

---

## HTML ↔ TS 快速切换

通过命令面板在 HTML 模板和对应的 TS 组件之间一键切换：

1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Solely: 切换到对应文件`
3. 执行后自动跳转到对应文件

- 在 HTML 模板中执行 → 跳转到对应的 TS 组件
- 在 TS 组件中执行 → 跳转到对应的 HTML 模板

扩展通过解析 `import template from './xxx.html?solely'` 或 `?raw` 自动建立关联。

---

## 模板关联机制

扩展通过以下方式自动关联 HTML 模板与 TS 组件：

1. **HTML → TS**：在 HTML 文件所在目录搜索 TS 文件，匹配 `import template from './xxx.html?solely'` 或 `?raw` 语句
2. **TS → HTML**：解析 TS 文件中的模板导入语句，定位 HTML 文件
3. **支持各种相对路径**：`./`、`../`、`./templates/` 等路径格式均可识别

```typescript
// TS 组件中的模板导入（两种方式均可）
import template from './index.html?solely'; // 框架预编译
import template from './index.html?raw'; // 原始字符串

@CustomElement({
    tagName: 'my-component',
    template,
})
class MyComponent extends BaseElement<MyData> {
    // ...
}
```

---

## 安装

**方式一：通过 VS Code 扩展面板安装（推荐）**

按 `Ctrl+Shift+X` 打开扩展面板，搜索 **"Solely Framework Support"** 即可安装。

**方式二：通过命令行安装**

```bash
code --install-extension solely.solely-vscode
```

**方式三：从源码构建**

```bash
cd vscode-extension
npm install
npm run compile
# 按 F5 启动扩展开发宿主
```

---

## 使用

安装后，在 Solely 项目中打开任意 HTML 模板文件即可自动启用，无需额外配置。

扩展支持单引号和双引号属性值：

```html
<!-- 两种写法均可识别 -->
<input ref="inputRef" />
<input ref="inputRef" />
```

---

## 版本要求

- VS Code `>= 1.85.0`
- 项目需使用 `import template from './xxx.html?raw'` 或 `?solely` 方式导入模板

## 问题反馈

如有问题或建议，请在 [GitHub Issues](https://github.com/solelyjs/solely/issues) 提交。

## License

[MIT](LICENSE)
