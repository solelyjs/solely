# Changelog

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### ⚠️ Breaking

- **types**: `IRRoot['m']['t']` 由必填改为可选（生产构建不再写入时间戳）；下游若直接读取 `ir.m.t` 需处理 `undefined`
- **types**: `ChangePayload` 的 `array-replace` 分支新增必填 `key` 字段（修复 reflect 与路径过滤所需；手工构造该载荷的代码需同步）
- **security**: `:srcdoc` 绑定默认拦截（值本身是 HTML，无法用协议白名单判断；此前会原样写入 iframe）
- **plugin**: `sourceMap` 默认值由 `true` 改为 `false`（该选项此前只产出空映射，现已标记 deprecated）

### Fixed

- **compiler**: 修复模板中纯空白文本节点被丢弃导致的文本粘连——`<b>Hello</b> <i>World</i>` 会渲染成 `HelloWorld`、`<b>Name:</b> {{ x }}` 渲染成 `Name:x`。现改为「折叠连续空白 + 按相邻节点是否块级决定首尾空格去留」，并修复编译阶段对 template 源码二次 `trim()` 的问题；`<b>Hello </b>` 这类行内闭合标签前的空格也会保留
- **reactivity**: `array-replace` 变更补充 `key` 字段与完整 `path`，修复 `reflect: true` 的数组 prop 在整体替换数组时无法同步到 attribute 的问题
- **reactivity**: `deepCompare` 增加循环引用保护，修复自引用对象比较时的 `RangeError: Maximum call stack size exceeded`
- **component**: 通过 HTML attribute 更新 prop 时改为走用户自定义 setter，不再绕过其校验/格式化/派生逻辑（与 README 的属性升级规则一致）
- **compiler**: `<select multiple>` 的初始选中态在首次挂载时丢失（同步逻辑只挂在 `updated`），补充 `mounted` 钩子
- **component**: 同一初始数据对象被多个实例复用时输出 DEV 告警（说明 `$data` 会共享同一响应式代理）
- **component**: 已 `dispose()` 的元素再次插入 DOM 时不再在 `connectedCallback` 中抛错（异常会冒泡到 `appendChild` 调用方），改为 DEV 告警 + 移除
- **renderer**: `&nbsp;` 现在正确解码为 `U+00A0`（此前被当成普通空格）；命名实体表由 12 个扩展到 70+ 个常用符号
- **router**: `keepAlive` 缓存被淘汰或 router `destroy()` 时，若缓存元素实现了 `dispose()` 则调用，避免资源泄漏
- **security**: `:href` / `:src` / `:action` / `:formaction` / `:poster` / `:xlink:href` 默认拦截 `javascript:` / `vbscript:` / `data:text/html`（含 `java\tscript:` 混淆写法）
- **security**: SVG 消毒新增 `<style>` 危险构造拦截（`@import` / `expression()` / `behavior:` / `-moz-binding`）
- **compiler**: 修复空白保留规则打断 `<If>/<ElseIf>/<Else>` 链的问题——格式化写法（分支间换行缩进）会产生空白 Text 节点，导致 `ElseIf/Else` 变成孤儿分支并同时渲染；现在条件链收集会跳过分支间的空白与注释（仅当后续节点仍是本链分支时才跳过，避免吞掉内联内容前的空格）
- **security**: 修正 `data:text/html` 拦截规则——原正则要求 `html` 后跟冒号，而真实形式是 `data:text/html,` / `data:text/html;base64,`，此前实际未生效
- **security**: SVG `<style>` 匹配前先剥离 CSS 注释，避免注释里的 `behavior:` / `@import` 说明文字导致整块样式被误删
- **security**: URL 协议校验补充 `srcset`，并默认拦截 `:srcdoc` 绑定
- **security**: 修正 `behavior:` 正则误伤 `scroll-behavior:` 的问题（增加声明起始边界）
- **renderer**: 修复实体解码命中原型链的问题（`&toString;` 会输出 `function toString() { [native code] }`），改用 `hasOwnProperty` 判定
- **renderer**: 危险 URL 告警按「元素 + 属性 + 值」去重——此前组件每次刷新都会重复打印同一条 `Blocked unsafe URL`，控制台会被刷屏
- **component**: `default: null` 的 prop 在 attribute 被移除或值非法时回到 `null`（此前会保留旧值，与初始化行为不一致）
- **component**: props 的 object/array 默认值改为按实例克隆——此前 `default: []` / `default: {}` 会被所有实例共享，一个实例修改后其它实例可见，甚至污染后续新建实例的初始值
- **component**: 修复自定义 setter 不写 `$data` 时 `#isAttributeUpdate` 标记悬挂，导致下一次普通刷新误触发属性生命周期钩子的问题
- **router**: `setKeepAlive` 覆盖同一 key 时释放旧实例（此前只有淘汰与 `destroy` 路径会调用 `dispose()`）
- **examples**: 修复示例画廊从「安全机制 / CSP 模式」返回（浏览器回退）后内容区空白的问题——独立页面链接不再清空 tab 状态，并在 `pageshow` 时恢复上次选中项
- **ssr**: 修复 Node 环境 `import 'solely'` 抛 `ReferenceError: HTMLElement is not defined`——`BaseElement` 基类在无 DOM 时退化为空类；`Message` 的 loading 图标改为惰性创建（原在模块顶层调用 `document.createElement`，导致组件入口在 Node 下 import 即崩溃）

### Changed

- **build**: 构建模式（`vite build`）默认剥离 `ir.m.src`（模板源码），避免产物中重复携带整份 HTML；新增 `includeTemplateSource` 选项可显式保留
- **build**: 编译时间戳仅在开发环境写入，生产构建产物可复现
- **plugin**: `sourceMap` 选项标记为 deprecated，默认值改为 `false`，显式开启时打印一次告警；同时移除每次构建中无用的 `generateMap` 计算
- **build**: 新增 `scripts/check-exports.mjs` 与 `check:exports` 脚本；`pack:local`、`prepublishOnly`、CI 均会校验 `exports` 目标真实存在
- **ci**: 增加 `format:check` 与 `check:exports` 步骤
- **repo**: 新增 `.gitattributes`（`* text=auto eol=lf`）；本次触及的 3 个源码文件工作区行尾已归一为 LF（索引中本就是 LF，无内容 diff）
- **docs**: 修正 README 中「零运行时依赖」「路由默认 hash」「测试完善」等与实现不一致的表述；`docs/api.md` 同步 `array-replace` 载荷
- **component**: 新增 `dataChangeEvent` 配置（默认 `true`），高频更新场景可关闭每次变更的 `dataChange` 事件派发
- **tooling**: `examples/`、`docs/` 放宽 `no-console` 与 `no-explicit-any`（演示代码不是发布产物），并移除失效的 `eslint-disable`，lint 基线归零
- **tooling**: 新增 `test:run`（非 watch）与 `verify`（typecheck + lint + format + test + build + exports）脚本；`prepublishOnly` 与 CI 改用 `test:run`，避免本地发布时 vitest 以 watch 模式挂起
- **env**: `IS_DEV` 新增 `globalThis.__IS_PROD__` 强制生产开关；`process.env.NODE_ENV` 改为经 `globalThis.process` 读取，避免库构建时被 Vite 静态替换
- **repo**: 删除根目录遗留的手工调试页 `test-message-placement.html`（Message 的演示已由文档站 `docs/components-docs/views/message.ts` 完整覆盖，且已有 10 个自动化测试，示例页属重复）

