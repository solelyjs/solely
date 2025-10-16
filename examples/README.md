# Solely框架组件

本目录包含使用Solely Web Components框架构建的示例组件。这些组件展示了如何使用框架的功能创建可重用、封装良好的UI元素。

## 组件结构

每个组件都遵循一致的结构：

```
components/
├── component-name/
│   ├── component-name.ts    # 包含组件逻辑的主TypeScript文件
│   ├── component-name.html  # HTML模板
│   ├── component-name.css   # 样式文件
├── index.ts                 # 组件注册入口文件
└── README.md               # 本文档
```

## 可用组件

### 1. 计数器组件 (`solely-counter`)

一个简单的计数器，具有以下功能：

- 增加和减少计数功能
- 可自定义步长
- 重置按钮
- 响应式设计

**使用方法：**

```html
<solely-counter></solely-counter>
```

### 2. 待办事项列表组件 (`solely-todo-list`)

一个功能完整的待办事项列表，具有：

- 添加新的待办事项
- 将项目标记为已完成
- 过滤项目（全部/活跃/已完成）
- 删除单个项目
- 清除所有已完成的项目
- 项目数量显示

**使用方法：**

```html
<solely-todo-list></solely-todo-list>
```

### 3. 用户卡片组件 (`solely-user-card`)

用户资料卡片，具有：

- 头像和基本用户信息
- 状态指示器（活跃/非活跃）
- 可展开的详情部分
- 基于用户ID的动态数据加载

**使用方法：**

```html
<!-- 默认用户 -->
<solely-user-card></solely-user-card>

<!-- 指定ID的用户 -->
<solely-user-card user-id="2"></solely-user-card>
```

## 如何构建和使用

### 构建组件

要构建这些组件，您需要将它们集成到主构建过程中。目前，这些是示例组件，用于展示结构和使用模式。

### 查看示例

1. 构建项目后，在浏览器中打开`components/index.html`文件
2. 或者，使用项目的预览服务器：

   ```bash
   npm run preview
   ```

   然后导航到根页面查看示例

## 创建您自己的组件

要创建新组件：

1. 在`components/`中创建新目录
2. 创建三个必需文件（ts, html, css）
3. 继承`BaseElement`类并使用`@CustomElement`装饰器
4. 定义您的模板、样式和组件逻辑
5. 使用唯一的标签名注册组件
6. 在`components/index.ts`中导入并注册您的组件

## 展示的关键框架特性

- **Shadow DOM封装**
- **响应式数据绑定**
- **组件生命周期钩子**
- **模板渲染**
- **属性同步**
- **事件处理**
- **样式处理**

## 注意事项

- 这些组件仅供演示目的，生产环境可能需要额外功能
- 该框架使用Web Components标准以获得最大兼容性
- 组件可以独立使用或集成到更大的应用程序中
