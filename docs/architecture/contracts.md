# 组件契约：表单与浮层

面向贡献者的稳定约束。新增或修改组件时，**必须**遵守本文；实现细节可以变，约束不能悄悄变。

- 表单基座：`src/shared/form-associated.ts`
- 浮层几何：`src/shared/floating/position.ts`
- 浮层栈：`src/shared/floating/overlay-stack.ts`
- ARIA 关联：`src/shared/aria.ts`

---

## 一、表单关联

### 1. 参与范围

- 必须参与原生表单的组件：`input`、`checkbox`、`switch`、`radio`、`select`。
- `button` 只负责 `submit / reset` 行为，不向 `FormData` 贡献 `name/value`。
- `upload`、`tree` 明确不接原生表单：文件与多值/半选编码尚未定义，不要写永远为空或永远过期的 `setFormValue`。
- 其它组件如需接入，按本文规则实现，不要另起一套。

### 2. 接入方式

- 在被装饰的原始类上声明 `static readonly formAssociated = true`；不要通过装饰器参数或运行时补丁设置。
- 在 `created()` 中调用 `initFormAssociation(this, adapter)`；不要在构造函数里调用 `attachInternals()`。
- 必须实现平台回调：`formAssociatedCallback()`、`formResetCallback()`、`formDisabledCallback(disabled)`。方法名由平台调用，禁止改名。
- `attachInternals()` 失败时必须告警并降级为“不参与表单”，禁止静默吞掉。

### 3. 状态同步

任何影响提交值、有效性或可交互性的变化，都必须走同一条管线：

```
状态写入（silent） → syncFormValue() → syncValidity() → syncAria() → 可选事件
```

触发点必须覆盖初始化、用户交互、`setValue()` / `setChecked()`、`name/disabled/required/readonly` 变化、reset、fieldset 禁用、换 form owner、`defaultValue/defaultChecked` 变化。

禁止只在用户交互时同步；属性写入路径不同步会导致 `new FormData(form)` 与界面不一致。

### 4. 属性反射

- 必须反射：`name`、`disabled`（表单组件）、`required`、`readonly`（input）。
- 禁止反射：`value`、`checked`。原生 `value` attribute 是默认值语义，反射会把当前值与默认值混为一谈。
- 重置目标走 `default-value` / `default-checked`。

### 5. 提交值编码

| 组件                                 | 提交条件                 | 条目                                | 空/未选    |
| ------------------------------------ | ------------------------ | ----------------------------------- | ---------- |
| `input`                              | `name !== ''` 且未禁用   | `name = getValue()`，空字符串也提交 | `name=""`  |
| `checkbox` / `switch` / 独立 `radio` | 已选中且 `name !== ''`   | `name = value 或 'on'`              | 不产生条目 |
| `select` 单选                        | 有值且 `name !== ''`     | `name = value`                      | 不产生条目 |
| `select` 多选                        | 至少一项且 `name !== ''` | 每个值一条同名条目                  | 不产生条目 |
| `button`                             | —                        | 不产生条目                          | —          |

- 布尔控件 `value` 的默认值保持 `''`，只在写入 `FormData` 时归一化为 `'on'`；事件 detail 保持原始 `''`。文档必须同时写明这两者。
- `name` 为空时仍参与约束校验，但不产生提交条目。

### 6. 重置

`formResetCallback()` 必须同步完成：

1. 读重置目标（初始化后第一个 microtask 捕获一次，之后不随交互变化）。
2. 以 silent 方式写回状态。
3. 同步 form value、validity、ARIA。
4. 值**确实变化**时派发一次 `change`，`detail.source = 'reset'`。
5. 禁止派发 `input`。

- 原生 `reset` 不触发 `change`；这里刻意偏离，用于让 `s-model` 与父级数据保持同步。
- 组件 disabled 时仍要写回并派发；不触发动画、不关闭浮层。
- 重置清空本组件维护的 validity 与自定义错误消息。

### 7. 禁用

- 有效禁用态必须是 `作者 disabled || formDisabled`；禁止把 `formDisabled` 写回 `$data.disabled`。
- 所有交互入口、`tabindex`、`aria-disabled`、validity、提交值都读有效禁用态。
- 级联禁用时：`setFormValue(null)`、清空 validity、`aria-disabled="true"`、移出 Tab 序；禁止清空值、禁止派发 `change`。

