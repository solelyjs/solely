# 贡献指南

感谢您对 Solely 项目的关注！我们欢迎各种形式的贡献，包括但不限于：

- 报告问题（Bug Reports）
- 功能建议（Feature Requests）
- 代码贡献（Code Contributions）
- 文档改进（Documentation Improvements）
- 测试用例（Test Cases）

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
    - [报告问题](#报告问题)
    - [提交代码](#提交代码)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [提交信息规范](#提交信息规范)
- [发布流程](#发布流程)

## 行为准则

参与本项目即表示您同意遵守以下准则：

- 尊重所有参与者，保持友善和耐心
- 欢迎不同的观点和经验
- 接受建设性的批评
- 关注对社区最有利的事情

## 如何贡献

### 报告问题

如果您发现了 bug 或有功能建议，请通过 [GitHub Issues](https://github.com/solelyjs/solely/issues) 提交。

#### 提交 Bug 报告

请包含以下信息：

1. **问题描述**：清晰简洁地描述问题
2. **复现步骤**：详细的步骤说明如何复现问题
3. **期望行为**：描述您期望发生的行为
4. **实际行为**：描述实际发生的行为
5. **环境信息**：
    - 操作系统
    - Node.js 版本
    - 浏览器及版本（如适用）
    - Solely 版本
6. **代码示例**：最小可复现的代码示例

#### 提交功能建议

1. **功能描述**：清晰描述您想要的功能
2. **使用场景**：描述这个功能将如何解决您的问题
3. **可能的实现方案**（可选）：如果您有实现思路，欢迎分享

### 提交代码

1. **Fork 仓库**：点击 GitHub 上的 Fork 按钮
2. **克隆仓库**：

    ```bash
    git clone https://github.com/YOUR_USERNAME/solely.git
    cd solely
    ```

3. **创建分支**：

    ```bash
    git checkout -b feature/your-feature-name
    # 或
    git checkout -b fix/your-bug-fix
    ```

4. **安装依赖**：

    ```bash
    npm install
    ```

5. **进行更改**：编写代码并确保通过所有测试
6. **提交更改**：

    ```bash
    git add .
    git commit -m "feat: 添加新功能"
    ```

7. **推送到 Fork**：

    ```bash
    git push origin feature/your-feature-name
    ```

8. **创建 Pull Request**：在 GitHub 上创建 PR

## 开发环境设置

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/solelyjs/solely.git
cd solely

# 安装依赖
npm install

# 运行测试
npm test

# 构建项目
npm run build

# 运行示例
npm run dev
```

### 可用脚本

```bash
npm run build      # 构建项目
npm run test       # 运行单元测试
npm run test:ui    # 运行测试并打开 UI
npm run dev        # 启动开发服务器
npm run preview    # 预览构建结果
```

## 代码规范

### TypeScript 规范

- 使用 TypeScript 严格模式
- 所有公共 API 必须有类型定义
- 避免使用 `any` 类型
- 使用接口（interface）定义对象形状

### 代码风格

- 使用 4 个空格缩进
- 使用单引号
- 语句末尾使用分号
- 最大行长度 120 字符

### 文件组织

```
src/
├── compiler/      # 编译器相关代码
├── runtime/       # 运行时代码
├── router/        # 路由系统
├── shared/        # 共享工具函数
├── types/         # 类型定义
└── plugins/       # 插件系统
```

### 测试规范

- 所有新功能必须包含测试用例
- 测试文件命名：`*.test.ts`
- 测试覆盖率应保持在 80% 以上

## 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型（Type）

- **feat**: 新功能
- **fix**: 修复问题
- **docs**: 文档变更
- **style**: 代码格式（不影响功能的变动）
- **refactor**: 代码重构
- **perf**: 性能优化
- **test**: 测试相关
- **chore**: 构建过程或辅助工具的变动

### 示例

```bash
# 新功能
feat(compiler): 添加模板缓存机制

# 修复问题
fix(runtime): 修复响应式数据更新异常

# 文档更新
docs: 更新 API 文档

# 代码重构
refactor(router): 优化路由匹配算法
```

## 发布流程

1. 更新 `CHANGELOG.md`
2. 更新 `package.json` 中的版本号
3. 创建发布 PR
4. 合并到 main 分支
5. 打标签并发布：

    ```bash
    git tag v0.1.11
    git push origin v0.1.11
    ```

6. GitHub Actions 将自动发布到 npm

## 获取帮助

如果您在贡献过程中需要帮助：

- 查看 [文档](./docs/)
- 在 [GitHub Discussions](https://github.com/solelyjs/solely/discussions) 提问
- 联系维护者

## 许可证

通过贡献代码，您同意您的贡献将在 [MIT 许可证](./LICENSE) 下发布。

---

再次感谢您的贡献！🎉