### Added

- **examples**: 新增 `examples/regression/` 回归验证页（12 个自动判定用例 + 1 条手工环境说明，覆盖本轮主要修复），每个用例输出「预期 / 实际 / 结论」，并在示例画廊添加入口
- **test**: 补充模板空白、数组反射、自定义 setter、共享数据告警、多选初始态、循环引用、插件源码剥离、URL 协议拦截、SVG `<style>` 消毒、`keepAlive` 资源释放、`dispose` 重连、`dataChangeEvent`、环境判定、`routerReady` 语义、`computed`、`solely/plugin` 入口等回归用例（384 → 453）

## [0.6.0] - 2026-10-19

### ⚠️ Breaking

- **engines**: Node 要求从 `>=16.0.0` 提升至 `^20.19.0 || >=22.12.0`（与 Vite 7 实际要求一致；`>=20.19.0` 会误放行 Vite 7 不支持的 21.x 与 22.0–22.11）；Node 16/18 均已 EOL
- **types**: `FunctionCreator` / `createFunction` 泛型约束由 `any[]` 改为 `unknown[]`（导出类型签名变更；src 内无引用，下游如有显式实例化需注意）

### Changed

- **build(deps)**: 工具链全面升级
    - TypeScript 5.6 → 5.9.3
    - Vite 5 → 7.3.7（`vite-plugin-dts` 自动解析至 4.5.x，兼容 Vite 7）
    - ESLint 8 → 9.39.4，配置由 `.eslintrc.cjs` 迁移为 flat config `eslint.config.cjs`
        - 引入 `@typescript-eslint` `flat/recommended`，显式关闭 `no-unused-vars` / `no-undef` / `no-redeclare` 基础规则（由 TS 版本接管）
        - 新增 `globals`、`@eslint/js` 依赖：后者此前仅作为 `eslint` 的传递依赖存在于 `node_modules`，而 `eslint.config.cjs` 直接 `require` 却未声明，pnpm / npm 严格模式下会报错；`__SOLELY_VERSION__`（vite define 注入）加入 globals
        - `@typescript-eslint/no-unused-expressions` 新版 recommended 默认开启，迁移期关闭以保持行为一致
        - ignores 增加 `dist-examples/`、`dev-tool/`、`dist-verify/`
- **chore(tsconfig)**: 将 `tests` 纳入 `tsconfig.json` include，消除 `npm run typecheck` 的测试代码盲区
- **refactor(reactivity)**: 收敛 `observe.ts` 全部 any（原 11 处）
    - `globalProxyCache` 类型收紧为 `WeakMap<object, object>`
    - `RAW_SYMBOL` 访问改用 `Record<symbol, unknown>` 断言
    - 数组仪器方法经新增的 `getArrayMethod()` helper 取宽松函数类型，替换 `(target as any)[key]` 模式
- **refactor(decorators)**: `CustomElement` 装饰器参数由 `any` 改为 `Function` + 局部构造断言，出口一次 `as ClassDecorator`，消除 any
- **refactor(functions)**: `FunctionCreator` / `createFunction` 泛型约束 `any[]` → `unknown[]`，删除 CSP 探测处无意义的 `as any`；`TReturn` 的 any 为刻意保留的设计逃生舱（动态编译函数返回类型编译期不可知），已注释说明
- **feat(security)**: SVG 消毒规则补强（`svg-sanitize.ts`）
    - 新增 SMIL 动画写属性载荷拦截：`<set>`/`<animate>` 等元素 `attributeName` 命中 `on*`，或命中 URL 属性且 `to`/`values`/`from`/`by` 携带危险协议时整个移除（此类载荷可绕过静态 `on*` 检查；命中 URL 属性但值无害的动画放行）
    - 危险协议补充 `vbscript:` 与 `data:text/html`（`data:image/*` 放行）
    - `<style>` 不再拦截：iconfont sprite 内嵌样式是常见写法，整删导致图标样式丢失
    - 解析策略改为「XML 严格优先 + HTML 容错回退」：XML 失败（最常见于 `registerIcon` 收到未转义 `&` 的 JS 字符串）时回退 `text/html` 解析，避免整个图标被静默清空
        - 回退路径同样以 `<svg>` 包裹：保证消毒解析语境与注入语境（`svgEl.innerHTML` 的 SVG foreign content）一致。若用 `<div>` 包裹，`<style>` 在 HTML 语境是 RAWTEXT、内部标签逃过消毒，注入 foreign content 后被恢复执行——构成 mXSS 绕过（攻击者以裸 `&` 即可主动触发回退路径）；svg 包裹下 HTML 专有标签触发 foreign content breakout 落到 svg 外，取根节点时被自然丢弃
        - 新增 mXSS 回归测试（`svg-sanitize.test.ts`）：直接以 `innerHTML` 注入后断言 `[onerror]` 不存在，而非只断言字符串；已通过注入 `<div>` 回归反向验证
    - 元素过滤由「危险元素黑名单」改为「SVG 元素白名单」（约 60 个合法元素，含 `fe*` 滤镜基元）：黑名单需逐个追补 `img` / `video` / `base` / `form`……永远补不完（HTML / MathML 元素可借 integration point 存活，`onerror` 被剥但元素残留）；白名单从结构上一次性收口，XML 与回退两条路径同时生效。刻意排除 `script`（可执行）与 `foreignObject`（内嵌 HTML 上下文），保留 `a` / `style`；已用真实 `bootstrap-icons` sprite（2078 个 symbol）验证无元素被误杀
    - mXSS 变体测试矩阵：MathML `mtext` 命名空间逃逸 / `<template>` inert 内容 / `<plaintext>` 文档吞没 / 实体混淆 `javascript:` URL，各覆盖 text/html 回退与 XML 严格双路径；另覆盖 16 类非 SVG 元素（`video`/`audio`/`base`/`form`/`input`/`math` 等）的移除与完整合法 SVG 元素集（渐变 / 滤镜 / 裁剪 / 蒙版 / 文本 / 动画）的保留
    - 新增按输入字符串索引的结果缓存（上限 500），消除列表场景重复 DOMParser 解析开销；补充淘汰分支测试（501 条不同输入触发 `CACHE_LIMIT`）
    - 注释与文档校准：`sanitizeSvg` 的 SSR 分支注释改为「fail-closed 不输出图标」（原措辞「调用方保证来源可信」与实际返回空串的行为不符）；`steps` 组件 `iconHtml` 注明未走消毒的原因（内容为开发者 light DOM，与组件模板同等信任级；且 `sanitizeSvg` 是 SVG 元素白名单，套用到任意 HTML 会误删 `<img>` / `<span>` 等合法内容）