### 8. 校验

每个参与表单的组件必须暴露：

```ts
get validity(): ValidityState;
get validationMessage(): string;
get willValidate(): boolean;
checkValidity(): boolean;
reportValidity(): boolean;
setCustomValidity(message: string): void;
```

- `willValidate` 只由禁用、readonly、hidden 决定，与 `name` 是否为空无关。
- 只使用组件真正支持的标志：`input` 的 `valueMissing / tooShort / tooLong / patternMismatch / typeMismatch / badInput`；`checkbox / switch / select` 的 `valueMissing`；独立 `radio` 不支持 `required`。
- `anchor` 必须是同一 shadow tree 内的元素，禁止传 `document.body`。
- 消息优先级：`setCustomValidity` > `invalidMessage` > 内置默认文案。
- `message` 属性继续是纯展示属性，禁止用它承载校验消息。
- 组件本身不渲染错误文案。原生 UA 校验气泡对 form-associated custom element 不支持，文档不要承诺。

### 9. change 事件

- **值未变化时绝不派发** `input` / `change`。标量严格比较，数组按顺序逐项比较；禁止依赖 `JSON.stringify` 的 key 顺序。
- `change` 必须是 `CustomEvent`，`bubbles: true`、`composed: true`、`cancelable: false`，由宿主元素派发。
- detail 形状：
    - 标量：`{ name, value, previousValue, source }`
    - 布尔：`{ name, value, checked, previousChecked, source }`
    - 多值：`{ name, value: string[], previousValue: string[], source }`
- `source` 必填：`'user' | 'api' | 'reset'`。
- `detail.value` 必须与同一时刻宿主的 `value` getter 一致；禁止在 detail 中放元素、事件、函数或可变对象。
- 内部原生控件也触发 `change` 时，先 `stopPropagation()`，再走统一派发，保证只出现一个事件。
- 历史例外：`pagination` 的 `change` detail 为 `{ current, pageSize }`，形状与表单控件不同（保留）；`tree` 的 `checkedKeys` 受控写入目前派发裸 `Event('change')`，后续可升级为 `CustomEvent` 补 detail（向后兼容）。新增组件不得再沿用裸 `Event`。

### 10. 静默路径

- 初始化、属性同步、`el.value = x` / `el.checked = x`：零事件。
- `setValue(v, silent = false)` / `setChecked(v, silent = false)`：`silent=true` 零事件；`silent=false` 且值变化时派发 `change(source: 'api')`，不派发 `input`。
- 框架正在同步 prop 时一律按 silent 处理。

### 11. s-model 兼容

- 必须保留宿主上的 `value` / `checked` getter；禁止只把值放在 `change.detail` 里。
- 属性写回必须静默，不能因为父级写回而再次派发事件。

---

## 二、浮层基座

### 1. 定位计算

- 几何计算必须放在纯函数里：禁止读写 DOM、`window`，所有环境输入由参数传入。
- 必须支持 12 个方位与 `auto`。`auto` 按 `top → bottom → right → left` 选择能完整容纳且空间最大的一侧；都不能完整容纳时选溢出最小的一侧。
- 边界算法顺序固定：
    1. 按目标方位计算主轴与交叉轴坐标。
    2. 主轴溢出时翻转到对侧，保持对齐方式。
    3. 仍溢出或禁止翻转时，在交叉轴 shift 回安全区。
    4. 主轴仍有溢出时允许钳制保底可见，但必须记录溢出量，由调用方决定是否隐藏。
    5. 箭头在最终位置确定后计算，指向锚点中心并钳制在浮层内；发生 shift 时箭头反向偏移。

### 2. 坐标空间

- `fixed` 直接使用 `getBoundingClientRect()` 的视口坐标，禁止加减滚动值。
- `absolute` 必须按定位容器换算：

```ts
left = anchorRect.left - containerRect.left + container.scrollLeft - container.clientLeft;
top = anchorRect.top - containerRect.top + container.scrollTop - container.clientTop;
```

- 禁止让调用方自己加减滚动值。

### 3. 重定位

