/**
 * Solely 组件库 - 统一入口
 *
 * 使用方式：
 * ```typescript
 * // 导入所有组件（会自动注入主题变量）
 * import 'solely/components';
 *
 * // 主题变量会自动注入；严格 CSP 或按需引入单个组件时，仍需手动引入：
 * import 'solely/components/theme/variables.css';
 *
 * // 仅导入自定义元素组件
 * import { SolelyButton } from 'solely/components/elements';
 *
 * // 导入主题系统
 * import { setTheme, toggleTheme } from 'solely/components/theme';
 * ```
 */

// 必须放在其他 import 之前：先注入主题变量，再注册组件
import './theme/auto-inject';

// 导出主题系统
export * from './theme';

// 导出自定义元素组件
export * from './elements';

// 导出命令式组件
export * from './commands';

// 自动注册所有组件（如果需要在导入时自动注册）
// import './elements/button';
