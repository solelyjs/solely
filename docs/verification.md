# 验证与发布检查清单

> 本文档基于 2026-10-24 起的一轮修复整理（模板解析、响应式、组件生命周期、构建产物、安全策略、SSR 导入），
> 后续改动可沿用同一套检查框架。单测只能覆盖其中一部分，下面的手工项用于补足真实浏览器行为。
> 预计总耗时 25–35 分钟。

---

## 0. 一条命令（推荐先跑）

```bash
npm ci
npm run verify
```

`verify` = `typecheck` → `lint` → `format:check` → `test:run` → `build` → `check:exports`。
全部通过即说明静态检查、453 个单测、构建与导出入口都没问题；失败会在对应步骤直接停下。

**人工直观验证**：`npm run dev` 后打开 `http://localhost:5173/examples/regression/index.html`。
页面会自动跑完 12 个用例，每项给出「预期 / 实际 / 结论」，顶部显示 `12/12 通过`；
URL 与共享数据用例会把预期告警各输出 1 条到控制台（方便确认），dispose 日志由页面捕获、不打印。
1.12（`__IS_PROD__`）无法在运行时切换，仍需按下面步骤手工验证。对应的自动化冒烟是 `tests/regression-demo.test.ts`。

**当前基线**

| 项                             | 通过标准                                                          |
| ------------------------------ | ----------------------------------------------------------------- |
| `tsc --noEmit`                 | exit 0，无输出                                                    |
| `eslint .`                     | **0 error**；warning 基线 40 条（全部在 `examples/`、`docs/`）    |
| `prettier --check src`         | All matched files use Prettier code style                         |
| `vitest run`                   | **453 passed / 1 skipped**（30 个文件）                           |
| 覆盖率                         | statements 87.1 / branches 83.9 / functions 95.1（阈值 80/75/85） |
| `vite build` + `check:exports` | 140 个导出目标全部存在                                            |
| `build:examples`               | 构建成功，无报错                                                  |

> 上表是 2026-10-25 的实测基线，会随版本演进变化；实际以 `npm run verify` 的输出为准。

> 若只想快速确认，跑 `npm run verify` 即可；下面的手工项用于覆盖单测覆盖不到的真实浏览器行为。

---

## 1. 手工回归（按改动点，13 项）

启动开发服务器：

```bash
npm run dev
# 示例画廊：http://localhost:5173/examples/index.html
# 组件文档：http://localhost:5173/docs/components-docs/index.html
```

### 1.1 模板空白（最高优先级）

新建一个组件或用现有示例，模板分别写成：

```html
<p><b>Hello</b> <i>World</i></p>
<p><b>Name:</b> {{ $data.name }}</p>
<p>Hello <b>world</b></p>
<div>
    <p>a</p>
    <p>b</p>
</div>
```

**预期**：前三个渲染为 `Hello World` / `Name: xxx` / `Hello world`（有空格）；第四个块级之间**不产生**多余空格节点。
**重点**：按钮「图标 + 文字」、`<b>标签</b> 值`、面包屑分隔符这类布局，视觉上不应再粘连。

### 1.2 `<select multiple>` 初始选中态

```html
<select multiple s-model="$data.picked">
    <option value="a">a</option>
    <option value="b">b</option>
    <option value="c">c</option>
</select>
```

初始 `picked = ['a','c']`，**页面一打开**就应看到 a、c 选中（此前要等一次数据更新才生效）。

### 1.3 数组 prop 的 `reflect`

```ts
props: [{ name: 'items', type: 'array', reflect: true }];
// 运行时
el.$data.items = [1, 2, 3];
```

**预期**：`el.getAttribute('items')` 为 `[1,2,3]`。
**副作用检查**：如果样式里有 `[items]` 这类属性选择器，确认没有意外命中。

### 1.4 自定义 setter

```ts
props: [{ name: 'title' }]
set title(v) { console.log('setter', v); this.$data.title = v; }
```

执行 `el.setAttribute('title', 'x')`，**预期**控制台输出 `setter x`（此前 setter 被绕过）。
**回归点**：如果 setter 里有校验/格式化逻辑，确认它们现在会按预期执行。

### 1.5 共享初始数据对象告警（回归页第 11 项自动判定）

```ts
const shared = { n: 1 };
new Comp(shared);
new Comp(shared);
```

**预期**：开发模式控制台出现 `[Solely] <tag>: 该初始数据对象已被其他实例使用…`。
（这是告警不是报错；两个实例仍然共享 `$data`，这是保留的行为。）

### 1.6 `&nbsp;` 与命名实体（回归页第 1 项包含）

```html
<div style="width: 80px">A&nbsp;B&nbsp;C</div>
<div>&mdash; &times; &ldquo;引用&rdquo;</div>
```