- **test(coverage)**: `vitest.config.js` 新增覆盖率门禁 thresholds（statements 80 / branches 75 / functions 85 / lines 80，略低于当前实际值 81.3/78.0/87.0/81.3），作为防劣化底线，后续随测试补充逐步上调；`src/components/**` 暂不计入覆盖率统计
- **build(vite)**: 库构建支持 `SOLELY_BUILD_OUT_DIR` 环境变量重定向产物目录，便于验证构建不触碰正式 `dist`
- **chore(scripts)**: `lint` / `lint:fix` 移除 flat config 下已无意义的 `--ext .ts,.tsx`
- **chore(eslint)**: ignores 清理已删除的 `.eslintrc.cjs` 条目，补充 `dist-verify/`
- **chore(readme)**: TypeScript badge 5.6 → 5.9
- **chore(deps)**: `vite-plugin-dts` 声明版本对齐实际安装（^4.4.0 → ^4.5.4）
- **docs(readme)**: 测试数量描述更新为 380+
- **build(husky)**: `lint-staged` 的 `*.{ts,tsx}` 增加 `prettier --write`（原先只有 `eslint --fix`）。ESLint 忽略 `tests/`，此前测试代码完全游离于格式检查之外，提交时无任何格式化入口；改为增量处理暂存文件，不触发存量文件重排

### Added

- **feat(security)**: 新增 `src/shared/svg-sanitize.ts` SVG 消毒工具（移除 script/foreignObject/iframe/object/embed/link/meta、on\* 事件属性、javascript: URL），icon 组件 `innerHTML` 注入前统一消毒，防止远程 SVG Sprite 携带 SMIL 事件属性等 XSS 载荷
- **test(components)**: 新增组件库测试骨架 `tests/components/`，覆盖 tree、table、modal、drawer、message、coordinate-input 共 50 个用例；新增 `tests/svg-sanitize.test.ts` 消毒规则用例
- **test(ssr)**: 新增 `tests/ssr-safety.test.ts`（Node environment 冒烟测试），锁定 SSR 下 `CustomElement` 装饰器与 `sanitizeSvg` 的环境守卫回归（jsdom 测试无法覆盖此类场景，已通过注入回归反向验证）

### Fixed

- **fix(security)**: 修复 `CustomElement` 装饰器在 Node/SSR 下的崩溃回归
    - any 收敛时将 `HTMLElement` 检查提取为变量，破坏了 `isBrowser &&` 的短路语义，Node 环境提前求值抛 `ReferenceError: HTMLElement is not defined`
    - 恢复 `typeof HTMLElement !== 'undefined'` 守卫，并由 `tests/ssr-safety.test.ts` 锁定
- **fix(security)**: `sanitizeSvg` 增加 `DOMParser` 存在性守卫，Node/SSR 下返回空串（fail closed）而非抛错
- **fix(tree)**: 修复 `setTreeData` 误将 `$data.treeData` 回写为 JSON 字符串导致 `flattenTree` 遍历字符串字符的问题；并注释说明重新挂载时 attribute 旧值可能覆盖动态数据的边界（该边界已由 `tests/components/tree.test.ts` 的「re-attach」用例锁定：`connectedCallback` 会把 `tree-data` 重新同步进 `$data`，随后 `mounted` → `parseTreeData()` 覆盖动态数据）

## [0.5.8] - 2026-08-30

### Added

- **feat(theme)**: 新增语义令牌并接入组件
    - 阴影扩展 `--solely-shadow-xl`、`--solely-shadow-2xl`
    - 字号扩展 `--solely-font-size-3xl` ~ `5xl`
    - 过渡快慢档 `--solely-transition-duration-fast` / `-slow`
    - 状态背景色别名 `--solely-{success,warning,error,info}-bg`
    - 焦点环别名 `--solely-focus-ring` 及 `-error` / `-warning` / `-success`
    - 品牌渐变 `--solely-gradient-brand` / `--solely-gradient-brand-soft`
    - 暗色主题补齐 `--solely-shadow-primary` 及上述全部语义令牌
- **docs(components-docs)**: 新增移动端侧边栏开关按钮与遮罩层，支持抽屉式导航

### Changed

- **style(button)**: 移除 hover/active 的全局透明度，改由语义色阶表达状态
    - 各类型补充 `:active` 按下态，实心类使用对应 `-active` 色阶
    - `default` / `dashed` 按下时补充浅蓝底 `--solely-primary-light`
    - `text` 按下时灰阶由 `--solely-gray-4` 加深为 `--solely-gray-5`
- **style(input)**: 焦点环改用 `--solely-focus-ring` 系列令牌，聚焦时同步边框色
- **style(input)**: hover 态不再覆盖 error / warning / success 的状态色
- **style(table)**: 单元格文字色由次要文字色改为 `--solely-text-primary`
- **style(tag)**: 默认标签改用 `--solely-fill-color` 与 `--solely-border-color-split`
- **docs(home)**: 首页按钮/徽章/特性图标由 emoji 替换为内联 SVG，内联样式迁移到 CSS
- **style(theme)**: 暗色主题阴影加深，并补齐亮色主题缺失的 `--solely-shadow-xl`

### Fixed

- **fix(button)**: 修复 `secondary` / `success` / `warning` / `error` 四类按钮缺失 `:active` 按下态的问题
    - 移除全局 `:active { opacity }` 后未同步补齐，导致按下时无任何反馈
- **docs(input)**: 修复搜索建议示例中数组属性使用单引号导致解析失败的问题
    - `type: 'array'` 的属性值走 `JSON.parse`，单引号写法必然抛错并回退空数组，须使用双引号
- **docs(home)**: 修复 `.overview-icon` 未指定前景色导致 SVG 图标在深色渐变上不可见的问题
- **docs(components-docs)**: 修复移动端侧边栏关闭逻辑，仅在窗口宽度 ≤768px 时执行关闭，避免桌面端无意义的渲染与状态修改

## [0.5.7] - 2026-08-18

### Added

- **feat(vscode-extension)**: 升级 VS Code 扩展到 v0.1.3，新增代码补全能力
    - `this.` 后补全组件方法/getter（含父类继承，方法自动插入括号）
    - `$data.` 后补全数据属性（从 `super({})` 与 `interface` 解析）
    - `$refs.` 后补全当前模板中的 ref 名称
    - `<` 后补全控制流标签（If / ElseIf / Else / For / Show）
    - `s-` 补全 Solely 指令、`@` 补全 DOM 事件、`:` 补全属性绑定
- **feat(vscode-extension)**: 新增 HTML ↔ TS 文件切换命令 `solely.switchToCorrespondingFile`
    - 在 HTML 模板与对应 TS 组件之间快速跳转，注册对应命令并提供菜单
- **feat(vscode-extension)**: 新增模板引用合法性诊断 `validateReferences`
    - 校验 `this.method()` 调用与 `$data.prop` 数据属性是否在组件及其父类中定义（跳过 `$` 开头的框架内置成员）
    - 保守策略：无法解析数据属性时跳过检查，避免误报
- **feat(vscode-extension)**: 语法高亮增强
    - 支持 Show 控制流标签与 `on-` 事件绑定，补全生命周期钩子（activated / deactivated 等）
    - 所有属性匹配统一支持单引号与双引号

### Changed

- **refactor(templateParser)**: 重构数据属性解析逻辑
    - `extractDataPropsFromSuper` 改为字符串/模板字符串/注释感知的扫描，避免把值或注释中的 `word:` 误判为属性
    - 拆分超长正则表达式字符串，满足 lint `max-len` 约束

## [0.5.6] - 2026-07-13

### Fixed

- **fix(modal)**: 为 `.solely-modal__content` 默认添加 `width: 100%`
    - 修复 flex 布局下内容较短时未占满 body 区域的问题