- 必须监听捕获阶段的 `window scroll`（覆盖所有滚动容器）、`window resize`、锚点与浮层的尺寸变化。
- 必须用单个模块级 rAF 合并更新，禁止每个浮层各自注册滚动监听。
- 锚点断开或没有布局盒时按“锚点丢失”通知调用方关闭/隐藏，禁止继续按 0 尺寸定位。

### 4. 挂载与 Portal

- 默认 `strategy = 'fixed'`，挂到锚点自己的 root：Document → `document.body`，ShadowRoot → 该 shadow root。
- 禁止自动“portal 到最近的非裁剪祖先”；该行为依赖运行时祖先状态，不可预测。
- 显式 `popupContainer` 才切到 `absolute`：容器必须是非 static 定位、且不能跨锚点的 shadow 边界；不满足时告警并回退默认。
- `popupContainer` 不保证不被裁剪，也不保证能压过容器外的浮层，文档必须写明。
- 浮层需要摆脱宿主 stacking context 时必须离开宿主 shadow root；但必须留在锚点的同一个 root 内，以保留 CSS 变量继承与同树 IDREF。
- 打开时复用同一个浮层节点，不要每次新建节点；关闭动画结束后才移除。

### 5. 浮层栈与 Esc

- 全库只允许一个 document 级 `keydown` 监听，注册在捕获阶段，由浮层栈统一处理 Esc。
- `event.isComposing === true` 时直接返回。
- 命中 Esc 后，从栈顶向下收集需要关闭的层：`escClosable === 'passthrough'`（tooltip）先关闭但不消费，继续向下；首个 `escClosable === true` 的层关闭后 `preventDefault()` + `stopPropagation()`。
- 不可关闭的层（`escClosable: false`）不响应 Esc，继续向下找；没有任何可关闭层时不处理。
- 多个 passthrough 层（tooltip）叠加时，一次 Esc 会依次关闭所有 passthrough 层，直到遇到首个消费层或栈底。
- 禁止组件自行监听 document keydown 处理 Esc。

### 6. 焦点

- 打开时按顺序选择初始焦点：显式 `initialFocus` → `[autofocus]` → 第一个可聚焦元素 → 容器本身（容器必须 `tabindex="-1"`）。
- `autoFocus=false` 时不移动焦点；下拉类浮层应保持焦点在宿主，用 `aria-activedescendant` 表达当前项。
- 只有栈顶且 `trapFocus=true` 的层处理 Tab；每次重新计算可聚焦列表，不缓存。
- 关闭时只在动画结束后的 `dispose` 还原焦点，候选顺序：触发元素 → 打开时记录的焦点 → 下一层的最后焦点 → 下一层容器 → 下一层触发元素。任一候选不可聚焦就跳过；都失效时只 `blur()`，禁止给 `body` 设 `tabindex`。
- 若用户在关闭动画期间主动把焦点移出浮层，`dispose` 不抢焦点。

### 7. 关闭时序

```
open:   mount → measure → position → activate → autoFocus
close:  deactivate → animation → dispose
```

- `deactivate` 只停 Esc 响应与 Tab 陷阱；`dispose` 才还原焦点、释放滚动锁与 inert。
- 关闭动画被跳过时，`dispose` 必须至少在 `transitionend` 或超时兜底中执行一次。

### 8. 滚动锁

- 模块级引用计数，返回的 unlock 必须且只能调用一次，重复调用幂等。
- 第一把锁保存 `body` 的 `overflow` 与 `paddingRight`，最后一把锁精确还原内联值。
- 出现滚动条时按 `innerWidth - documentElement.clientWidth` 补偿右侧内边距。
- 只有 modal / drawer 可以锁滚动；tooltip / select / popconfirm 禁止锁滚动。
- 释放时机必须是 `dispose`，不是 `deactivate`。
- 浮层内部滚动容器必须 `overscroll-behavior: contain`。

### 9. 层叠顺序

- 每次 `activate` 由统一分配器分配一次 z-index，写入浮层根节点的内联样式。
- 后打开的层永远高于先打开的层，与类型无关；关闭时不回退中间层的层级，栈空后可重置基数。
- 达到上限时告警并回绕；toast / message 不属于浮层栈，始终高于所有浮层。
- 禁止组件再写死 z-index 常量。

### 10. 外部点击