**预期**：第一行不换行（NBSP）；第二行显示 `— × “引用”`。

### 1.7 URL 协议拦截

打开 `http://localhost:5173/examples/security-demo/index.html`，点击 `javascript:` 链接。

**预期**：不跳转、不执行，控制台出现 `Blocked unsafe URL` 告警；正常 `https://` 链接不受影响。

### 1.8 SVG `<style>` 消毒

用 `registerIcon` 注册一段带 `@import` 的 SVG：

```ts
registerIcon('evil', '<style>@import url(https://example.com/x.css);</style><path d="M0 0h8v8H0z"/>');
```

**预期**：`<style>` 被移除，`<path>` 保留；普通 iconfont sprite 的 `<style>` 仍保留。

### 1.9 `dataChangeEvent` 开关

```ts
@CustomElement({ tagName: 'x-a', template: '<div></div>', dataChangeEvent: false })
el.addEventListener('dataChange', spy);
el.$data.n = 1;   // spy 不应被调用
```

默认（不写该字段）仍应触发。

### 1.10 `dispose()` 后重连

```ts
el.dispose();
document.body.appendChild(el); // 不应抛错
```

**预期**：控制台 `console.error` 提示已销毁，元素被移除，`appendChild` 不抛异常。

### 1.11 keepAlive 淘汰

```ts
createRouter({ routes, maxKeepAlive: 1 });
```

在页面组件里给 `dispose()` 打日志，连续访问 3 个 keepAlive 页面。
**预期**：最久未访问的页面被淘汰时触发 `dispose()`。

### 1.12 `__IS_PROD__`

生产构建后部署在 localhost，在入口 HTML 最前面加：

```html
<script>
    globalThis.__IS_PROD__ = true;
</script>
```

**预期**：不再出现 DEV 告警/错误面板；去掉这行则恢复 DEV 行为。

### 1.13 条件链（If/ElseIf/Else）（回归页第 12 项自动切换）

打开 `http://localhost:5173/examples/control-flow/index.html`，切换不同条件。

**预期**：任意时刻只渲染一个分支；控制台不出现 `Orphaned conditional node found`。
**回归点**：格式化写法（分支之间换行缩进）与分支间夹注释都必须仍是一条链——这是最容易回归的一处。

---

## 2. 发布链路冒烟（发版前必做）

```bash
npm run pack:local
# 会先 build + check:exports，再产出 solely-0.6.0.tgz
```

然后在一个空目录安装并验证所有入口（Node 20/22）：

```bash
mkdir -p /tmp/solely-smoke && cd /tmp/solely-smoke && npm init -y
npm i /path/to/solely/solely-0.6.0.tgz

node --input-type=module -e "import('solely').then(m=>console.log('main', typeof m.BaseElement, typeof m.buildIR))"
node --input-type=module -e "import('solely/compiler').then(m=>console.log('compiler', typeof m.buildIR))"
node --input-type=module -e "import('solely/plugin').then(m=>console.log('plugin', typeof m.solelyVitePlugin))"
node --input-type=module -e "import('solely/components/elements/button').then(m=>console.log('button', Object.keys(m)))"
node -e "const s=require('solely'); console.log('cjs', typeof s.BaseElement)"
```

**预期**：全部输出 `function` / 非空对象，无 `ERR_MODULE_NOT_FOUND`、无 `ReferenceError`。

再确认 tarball 里关键入口齐全：

```bash
tar -tf solely-0.6.0.tgz | grep -E "package/dist/(index|plugin|compiler/index|components/elements/button/index)"
```

---

## 3. 构建可复现（一次性验证即可）

```bash
SOLELY_BUILD_OUT_DIR=dist-b1 npx vite build
SOLELY_BUILD_OUT_DIR=dist-b2 npx vite build
diff -r dist-b1 dist-b2 && echo IDENTICAL
```

**已验证结果**：`IDENTICAL`（本轮已实测两次构建字节一致）。
若出现差异，优先检查是否有新增的时间戳/随机数被写入产物。

---

## 4. 行为变更清单（下游项目需要确认）