## [0.5.5] - 2026-07-10

### Changed

- **refactor(url)**: 重写 `parseHashUrl` 以更好处理边界情况
    - 使用 `URLSearchParams` 替代手写 `split('=')` 解析，正确处理空值（如 `flag&`）和含等号的值（如 `token=a=b=c`）
    - 支持相对 URL 与格式错误的转义字符，传入字符串时以 `window.location.href` 为 base 构造 URL，避免抛错
    - 优化默认参数处理与哈希解析逻辑

### Fixed

- **fix(reactivity)**: 修复 `watchGetter` 和 `observe` 的若干问题
    - `set` 拦截器中使用 `toRaw(newVal)` 与旧值比较并写入，避免将代理重新赋值回源对象时触发伪变化，并防止源图中存储代理
    - `watchGetter` 在非 immediate 模式下也调用 getter 建立基线值，使首次通知能正确报告真实旧值
- **fix(router)**: 修复 base 路径不带前导斜杠的归一化问题
    - 新增 `normalizeBase` 工具方法，自动补全前导斜杠并移除末尾多余斜杠
- **fix(router-link)**: 修复非精确匹配仅查询参数不同时未激活的问题，添加解绑逻辑
    - 非精确匹配时先 `split('?')[0]` 取 pathname 再比较，忽略查询参数差异
    - 新增 `unmounted` 生命周期清理事件监听与路由订阅，修复内存泄漏
    - 引入 `mountVersion` 防止异步 `mounted` 完成前组件已卸载的竞态
- **fix(router/url)**: 修复保留字作为参数/查询键时被覆盖的问题
    - 使用 `Object.defineProperty` 替代直接赋值添加 query 与路由参数，避免 `__proto__` 等保留键污染原型链
    - 修复 base 路径匹配逻辑，从 `startsWith(safeBase)` 改为 `path === safeBase || path.startsWith(safeBase + '/')`，避免将 `/application` 误当作 `base: '/app'` 裁剪
- **fix(base-element)**: 兼容不支持 `CSS.escape` 的环境
    - `CSS.escape` 不可用时降级为正则转义特殊字符，保证样式清理逻辑正常执行

## [0.5.4] - 2026-07-07

### Added

- **feat(commands)**: 为命令式组件新增 `cloneElement` 属性
    - 支持配置是否克隆传入的 HTML 内容
- **feat(commands)**: 新增共享主题观察者 `observeTheme`
    - 统一处理命令式组件的主题适配，移除各组件重复的主题监听逻辑
- **feat(modal)**: 重构 Modal 回调函数，新增 `onConfirm` 并保留 `onOk` 作为兼容别名
- **feat(popconfirm)**: 为 Popconfirm 新增 `close` 方法并优化实例返回类型
- **feat(tooltip)**: 为 Tooltip 新增 `showOnce` 方法

### Changed

- **refactor(size)**: 统一组件尺寸命名
    - 将多处组件尺寸的 `default` 统一替换为 `medium`
    - 调整 `TableSize` 的枚举顺序
- **refactor(pagination)**: 优化分页组件事件命名
    - 将 `sizeChange` 改为 `size-change` 并保留旧事件名兼容
- **refactor(popconfirm)**: 简化 Popconfirm 类名拼接逻辑
    - 使用 `filter(Boolean).join(' ')` 替代三元判断和字符串拼接

### Fixed

- **docs**: 修复多处文档示例中的回调函数命名不一致问题

## [0.5.3] - 2026-06-24

### Changed

- **refactor(commands)**: 给所有命令式组件类名添加 `solely-` 前缀避免样式冲突
    - 为 Drawer、Message、Modal、Popconfirm、Tooltip 等命令式组件的样式类名统一添加 `solely-` 前缀
    - 防止与使用方项目中同名样式类产生冲突

## [0.5.2] - 2026-06-18

### Added

- **feat(router)**: 新增自定义 keepAlive 缓存键与 LRU 淘汰机制
    - `RouteConfig` 新增 `keepAliveKey` 选项，支持自定义缓存键函数，动态路由（如 `/article/:id`）可按不同 id 分别缓存，或配置为同一模板共享缓存
    - `RouterOptions` 新增 `maxKeepAlive` 选项，限制最大缓存数量，超出后按 LRU 策略淘汰最久未访问的实例

### Changed

- **refactor(router)**: 重构路由核心逻辑
    - 重构 `routerReady` 为可调用形式，兼容新旧两种用法
    - 重构 `router-view` 缓存逻辑，适配自定义 `keepAliveKey` 与 `maxKeepAlive` 配置
    - 优化路由匹配、路径归一化与导航守卫逻辑
    - 优化组件状态管理与节点清理逻辑
    - 完善包导出配置与 `sideEffects` 声明

### Fixed

- **fix(router)**: 修复 `router-link` 与 `router-view` 测试用例适配重构后的变更

## [0.5.1] - 2026-06-14

### Changed

- **refactor(base-element)**: 优化销毁与重连逻辑
    - `dispose()` 后设置 `#disposed` 标记，阻止组件 reconnect
    - `connectedCallback` 检测到 disposed 状态时自动 `remove()`，防止已销毁组件重新挂载
    - 修复 `CSS.escape` 在 jsdom 等测试环境中的兼容性，添加正则回退实现
- **refactor(audit-test)**: 升级审查测试页面样式与结构
    - 采用现代卡片式布局、紫靛渐变标题栏、阴影动效
    - 测试按"核心验证"与"生命周期与边界"分组，重点更清晰
    - 子组件操作按钮默认折叠（`details/summary`），避免喧宾夺主
- **docs**: 移除 `onInit()` 生命周期文档，异步初始化统一迁移到 `mounted()`

### Fixed

- **fix(observe)**: 路径过滤支持父路径匹配（如 `'user'` 可匹配 `'user.name'`）
- **fix(observe)**: `ChangeItem.path` 包含完整路径（含 key），修正路径格式化逻辑

## [0.5.0] - 2026-06-14

### Added

- **feat(compiler)**: 添加 Show 显隐控制 AST 类型与编译支持
    - 新增 `Show` 控制流节点，支持条件显隐渲染（保留 DOM，切换 `display`）
    - 条件分支处理逻辑调整以支持 Show 与 If 共存
- **feat(renderer)**: 新增 keepalive 分支缓存 IR 支持
    - 条件分支切换时缓存已渲染子树，避免重复创建和销毁
- **feat(reactivity)**: 新增 computed、watch、watchGetter 响应式工具
    - `computed`：依赖追踪的计算属性，支持懒计算和缓存
    - `watch`：监听特定路径变化，支持深度监听和立即执行
    - `watchGetter`：基于 getter 函数的通用监听
- **feat(component)**: 新增 activated / deactivated 生命周期
    - 配合 keepalive 使用，组件被缓存/激活时触发对应钩子
- **feat(build)**: 新增版本号编译注入与环境变量
    - 构建时自动注入 `SOLELY_VERSION`，组件样式 ID 包含版本信息
    - 新增 `src/shared/env.ts` 管理环境变量

### Changed