- 所有“点击外部关闭”判定必须使用 `composedPath()`，并包含 portal 后的浮层节点；只判断宿主会把浮层内点击误判为外部。

### 11. 无障碍基线

- 能被 ARIA 引用的 ID 必须与引用者在同一个 tree；跨 shadow 边界的 IDREF 明确不支持。
- 动态状态（展开、选中、无效）必须随状态变化同步，禁止只在打开时设置一次。
- 不渲染错误文案时，不要设置指向不存在节点的 `aria-describedby`。
- `select`：`combobox`、`tabindex`、`aria-*` 由宿主承载；列表与宿主同 tree；选项 `role="option"`，高亮用 `aria-activedescendant`，选项永远不接收 DOM 焦点。
- `tooltip`：浮层 `role="tooltip"` 且生成唯一 id；禁止在可见节点上写 `aria-hidden="true"`；显示时给触发元素追加 `aria-describedby`，隐藏时精确还原；不可交互、不参与 Tab；Esc 仅关闭 tooltip 本身，不消费事件（`escClosable: 'passthrough'`）。
- `popconfirm`：`role="dialog"`，禁止 `aria-modal="true"`；打开时给触发元素设置 `aria-haspopup="dialog"` 与 `aria-expanded="true"`，关闭时还原。
- `modal` / `drawer`：`role="dialog"`、`aria-modal="true"`，必须有关联的 `aria-labelledby`；无标题时使用调用方标签或默认“对话框 / 抽屉”；`tabindex="-1"`、焦点陷阱、滚动锁、背景 inert 必须开启，inert 引用计数，全部关闭后才释放。
- 背景 inert 范围：挂在 body 时对 body 的直接子元素设置，排除浮层根节点、`aria-live`、message 容器与 `script/style/link`；挂在 shadow root 时对该 root 的直接子元素设置。`inert` 不支持时退化为焦点陷阱 + `aria-hidden`，并在文档写明背景仍可 Tab 到。

---

## 附录：契约编号索引

代码注释与测试用 `C-FORM-xx` / `C-OVL-xx` 引用本文约束。编号是稳定标识：**新增约束按顺序追加，不得复用或改号**；改动约束时必须同步本节与引用处。

### 表单关联（`C-FORM-*`）

