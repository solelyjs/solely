# Solely Framework Support

VS Code 扩展，为 [Solely](https://github.com/solelyjs/solely) 框架的 HTML 模板提供语法高亮、智能跳转、悬停提示和错误诊断。

## 功能

| 功能         | 说明                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **语法高亮** | `$data.xxx`、`this.xxx()`、`<If>`/`<For>` 控制流标签、`@click` 事件绑定等均有独立配色                  |
| **定义跳转** | 模板中 `this.method()` 跳转到 TS 方法定义，`$data.xxx` 跳转到属性定义，`ref="xxx"` 跳转到 `$refs` 引用 |
| **悬停提示** | 鼠标悬停在方法名/属性名上显示类型信息和跳转提示                                                        |
| **错误诊断** | `<If>`/`<ElseIf>`/`<Else>`/`<For>` 标签配对检查，嵌套错误自动提示                                      |
| **模板关联** | 自动识别 `import template from './xxx.html?raw'` / `?solely`，正确关联 HTML 模板与 TS 组件             |

## 安装

**方式一：通过 VS Code 扩展面板安装（推荐）**

按 `Ctrl+Shift+X` 打开扩展面板，搜索 **"Solely Framework Support"** 即可安装。

**方式二：通过命令行安装**

需确保 `code` 命令已在系统 PATH 中（可通过 `Shell Command: Install 'code' command in PATH` 命令添加）：

```bash
code --install-extension solely.solely-vscode
```

## 使用

安装后，在 Solely 项目中打开任意 HTML 模板文件即可自动启用，无需额外配置。

### 跳转

按住 `Ctrl`（Mac: `Cmd`）点击模板中的方法名、属性名或引用，即可跳转到 TS 文件中对应的定义。

### 悬停

鼠标悬停在方法名或属性名上，查看相关信息。

## 版本要求

- VS Code `>= 1.85.0`
- 项目需使用 `import template from './xxx.html?raw'` 或 `?solely` 方式导入模板

## 问题反馈

如有问题或建议，请在 [GitHub Issues](https://github.com/solelyjs/solely/issues) 提交。

## License

[MIT](LICENSE)