- **refactor(shared)**: 优化 `isObject` 类型推导，使用更精确的类型守卫
- **refactor(build)**: 升级 `tsconfig.json` 编译目标到 ES2021
- **refactor(renderer)**: 重写 IR 渲染器节点追踪逻辑，优化静态子树和条件分支的节点 key 生成
- **examples**: 新增控制流演示示例（`examples/control-flow/`），展示 Show / If / For 用法
- **examples**: 新增审查测试示例（`examples/audit-test/`），覆盖 prop 透传、reflect、生命周期、dispose 等场景
- **docs**: 大幅更新 README、API 文档和指南，补充响应式系统、生命周期、Show 控制流等说明

### Fixed

- **fix(tests)**: 修复测试用例样式 ID 生成，适配版本号注入后的新格式
- **fix(base-element)**: 修复布尔类型属性不存在时的默认值处理逻辑

## [0.4.21] - 2026-06-10

### Changed

- **refactor(select)**: 统一选中标签更新逻辑并优化初始化流程
    - 将多处分散的选中标签更新逻辑（`updateSelectedLabel` 和 `updateSelectedLabelFromSlot`）合并为统一的 `syncSelectedLabel` 方法
    - 移除 `setupSlotObserver` 中不必要的 `setTimeout` 延迟收集插槽选项，改为 `mounted` 时同步收集
    - 调整初始化顺序：先同步收集插槽选项，仅在未使用插槽时才走 props options 逻辑

## [0.4.20] - 2026-06-06

### Changed

- **refactor(tooltip)**: 提取 Tooltip 共享类型并统一类型定义
    - 新增 `src/components/tooltip-types.ts` 公共类型文件，统一定义 `TooltipPlacement` 和 `TooltipTrigger`
    - `elements/tooltip/types.ts` 和 `commands/tooltip/types.ts` 均从公共文件导入并重新导出，消除重复定义
    - `elements` 的 `TooltipTrigger` 统一支持 `'manual'`，与 `commands` 保持一致

- **feat(tooltip)**: 声明式 Tooltip 支持 `manual` 触发方式
    - `trigger="manual"` 时不自动绑定 hover/click/focus 事件，完全由 `show()` / `hide()` 方法控制
    - 更新组件文档，补充 `manual` 触发方式的说明和示例

### Fixed

- **fix(components)**: 修复 `TooltipPlacement` 和 `TooltipTrigger` 类型导出冲突
    - 统一入口 `src/components/index.ts` 恢复简洁的 `export *` 语法，无命名冲突

## [0.4.19] - 2026-06-06

### Fixed

- **fix(components)**: 修复类型导出冲突（临时方案）
    - `TooltipPlacement` 和 `TooltipTrigger` 在 `elements` 和 `commands` 模块中定义不同，不能同时通过 `export *` 导出
    - 将 `src/components/index.ts` 中 `commands` 的 `export *` 改为显式具名导出，避免类型命名冲突

## [0.4.18] - 2026-06-06

### Added

- **feat(components)**: 新增 SolelyTooltip 组件及其类型导出
    - 在组件统一导出文件中补充 Tooltip 组件和对应类型的导出项

### Changed

- **refactor(router)**: 优化清理逻辑并添加路由销毁方法
    - 优化路由核心清理逻辑
    - 为路由实例添加 `destroy` 方法
    - 调整 router-view 相关实现

## [0.4.17] - 2026-06-04

### Changed

- **refactor(renderer)**: 重写 IR 渲染器节点追踪逻辑
    - 将原有 marker 标记方案替换为新旧节点映射对比方式
    - 优化静态子树和循环/条件分支的节点 key 生成逻辑
    - 简化节点清理流程

## [0.4.16] - 2026-05-31

### Changed

- **refactor(compiler)**: 优化解析与 IR 处理逻辑
    - 修复正则表达式 `lastIndex` 未重置导致的解析异常
    - 重构行号计算为 `indexOf` 循环替代低效遍历，改用二分法快速计算位置
    - 重写闭合标签匹配逻辑，精准匹配并截断栈到正确位置
    - 简化缓存 key 生成逻辑，直接使用 local 索引和标识拼接
    - 优化 model 属性处理，支持 trim 输入并修正路径拼接逻辑
    - 重构静态子树标记函数，改为单次后序遍历并返回静态状态，移除冗余 `isStaticNode` 函数

## [0.4.15] - 2026-05-31

### Changed

- **refactor**: 重构代码结构并修复若干细节问题
    - 抽离 `camelToKebab` 工具函数到独立文件并全局导出
    - 优化 `isObject` 实现，使用 `Set` 替代数组提升查询性能
    - 重构 `htmlDecode` 工具，简化闭包结构并修复换行问题
    - 为 `setProperty` 添加 SVG 处理参数和类型注释
    - 为 `evalIR` 添加开发环境错误捕获
    - 修复 weather 示例中的 `$event` 引用问题
    - 重构响应式系统，添加深度限制防止栈溢出，优化路径计算逻辑，添加开发环境告警
    - 优化 `BaseElement` 的属性升级逻辑和样式处理

- **docs(tooltip)**: 替换示例按钮为自定义演示元素
    - 将原有的 small 尺寸 solely-button 替换为带样式的 span 元素，统一演示示例的视觉样式
    - 添加方向箭头标注更清晰

## [0.4.14] - 2026-05-29

### Added

- **feat(modal, input)**: 完善弹窗与输入框功能，新增克隆元素与回调增强
    - 弹窗 Modal 新增 `cloneElement` 配置项，支持是否克隆传入的 DOM 元素
    - 重构 `onOk` 回调类型，支持返回元素/数据并精准控制弹窗关闭
    - 调整输入框 DOM 引用获取时机，优化挂载逻辑避免潜在空引用问题
    - 新增表单弹窗示例与克隆元素弹窗示例文档

- **feat(vscode-extension)**: VS Code 扩展版本更新与功能增强
    - v0.1.2：新增事件绑定语法高亮支持，更新生命周期钩子匹配规则，新增 getter 属性悬停提示与定义跳转支持，完善继承链查找与链式调用方法解析逻辑
    - v0.1.1：完善语法高亮支持（插值标点、绑定语法），优化 hover 提示显示属性类型，添加诊断防抖与文件缓存机制，修复控制流标签校验和插值校验逻辑

### Changed

- **refactor(templateParser)**: 拆分过长的正则表达式字符串
    - 将两行过长的正则字面量拆分为多行拼接，提升代码可读性和可维护性

- **refactor**: 优化组件事件与无障碍支持，修复内存泄漏
    - 统一组件自定义事件为 `CustomEvent` 并携带数据
    - 为多个组件添加 ARIA 属性支持与键盘交互
    - 新增组件卸载时的资源清理逻辑，修复定时器与请求泄漏
    - 更新文档中事件使用方式与 API 说明

- **refactor(slider, coordinate-input)**: 调整组件生命周期和属性变更钩子
    - 移除 `SolelySlider` 的 `afterMount` 钩子，调整元素获取时机
    - 将 `coordinate-input` 的 `beforeUnmount` 改为 `unmounted`，`onPropChange` 改为 `attributeChanged`

## [0.4.13] - 2026-05-24

### Added

- **feat(csp)**: 组件库全面支持 CSP 严格模式
    - 所有组件模板从 `?raw` 运行时编译迁移至 `?solely` 预编译，npm 包原生兼容 CSP 严格模式（无需 `unsafe-eval`）
    - 路由组件 `router-link` 从内联模板迁移至 `?solely` 预编译导入
    - 新增 `isCSPBlocked()` 函数，检测当前环境是否受 CSP 限制
    - `createFunction` 增加 CSP 检测，当 `new Function()` 被 CSP 阻止时输出友好错误提示及解决方案
    - 新增 `examples/csp-demo/` CSP 对比示例，展示 `?solely` 与 `?raw` 在严格 CSP 下的差异