| 编号        | 名称                     | 本文小节           | 约束要点                                                                                                              |
| ----------- | ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `C-FORM-01` | 静态标记                 | 一.2 接入方式      | `static readonly formAssociated = true` 必须声明在被装饰的原始类上                                                    |
| `C-FORM-02` | internals 初始化         | 一.2 接入方式      | 在 `created()` 中 `initFormAssociation()`，不在构造函数里 `attachInternals()`                                         |
| `C-FORM-03` | 生命周期方法             | 一.2 接入方式      | `formAssociatedCallback` / `formResetCallback` / `formDisabledCallback` 方法名由平台调用，禁止改名                    |
| `C-FORM-04` | 状态同步管线             | 一.3 状态同步      | 值 → 有效性 → ARIA 必须走同一条管线，并覆盖全部触发点                                                                 |
| `C-FORM-05` | 单值写法                 | 一.5 提交值编码    | 单值组件按 `name = value` 提交，空字符串也产生条目                                                                    |
| `C-FORM-06` | 多值写法                 | 一.5 提交值编码    | 多值组件每个值一条同名条目；`formStateRestoreCallback` 本版本明确不支持                                               |
| `C-FORM-07` | 布尔值的 `'on'` 归一化   | 一.5 提交值编码    | 布尔控件 `value` 默认 `''`，仅写入 `FormData` 时归一化为 `'on'`；事件 detail 保持 `''`                                |
| `C-FORM-08` | 原生默认值               | 一.4 属性反射      | `value` / `checked` 不反射，重置目标走 `default-value` / `default-checked`                                            |
| `C-FORM-09` | 捕获时机                 | 一.6 重置          | 初始化后第一个 microtask 捕获一次重置目标；显式写 `default-*` 时立即替换                                              |
| `C-FORM-10` | 重置时序                 | 一.6 重置          | 写回固定 silent，禁止派发 `input`                                                                                     |
| `C-FORM-11` | 重置时的边界             | 一.6 重置          | 值确实变化时派发一次 `change`（`source: 'reset'`）；disabled 时仍写回                                                 |
| `C-FORM-12` | 有效禁用态               | 一.7 禁用          | 有效禁用态 = 作者 `disabled \|\| formDisabled`，禁止回写 `$data.disabled`                                             |
| `C-FORM-13` | 回调行为                 | 一.7 禁用          | 级联禁用时 `setFormValue(null)`、清空 validity、移出 Tab 序，禁止清值与派发 `change`                                  |
| `C-FORM-14` | 作者 disabled 变化       | 一.7 禁用          | 作者 `disabled` 变化与 `formDisabled` 走同一套有效禁用态计算                                                          |
| `C-FORM-15` | fieldset 支持范围        | 一.7 禁用          | `<fieldset disabled>` 级联必须禁用 shadow root 内的原生输入                                                           |
| `C-FORM-16` | 公开 API                 | 一.8 校验          | 必须暴露 `validity` / `validationMessage` / `willValidate` / `checkValidity` / `reportValidity` / `setCustomValidity` |
| `C-FORM-17` | `setValidity` 的调用契约 | 一.8 校验          | 校验 `anchor` 必须与组件同在一个 shadow tree                                                                          |
| `C-FORM-18` | 支持的标志               | 一.8 校验          | 只使用组件真正支持的 validity 标志                                                                                    |
| `C-FORM-19` | 默认错误消息             | 一.8 校验          | 消息优先级：`setCustomValidity` > `invalidMessage` > 内置默认                                                         |
| `C-FORM-20` | ARIA 同步                | 一.8 校验          | 有效性与错误态同步到 `aria-invalid` 等动态 ARIA                                                                       |
| `C-FORM-21` | 值未变化不派发           | 一.9 change 事件   | 值未变化时一律不派发 `input` / `change`                                                                               |
| `C-FORM-22` | `input` 事件             | 一.9 change 事件   | `input` 只由真实用户输入派发，静默路径不派发                                                                          |
| `C-FORM-23` | `change` 事件            | 一.9 change 事件   | `change` 为 `CustomEvent` 且由宿主派发；内部原生 `change` 先 `stopPropagation()`                                      |
| `C-FORM-24` | 时序                     | 一.9 change 事件   | `detail.value` 必须与同一时刻宿主 getter 一致，禁止放入元素 / 函数                                                    |
| `C-FORM-25` | 静默路径                 | 一.10 静默路径     | 初始化、属性同步、prop 直写零事件；`setValue(v, silent)` 按入参决定                                                   |
| `C-FORM-26` | 禁止派发的场景           | 一.9 change 事件   | 数组值按顺序逐项比较，禁止依赖 `JSON.stringify` 的 key 顺序                                                           |
| `C-FORM-27` | 兼容基线                 | 一.11 s-model 兼容 | 必须保留宿主 `value` / `checked` getter，不能只把值放 `change.detail`                                                 |
| `C-FORM-28` | 已知不可兼容的情况       | 一.8 校验          | 原生 UA 校验气泡、跨 shadow 的 `form` 属性等明确不支持，文档不得承诺                                                  |

### 浮层基座（`C-OVL-*`）

