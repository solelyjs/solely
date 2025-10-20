# Solely 示例与组件目录

本目录包含使用 Solely Web Components 框架构建的示例与演示页面，涵盖常用组件与功能特性，便于快速对齐用法与最佳实践。

## 目录结构

```
examples/
├── index.html            # 示例首页（带导航与使用说明）
├── index.ts              # 组件注册入口（统一导入/注册）
├── components/           # 组件示例分组
│   ├── counter/          # 计数器组件
│   ├── todo-list/        # 待办列表组件
│   └── user-card/        # 用户卡片组件
├── router-test/          # 路由相关示例
├── template-tags-test/   # 模板标签示例
├── framework-lab/        # 框架实验（综合功能实验）
├── pages/                # 独立页面分组
│   ├── basic.html        # observe 基础示例
│   ├── demo.html         # 演示页面
│   ├── filter-deep-compare.html  # 深比较过滤示例
│   └── throttle.html     # 节流示例
└── _archive/             # 历史文件归档（如存在）
```

说明：已移除 `readme.html`（内容与示例首页及本 README 重叠）；已清理 `counter copy/` 目录内的重复文件。如需保留历史版本，建议迁入 `_archive/`。

## 访问方式

- 开发环境：运行 `npm run dev` 后，访问 `http://localhost:5173/examples/index.html`
- 独立示例建议引用打包产物：`../dist/solely.js`（在 `pages/basic.html`、`pages/throttle.html`、`pages/filter-deep-compare.html` 已统一）

## 示例索引（首页导航）

- `./components/counter/counter.html` 计数器 Counter
- `./components/user-card/user-card.html` 用户卡片 User Card
- `./components/todo-list/todo-list.html` 待办列表 Todo List
- `./router-test/router-test.html` 路由测试 Router Test
- `./template-tags-test/template-tags-test.html` 模板标签 Template Tags
- `./framework-lab/framework-lab.html` 框架实验 Framework Lab
- `./pages/basic.html` observe 基础示例
- `./pages/demo.html` 演示 Demo
- `./pages/filter-deep-compare.html` 深比较过滤示例
- `./pages/throttle.html` 节流示例

## 组件注册入口（index.ts）

`examples/index.ts` 统一导入并注册示例所需组件，示例首页只需引入该入口即可完成组件注册：

```ts
// examples/index.ts（片段）
export { default as CounterElement } from './components/counter/counter';
export { default as TodoListElement } from './components/todo-list/todo-list';
export { default as UserCardElement } from './components/user-card/user-card';

import './components/counter/counter';
import './components/todo-list/todo-list';
import './components/user-card/user-card';
import './framework-lab/framework-lab';
import './template-tags-test/template-tags-test';
import './router-test/router-test';
```

## 在示例页中引入库

- 示例首页：`index.html` 已使用 `../dist/solely.js`（推荐）与 `./index.ts`
- 按需引入：可直接在页面中 `import './counter/counter.ts'` 等组件文件
- 外部项目：建议通过包管理器安装使用并引入打包入口

## 新增示例的推荐流程

1. 在 `examples/` 下创建子目录（如 `my-example/`）
2. 添加 `my-example.html / .ts / .css`，使用唯一的自定义元素标签
3. 在 `examples/index.ts` 中导入并注册组件/示例
4. 将示例链接加入 `examples/index.html` 的“示例导航”列表
5. 独立 HTML 示例优先从 `../dist/solely.js` 导入 API（如 `observe`）

## 优化与修复记录

- 删除 `readme.html`（与首页和 README 重叠，避免维护成本与导航重复）
- 统一独立示例的 `observe` 导入至 `../dist/solely.js`（修复 TS 路径加载不一致）
- 删除 `counter copy/` 内重复文件，避免目录噪音与误用
- 示例首页 `index.html` 的“导入组件”代码片段改为真实路径（`./index.ts` 或 `./counter/counter.ts` 等）
- 示例首页改为从 `../dist/solely.js` 引入库，减少开发期网络请求中断提示

## 注意事项

- 示例为学习与演示用途，生产环境请按需增强健壮性与异常处理
- 推荐通过 `$data` 或在 `props` 中声明类型来传递非字符串数据
- 如需保留历史文件，请统一迁入 `examples/_archive/` 目录
