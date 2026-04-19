# Changelog

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.3.0] - 2025-04-19

### Added

- **feat(component)**: 增强属性处理机制并优化响应式系统
    - 新增 `reactive` 配置项控制属性是否响应式更新
    - 重构属性映射逻辑，分离 `attributeMap` 和 `propMap`
    - 实现自动属性升级机制，无需手动声明 `upgradeProps`
    - 优化样式管理，支持非 Shadow DOM 模式的样式引用计数
    - 添加 `emitNative` 方法用于派发原生事件
    - 更新文档说明属性名转换规则和响应式配置

### Fixed

- **fix(base-element)**: 修正属性值转换逻辑并统一属性命名风格
    - 修复布尔类型属性不存在时的默认值处理逻辑
    - 将测试用例中的属性名从 kebab-case 改为 camelCase 以保持一致

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

[Unreleased]: https://github.com/solelyjs/solely/compare/v0.3.0...HEAD
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