### Changed

- **refactor**: 统一日志前缀为 `[Solely]`
    - `templateError.ts` 中 `Template Error` → `[Solely]`，`[Template Error]` → `[Solely]`
    - `buildIR.ts` 中 `[IR Compile Error]` → `[Solely]`，`[IR]` → `[Solely]`
    - `decorators.ts` 中 `[Style Warning]` → `[Solely]`

- **refactor(buildIR)**: 提取 IR 版本号为顶部常量 `IR_VERSION`，替代硬编码值

- **chore(package)**: 在 `files` 字段中添加 `!dist/icons` 排除规则，避免 Bootstrap Icons 打入 npm 包

## [0.4.12] - 2026-05-23

### Added

- **feat(components)**: 为组件添加 CSS Part 自定义样式支持
    - 为 Button、Tag、Radio、Checkbox、Tab、Alert、Badge、Card、Switch、Input、Select 等基础组件添加 `part` 属性，支持通过 CSS `::part()` 伪元素自定义样式
    - 为 Modal、Drawer、Tooltip、Message、Popconfirm 等弹出组件添加自定义类名样式支持
    - 更新各组件文档，新增 CSS Part 自定义样式演示示例与 API 说明

- **feat(backtop)**: 为回到顶部组件添加属性读写支持
    - 添加 `visibilityHeight` 和 `duration` 的 getter/setter，支持外部读写配置
    - 更新文档，新增事件演示和属性读取配置示例

- **test**: 为核心模块添加完整测试用例
    - 新增模板错误处理、路由组件、Vite 插件、渲染器和 IR 构建器的完整测试套件
    - 覆盖各类功能场景和边界情况，完善项目测试覆盖率

### Changed

- **refactor(components)**: 统一组件规范，修复事件与样式问题
    - 为 Fab 和 Button 组件添加默认 `type="button"`，防止默认提交行为
    - 为 Upload 组件添加 `fileList` setter 同步数据
    - 为 Tooltip 组件添加 show/hide 事件抛出
    - 重构 Pagination 组件事件名，新增 `sizeChange` 并兼容旧版 `showSizeChange`
    - 将文档样式替换为 CSS 变量统一主题色

- **refactor(components)**: 标准化组件事件 Detail 类型定义
    - 为 Tabs、Steps、Tree 组件新增事件 Detail 类型接口
    - 替换组件内事件派发的类型断言为正式的事件 Detail 类型
    - 更新文档中的事件类型注释，统一使用自定义类型名

- **refactor(components)**: 为表单组件添加无障碍属性
    - 为 Rate、Slider、Steps、Tabs、Tree 组件添加 ARIA 无障碍属性
    - 优化屏幕阅读器兼容性，统一格式化模板缩进样式

- **style(button)**: 补充 danger 类型文本/链接按钮的样式
    - 完善危险按钮中 text 和 link 变体的颜色样式，修复对应状态下的配色缺失问题

- **docs**: 更新各组件文档的属性事件说明与排版
    - 统一将文档中"支持属性和方法操作"改为"支持属性读写"
    - 补充事件是否为原生/自定义事件的说明
    - 调整 Button 组件的插槽与方法文档排版位置
    - 补全 Input 组件的方法表格与参数返回值列
    - 调整 Tabs 组件的插槽文档位置并补全方法返回值
    - 移除 Switch 组件的冗余事件处理示例
    - 整理 Select 组件的文档结构，移动并补全类型定义与方法表格

- **build(vitest)**: 更新测试覆盖率配置
    - 更新覆盖率统计的排除文件范围，忽略类型声明文件、入口 index 文件以及组件、类型目录文件
    - 添加 lcov reporter 到测试覆盖率输出

## [0.4.11] - 2026-05-21

### Added

- **feat(tooltip)**: 添加声明式 Tooltip 组件并优化命令式 Tooltip
    - 新增声明式 Tooltip 组件，支持通过 HTML 属性方式使用
    - 优化命令式 Tooltip 的 API 和性能
    - 支持更多配置选项，如位置、触发方式、延迟等

- **feat(vscode-extension)**: 新增 Solely 框架 VS Code 扩展支持
    - 提供组件语法高亮和智能提示
    - 支持模板语法补全和错误检测
    - 集成框架文档快速查阅功能

### Changed

- **refactor(templateParser)**: 拆分正则表达式为多行字符串提升可读性
    - 优化正则表达式的组织结构
    - 提高代码可维护性和可读性

## [0.4.10] - 2026-05-10

### Added

- **feat(components)**: 为所有组件添加 mounted 时调用 refresh 方法
    - 确保组件在挂载后能正确刷新状态

- **feat(components)**: 为多个组件添加插槽支持并优化数据绑定
    - 为 Tag、Empty、Switch、Button 等组件添加插槽支持，增强自定义能力
    - 优化 Timeline、Steps、Tabs 等组件的数据绑定逻辑，支持响应式更新
    - 更新文档展示插槽用法和数据绑定示例

- **feat(alert)**: 添加插槽支持以自定义图标和关闭按钮
    - 为 Alert 组件添加 `icon` 和 `close-icon` 插槽，允许用户自定义图标和关闭按钮
    - 调整样式以支持插槽内容，并更新文档展示插槽用法

### Changed

- **refactor(table)**: 重构表格组件数据解析逻辑
    - 使用 getter 方法替代内部状态，提升性能和响应性

- **style(button)**: 重命名按钮形状样式类名
    - 添加 `btn--shape-` 前缀，统一命名规范

- **docs(table)**: 添加表格组件属性绑定和 JS API 使用示例

- **chore**: 更新 tsconfig.json 包含 docs 目录

## [0.4.9] - 2026-05-08

### Added

- **feat(accessibility)**: 为多个组件添加 ARIA 属性以提升可访问性
    - **Button**: 添加 `aria-disabled` 属性，支持屏幕阅读器识别禁用状态
    - **Input**: 添加 `aria-disabled`、`aria-readonly`、`aria-invalid` 属性，完善表单无障碍支持
    - **Select**: 添加 `role="combobox"`、`aria-expanded`、`aria-disabled` 等属性，下拉选项支持 `role="option"` 和 `aria-selected`
    - **Radio**: 添加 `role="radio"`、`aria-checked`、`aria-disabled` 属性

### Changed

- **docs(components-docs)**: 为组件文档的类型定义添加代码块容器
    - 优化类型定义在文档中的展示效果
    - 统一文档中代码块的样式

### Refactored

- **refactor**: 优化 Z_INDEX 常量值并移除未使用的代码
- **style**: 清理 .gitignore 和 .eslintrc.cjs 中的冗余配置

### Fixed

- **fix**: 修复未使用的变量和错误处理逻辑

## [0.4.8] - 2026-05-07

### Added

- **feat(select)**: 增强 Select 组件功能
    - 新增 header/footer 插槽支持，可固定显示在下拉框顶部和底部
    - 添加分组功能，通过 `data-group` 属性标记分组标题
    - 优化下拉框布局结构，header/footer 固定，中间内容区域独立滚动
    - 支持自定义滚动条样式，适配暗色主题
    - 更新文档示例，展示分组展示和插槽使用场景