| 变更                                  | 可能的影响                                               | 建议                                                    |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 模板空白不再被丢弃                    | 原本「粘连」的文案/按钮会多出空格，布局可能有 1–2px 位移 | 视觉走查关键页面；用 `gap`/`margin` 而非依赖粘连        |
| `:href`/`:src` 拦截 `javascript:`     | 依赖该写法的代码会被静默拦截（DEV 有告警）               | 全局搜索 `javascript:`                                  |
| `&nbsp;` 变为 NBSP                    | 文本宽度/换行行为变化                                    | 检查窄容器内的文案                                      |
| 自定义 setter 现在会被 attribute 触发 | setter 中的副作用会执行                                  | 确认 setter 幂等、无重入                                |
| 数组 `reflect` 现在会写 attribute     | 属性选择器可能命中                                       | 检查 `[items]` 类选择器                                 |
| `dispose()` 后重连不再抛错            | 依赖该异常做断言的测试会失败                             | 改为断言 `isConnected === false`                        |
| `sourceMap` 默认 `false`              | 构建不再产出（本来就是空的）map                          | 无需处理；需要时显式传 `includeTemplateSource`          |
| 条件分支之间的空白/注释不再打断 If 链 | 格式化写法此前会同时渲染三个分支（P0 回归）              | 无需处理；确认控制台无 `Orphaned conditional node` 告警 |
| `:srcdoc` 绑定默认拦截                | 使用 iframe 内嵌 HTML 的写法会失效                       | 改用 sandbox iframe + `src`，或直接设置属性             |

---

## 5. 已知边界（不是本轮 bug）

- Node 下所有入口都可 **import**（本轮已修复），但**渲染/实例化仍需要 DOM**；项目没有 SSR 渲染器。
- `:innerHTML` 仍不拦截（显式高危指令，README 有警告）。
- `<For>` 没有 `key`，列表重排按索引复用 DOM。
- 组件库覆盖率仍未纳入门禁（`src/components/**` 被 exclude）。

---

## 6. 建议执行顺序

| 顺序 | 内容                                   | 耗时     | 必要性           |
| ---- | -------------------------------------- | -------- | ---------------- |
| 1    | `npm run verify`                       | 2–3 min  | 必做             |
| 2    | 1.1 模板空白 + 1.2 多选 + 1.7 URL 拦截 | 5 min    | 必做（用户可见） |
| 3    | 2. 发布链路冒烟                        | 5 min    | 发版前必做       |
| 4    | 1.3–1.6、1.8–1.13                      | 10 min   | 建议             |
| 5    | 3. 构建可复现                          | 2 min    | 可选（已验证）   |
| 6    | 4. 行为变更走查                        | 5–10 min | 有下游项目时必做 |

---

## 7. 组件文档走查顺序（可选，约 10 分钟）

组件文档有 40+ 页，不需要全看。按本轮改动的影响面排序：

### P0 必看（6 页）

| 页面         | 重点看什么                                                                 | 对应改动                      |
| ------------ | -------------------------------------------------------------------------- | ----------------------------- |
| `alert`      | 图标 + 文本 + 关闭按钮的间距；`closable` 动态切换                          | 空白模型、自定义 setter       |
| `input`      | prefix/suffix 图标间距；`value`/`disabled` 运行时更新                      | 空白模型、自定义 setter       |
| `select`     | 切换 `value` 后显示正确；下拉项之间无多余空白                              | 空白模型、自定义 setter       |
| `icon`       | `registerIcon` / sprite 正常；`<style>` 中的 `@keyframes` 仍生效           | SVG 消毒（CSS 注释/危险构造） |
| `tag`        | 页面里有格式化的 `<If>`：关闭标签后「已关闭: …」才出现，且文本前无多余空格 | 条件链、空白模型              |
| `breadcrumb` | 分隔符两侧间距；`items` 更新后不残留旧节点                                 | 空白模型、自定义 setter       |

### P1 建议（按组件分组）

- **按钮类**：`button`（图标 + 文字 / 纯文字间距）
- **表单类**：`switch`、`checkbox`、`radio`（`checked` 属性动态切换走 setter）
- **导航类**：`tabs`、`steps`、`pagination`（`active` / `current` 属性更新）
- **数值类**：`slider`（`marks` 刻度 + `value`）
- **命令式**：`message`、`modal`、`drawer`（图标 + 文本间距，遮罩内布局）

### P2 扫一眼

`card`、`timeline`、`table`、`empty`、`progress`、`rate`、`upload`、`tree`、`coordinate-input`、`backtop`。

### 不在组件文档里的项

以下行为在组件文档中不会体现，请用对应入口验证：

- 多选初始态、数组 reflect、共享数据告警、多分支条件链 → `examples/regression`
- URL / `srcset` / `srcdoc` 拦截 → `examples/security-demo` + 单测
- dispose 重连、keepAlive 淘汰、routerReady 语义 → 回归页第 8–10 项
- `&nbsp;` / 命名实体 → 回归页第 1 项

> 说明：组件源码里没有声明 `reflect: true` 的 prop，文档 demo 也基本通过 attribute 传数组/对象，
> 所以「数组 reflect」和「默认值克隆」在文档页不会触发，属于单测与回归页覆盖范围。