| 编号       | 名称                        | 本文小节           | 约束要点                                                                                       |
| ---------- | --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `C-OVL-01` | 纯函数                      | 二.1 定位计算      | 几何计算禁止读写 DOM / `window`；坐标类型以 `top` / `left` 命名                                |
| `C-OVL-02` | 边界算法（顺序固定）        | 二.1 定位计算      | 主轴翻转 → 交叉轴 shift → 钳制保底 → 箭头最后计算                                              |
| `C-OVL-03` | 坐标空间                    | 二.2 坐标空间      | `fixed` 用视口坐标；`absolute` 按容器 rect + scroll − clientLeft/Top 换算                      |
| `C-OVL-04` | 重定位订阅                  | 二.3 重定位        | 捕获阶段 scroll / resize / 尺寸变化 + 单个模块级 rAF 合并                                      |
| `C-OVL-05` | 挂载目标解析                | 二.4 挂载与 Portal | Document → `body`，ShadowRoot → 该 root；禁止自动 portal 到非裁剪祖先                          |
| `C-OVL-06` | 默认 `fixed` 的理由         | 二.4 挂载与 Portal | 默认 `strategy: 'fixed'`，仅显式 `popupContainer` 才切 `absolute`                              |
| `C-OVL-07` | 挂载生命周期                | 二.7 关闭时序      | `open: mount → measure → position → activate → autoFocus`；关闭走 `deactivate → dispose`       |
| `C-OVL-08` | 注册接口                    | 二.5 浮层栈与 Esc  | 浮层注册 / 注销由浮层栈统一管理，组件不自建栈                                                  |
| `C-OVL-09` | Esc 响应者                  | 二.5 浮层栈与 Esc  | 全库唯一 document 级 keydown（捕获阶段），从栈顶向下找 `escClosable` 层                        |
| `C-OVL-10` | 焦点进入                    | 二.6 焦点          | `initialFocus` → `[autofocus]` → 首个可聚焦元素 → 容器（`tabindex="-1"`）                      |
| `C-OVL-11` | Tab 陷阱                    | 二.6 焦点          | 只有栈顶且 `trapFocus` 的层处理 Tab，每次重新计算可聚焦列表                                    |
| `C-OVL-12` | 焦点还原                    | 二.6 焦点          | 按候选链还原，任一不可聚焦就跳过，全部失效时只 `blur()`                                        |
| `C-OVL-13` | 外部点击                    | 二.10 外部点击     | 必须用 `composedPath()` 并包含 portal 后的浮层节点                                             |
| `C-OVL-14` | 引用计数                    | 二.8 滚动锁        | 模块级引用计数；首把锁保存内联值，末把锁精确还原，含滚动条宽度补偿                             |
| `C-OVL-15` | 与 `overflow` 裁剪的交互    | 二.8 滚动锁        | 只有 modal / drawer 锁滚动；浮层内部滚动容器 `overscroll-behavior: contain`                    |
| `C-OVL-16` | 动态分配器                  | 二.9 层叠顺序      | 每次 `activate` 分配一次 z-index，后开永远高于先开，禁止写死常量                               |
| `C-OVL-17` | 层叠上下文限制              | 二.4 挂载与 Portal | `popupContainer` 不保证不被裁剪、不保证压过容器外浮层，文档必须写明                            |
| `C-OVL-18` | 组件不得自行实现的能力      | 二.9 层叠顺序      | toast / message 不属于浮层栈且始终最高；组件不得自建 Esc / z-index 逻辑                        |
| `C-OVL-19` | 默认策略                    | 二.11 无障碍基线   | 动态 ARIA 状态随状态同步，禁止只在打开时设置一次                                               |
| `C-OVL-20` | `popupContainer` 模式       | 二.4 挂载与 Portal | 容器必须非 static 定位、不跨锚点 shadow 边界，否则告警并回退                                   |
| `C-OVL-21` | 裁剪自检（开发期）          | 二.4 挂载与 Portal | 开发期裁剪 / 遮挡自检只做告警，不改变运行时行为                                                |
| `C-OVL-22` | 选择组件的特殊规则          | 二.11 无障碍基线   | `select` 由宿主承载 combobox，选项永不接收 DOM 焦点                                            |
| `C-OVL-23` | 宿主承载 combobox           | 二.11 无障碍基线   | `aria-activedescendant` 指向同 tree 选项 id，跨 shadow 不支持                                  |
| `C-OVL-24` | 声明式 tooltip              | 二.11 无障碍基线   | `role="tooltip"` + 唯一 id，显示时追回 `aria-describedby`，不可交互                            |
| `C-OVL-25` | 命令式 tooltip              | 二.11 无障碍基线   | 目标位于 shadow root 时用 IDREF 代理，禁止直接跨树引用                                         |
| `C-OVL-26` | popconfirm                  | 二.11 无障碍基线   | `role="dialog"`，禁止 `aria-modal="true"`，`aria-haspopup` / `aria-expanded` 需还原            |
| `C-OVL-27` | modal / drawer              | 二.11 无障碍基线   | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`；背景 inert 引用计数，全部关闭后释放 |
| `C-OVL-28` | slot 与 shadow 的不支持清单 | 二.11 无障碍基线   | 跨 shadow 的 IDREF 明确不支持，必须在文档写明                                                  |

> 一.4 属性反射、二.7 关闭时序 等小节由相邻编号覆盖，无独立编号。