- **feat(skeleton)**: 增加头像位置配置
    - 新增 `avatarPosition` 属性，支持头像在左侧或右侧显示
    - 适用于对话列表等需要左右布局的场景

## [0.4.7] - 2026-05-06

### Added

- **feat(docs)**: 为组件文档添加交互式演示和事件日志功能
    - 为 Alert、Empty 和 Badge 组件的文档页面添加交互式演示功能
    - 增加事件监听和操作日志显示区域
    - 实现组件方法调用的演示功能
    - 统一添加事件日志记录和显示逻辑

### Changed

- **style(components)**: 使用 CSS 变量替换硬编码颜色值
    - 统一使用 CSS 变量管理颜色值，提升主题切换的灵活性和维护性
    - 修改涉及 FAB 组件和 NotFound 组件的样式文件

## [0.4.6] - 2026-05-06

### Changed

- **refactor(components)**: 优化组件事件处理与属性暴露
    - 移除 Checkbox 组件冗余的 change 事件派发
    - 在 Message 组件中使用常量 Z_INDEX 替代硬编码值
    - 为 Tree 组件添加 value 和 selectedKeys 属性，提供更一致的 API

- **refactor(pagination)**: 优化分页组件计算可见页码的逻辑
    - 将计算可见页码的方法改为返回计算结果而非直接修改状态
    - 移除重复的 calculateVisiblePages 调用
    - 更新模板中引用计算页码的方式

- **refactor(commands/message)**: 清理导入路径中的注释
    - 移除导入路径中不必要的注释，保持代码整洁

### Added

- **docs**: 添加第三方资源说明和许可证文件
    - 添加 Bootstrap Icons 使用说明到 README
    - 添加 LICENSE 和 NOTICE 文件

## [0.4.5] - 2026-05-05

### Added

- **feat(icon)**: 新增 SVG 图标组件及文档
    - 添加全新的 SolelyIcon 组件，支持 SVG Sprite 和自定义图标注册
    - 提供尺寸、颜色、旋转等属性控制
    - 集成到组件文档系统

- **feat(router)**: 添加 404 页面组件及路由支持
    - 新增 NotFound 404 页面组件，支持自定义标题、描述和返回按钮
    - 扩展路由配置支持指定 404 组件
    - 优化 RouterView 对未匹配路由的处理逻辑，优先显示配置的 404 组件

### Changed

- **refactor(icon)**: 优化图标组件代码格式和日志级别
    - 将 console.log 改为 console.info 以区分日志级别
    - 调整 SVG 字符串的格式以提高可读性
    - 统一文档中图标注册的代码格式

## [0.4.4] - 2026-04-27

### Added

- **feat(message)**: 支持消息组件多位置显示功能
    - 添加消息组件在 4 个不同位置显示的能力，包括顶部、底部、左侧和右侧的各种组合
    - 更新全局配置支持设置默认位置和各个方向的偏移量
    - 重构消息容器管理逻辑以支持多位置布局

### Fixed

- **fix(message)**: 修复获取容器时的类型断言问题

## [0.4.3] - 2025-04-26

### Changed

- **refactor(components)**: 优化样式变量和组件交互逻辑
    - **BackTop**: 改进返回顶部组件，支持相对容器定位和祖先滚动监听
    - **CSS 变量**: 统一使用 CSS 变量管理阴影和 z-index，统一组件样式规范
    - 更新组件文档样式和示例

## [0.4.2] - 2025-04-24

### Added

- **feat(components)**: 实现表单组件的双向绑定功能
    - 为 Checkbox、Radio、Switch、Input 和 Select 组件添加 s-model 双向绑定支持
    - 通过 model 配置指定属性和事件

### Changed

- **refactor(steps)**: 为步骤条组件添加插槽支持
    - 允许通过插槽自定义步骤内容
    - 支持动态更新和禁用状态
    - 为表单组件添加插槽样式

- **refactor(components/steps)**: 使用类型断言替代 any 类型

### Fixed

- **fix(base-element)**: 修复属性默认值覆盖问题
    - 修复当通过 s-model 等方式设置属性后，默认值不应覆盖已设置值的问题

## [0.4.1] - 2025-04-23

### Added

- **feat(components)**: 命令式组件支持 HTMLElement 内容
    - Modal、Drawer、Message、Popconfirm、Tooltip 支持传入 HTMLElement 作为内容
    - 支持在弹出组件中渲染自定义 DOM 结构

- **feat(select)**: 下拉框自动调整位置
    - 根据视口空间自动决定向上或向下展开
    - 当选择器位于页面底部时自动向上展开下拉框

- **feat(modal)**: 添加 `showIcon` 属性控制是否显示默认图标
- **feat(popconfirm)**: 添加 `showIcon` 属性控制是否显示默认图标

### Changed

- **refactor(docs)**: 重构文档布局
    - 使用 CSS Grid 布局替代 Flexbox
    - 优化文档站点整体布局结构，避免页面级滚动条
    - 代码框样式优化，恢复 macOS 风格窗口按钮和 Dracula 主题高亮

- **refactor(components)**: 优化代码结构和样式格式
    - 统一组件代码风格
    - 修复 lint 警告

### Fixed

- **fix(card)**: 添加动作点击索引边界检查
- **fix(components)**: 修复触摸事件处理和 JSON 解析安全问题
- **fix(component)**: 修复数据属性同步到 $data 的问题

## [0.4.0] - 2025-04-23

### Added

- **feat(components)**: 新增组件库结构与 CSS 变量
    - 新增主题 CSS 变量文件，支持组件主题定制
    - 更新 package.json 配置，支持组件导入/导出路径
    - 增强 CustomElement 装饰器，优化错误处理与短横线命名转换

- **feat(components)**: 增加 UI 组件
    - 基础组件：Button、Tag、Badge、Card、Alert、Divider、Empty、Skeleton、Progress
    - 表单组件：Input、Select、Radio、Checkbox、Switch、Slider、Rate、CoordinateInput、Upload
    - 数据展示组件：Table、Tree、Pagination、Timeline、Tabs、Steps、Breadcrumb
    - 反馈组件：Tooltip、Popconfirm、Modal、Message、Drawer、Backtop、Fab

### Fixed

- **fix(decorators)**: 修正类型断言以确保正确挂载 manifest

## [0.3.1] - 2025-04-19

### Fixed

- **fix(base-element)**: 修正属性值转换逻辑并统一属性命名风格
    - 修复布尔类型属性不存在时的默认值处理逻辑
    - 将测试用例中的属性名从 kebab-case 改为 camelCase 以保持一致

## [0.3.0] - 2025-04-19

### Added

- **feat(component)**: 增强属性处理机制并优化响应式系统
    - 新增 `reactive` 配置项控制属性是否响应式更新
    - 重构属性映射逻辑，分离 `attributeMap` 和 `propMap`
    - 实现自动属性升级机制，无需手动声明 `upgradeProps`
    - 优化样式管理，支持非 Shadow DOM 模式的样式引用计数
    - 添加 `emitNative` 方法用于派发原生事件
    - 更新文档说明属性名转换规则和响应式配置

## [0.2.9] - 2025-04-11

