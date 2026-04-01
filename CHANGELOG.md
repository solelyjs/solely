# Changelog

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 添加 CI/CD 自动化工作流
- 添加 ESLint 和 Prettier 代码规范
- 添加 Husky 和 lint-staged 提交检查
- 添加 CONTRIBUTING.md 贡献指南

### Changed

- 优化 `gen-function.ts`，移除重复的缓存逻辑，由上层 `FunctionCompiler` 统一管理

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

### Features

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

[Unreleased]: https://github.com/solelyjs/solely/compare/v0.1.10...HEAD
[0.1.10]: https://github.com/solelyjs/solely/releases/tag/v0.1.10