### Fixed

- **fix(router)**: 修复嵌套路由视图层级检测问题
    - 改进 router-view 的层级检测逻辑，正确处理 Shadow DOM 边界情况
    - 添加嵌套路由测试页面的样式和 Shadow DOM 配置

- **fix(runtime)**: 添加对象和数组解析错误的日志输出
    - 在解析对象和数组值时捕获异常并输出错误日志，便于调试问题

### Added

- **feat(component)**: 增加对数组类型的属性支持
    - 添加 'array' 类型到 PropType 并在 base-element 中实现数组属性的解析逻辑
    - 支持处理单引号格式的数组字符串

- **feat(renderer)**: 添加 HTML 实体解码功能并优化文本处理
    - 新增 htmlDecode 工具函数用于解码 HTML 实体
    - 在文本渲染时处理静态内容的 HTML 实体解码
    - 优化路由器事件监听逻辑，区分 hash 和 history 模式
    - 改进 HTML 解析器对空白文本节点的处理逻辑
    - 更新 .gitignore 忽略未完成组件目录

## [0.2.8] - 2025-04-06

### Changed

- 改进路由系统和组件类型定义

## [0.2.7] - 2025-04-05

### Changed

- 优化编译器元数据生成和日志配置

## [0.2.6] - 2025-04-04

### Added

- 增强路由创建功能并添加安全演示页面

## [0.2.5] - 2025-04-03

### Fixed

- 添加缺失的依赖 `magic-string`

### Security

- 完善安全文档和示例，增加对 `href` 和 `src` 绑定的风险说明

## [0.2.4] - 2025-04-02

### Added

- 实现嵌套路由和 KeepAlive 缓存功能

### Changed

- 更新仓库 URL 和 Node.js 版本配置

## [0.2.3] - 2025-04-01

### Changed

- 更新版本号至 0.2.3

## [0.2.2] - 2025-03-31

### Changed

- 移除更新 npm 到最新版本的步骤
- 更新 release.yml 添加 npm 升级步骤
- 更新 Node.js 版本至 22
- 移除发布到 npm 时的 NODE_AUTH_TOKEN 环境变量

## [0.2.1] - 2025-03-31

### Added

- 添加静态子树优化支持

### Changed

- 使用 Trusted Publishing 替代 NPM_TOKEN
- 使用 npm publish with GitHub token for Trusted Publishing
- 使用 JS-DevTools/npm-publish 以获得更好的 provenance 支持
- 从测试矩阵中移除 Node 18 以修复 jsdom 兼容性问题

### Fixed

- 修复 tsconfig 排除 examples 目录

## [0.2.0] - 2025-03-31

### Added

- 添加 CI/CD 自动化工作流
- 添加 ESLint 和 Prettier 代码规范
- 添加 Husky 和 lint-staged 提交检查
- 添加 CONTRIBUTING.md 贡献指南

### Changed

- 优化 `gen-function.ts`，移除重复的缓存逻辑，由上层 `FunctionCompiler` 统一管理
- 重构路由模块并优化插件系统
- 增强安全机制并优化函数生成逻辑
- 为接口添加详细的 TSDoc 注释
- 重构响应式系统，优化组件生命周期管理，完善文档
- 优化 `observe` 函数处理循环引用和路径解析
- 将登录结果的条件渲染从 `p` 标签改为 If/Else 结构
- 优化动态样式和类处理逻辑

### Fixed

- 修复 README 中的 logo 显示方式，使用 `img` 标签替代 markdown 语法
- 优化路由器逻辑和组件状态管理，优化 style 和 class 的处理

## [0.1.10] - 2025-03-31

### Added

- 轻量级 Web 组件框架核心功能
- 基于 AST 的模板编译系统
- 响应式数据绑定系统
- 原生 Web 组件支持（Custom Elements）
- 内置路由系统，支持单页应用开发
- Vite 插件支持编译时优化
- XSS 安全防护机制
- TypeScript 完整类型支持
- 装饰器 API（`@CustomElement`）
- 模板语法支持：插值表达式、事件绑定、条件渲染、列表渲染
- 完整的单元测试覆盖
- **编译器**：HTML 模板解析、IR（中间表示）生成
- **运行时**：组件生命周期管理、响应式系统、虚拟 DOM 渲染
- **路由**：声明式路由配置、路由守卫、嵌套路由
- **插件**：Vite 插件集成，支持单文件组件开发

## 版本说明

### 版本号格式

`主版本号.次版本号.修订号`

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型

- `Added`：新功能
- `Changed`：现有功能的变更
- `Deprecated`：已弃用功能
- `Removed`：已删除功能
- `Fixed`：问题修复
- `Security`：安全相关修复

---

[Unreleased]: https://github.com/solelyjs/solely/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/solelyjs/solely/compare/v0.5.8...v0.6.0
[0.5.8]: https://github.com/solelyjs/solely/compare/v0.5.7...v0.5.8
[0.5.7]: https://github.com/solelyjs/solely/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/solelyjs/solely/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/solelyjs/solely/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/solelyjs/solely/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/solelyjs/solely/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/solelyjs/solely/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/solelyjs/solely/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/solelyjs/solely/compare/v0.4.21...v0.5.0
[0.4.21]: https://github.com/solelyjs/solely/compare/v0.4.20...v0.4.21
[0.4.20]: https://github.com/solelyjs/solely/compare/v0.4.19...v0.4.20
[0.4.19]: https://github.com/solelyjs/solely/compare/v0.4.18...v0.4.19
[0.4.18]: https://github.com/solelyjs/solely/compare/v0.4.17...v0.4.18
[0.4.17]: https://github.com/solelyjs/solely/compare/v0.4.16...v0.4.17
[0.4.16]: https://github.com/solelyjs/solely/compare/v0.4.15...v0.4.16
[0.4.15]: https://github.com/solelyjs/solely/compare/v0.4.14...v0.4.15
[0.4.14]: https://github.com/solelyjs/solely/compare/v0.4.13...v0.4.14
[0.4.13]: https://github.com/solelyjs/solely/compare/v0.4.12...v0.4.13
[0.4.12]: https://github.com/solelyjs/solely/compare/v0.4.11...v0.4.12
[0.4.11]: https://github.com/solelyjs/solely/compare/v0.4.10...v0.4.11
[0.4.10]: https://github.com/solelyjs/solely/compare/v0.4.9...v0.4.10
[0.4.9]: https://github.com/solelyjs/solely/compare/v0.4.8...v0.4.9
[0.4.8]: https://github.com/solelyjs/solely/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/solelyjs/solely/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/solelyjs/solely/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/solelyjs/solely/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/solelyjs/solely/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/solelyjs/solely/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/solelyjs/solely/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/solelyjs/solely/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/solelyjs/solely/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/solelyjs/solely/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/solelyjs/solely/compare/v0.2.9...v0.3.0
[0.2.9]: https://github.com/solelyjs/solely/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/solelyjs/solely/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/solelyjs/solely/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/solelyjs/solely/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/solelyjs/solely/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/solelyjs/solely/compare/v0.2.4...main
[0.2.3]: https://www.npmjs.com/package/solely/v/0.2.3
[0.2.0]: https://www.npmjs.com/package/solely/v/0.2.0
[0.1.10]: https://www.npmjs.com/package/solely/v/0.1.10
