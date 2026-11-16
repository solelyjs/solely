/**
 * 主题变量自动注入
 *
 * 组件依赖 `--solely-*` 结构 token；漏引 variables.css 时颜色、边框、高度、字体
 * 会整体塌陷且没有任何提示。这里在浏览器环境下把同一份 CSS 注入 document.head，
 * 使 `import 'solely/components'` 开箱即用。
 *
 * 设计取舍：
 * - 用 `?inline` 而非 `import './variables.css'`：CSS 文件实际由 public 目录发布
 *   （package.json 导出 dist/components/theme/variables.css），JS 内联注入在 ESM、
 *   CJS、无打包器（CDN `<script type="module">`）下行为一致，不依赖打包器产出的
 *   hashed CSS 资源路径。
 * - Shadow DOM：变量定义在 `:root`，会自然继承进各组件 shadow tree。
 * - 重复注入：模块级标记 + style id 双重保护；HMR 重载也不会叠加。
 * - SSR：无 document 时直接跳过，不在服务端产生任何副作用。
 * - CSP：严格 `style-src`（不允许 inline）会拦下注入，此时应改用
 *   `<link rel="stylesheet" href="solely/components/theme/variables.css">` 或手动
 *   `import 'solely/components/theme/variables.css'`。
 */

import variables from './variables.css?inline';
import { IS_DEV } from '../../shared/env';

const STYLE_ID = 'solely-theme-variables';

let injected = false;

/**
 * 注入主题变量（仅在浏览器生效，可重复调用）
 */
export function injectThemeVariables(): void {
    if (injected) return;
    if (typeof document === 'undefined' || !document.head) return;

    injected = true;

    // 已存在同 id 节点（例如 HMR 重载或用户手动注入）时不重复插入
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-solely-theme', '');
    style.textContent = variables;
    document.head.appendChild(style);

    // 开发期自检：严格 CSP（style-src 禁止 inline）会静默拦截注入，组件随后整体塌样式
    if (IS_DEV && typeof getComputedStyle === 'function') {
        const applied = getComputedStyle(document.documentElement).getPropertyValue('--solely-primary').trim();
        if (!applied) {
            console.warn(
                '[Solely Theme] 主题变量未能生效（可能是 CSP 拦截了内联样式）。' +
                    '请改用 <link rel="stylesheet" href="solely/components/theme/variables.css"> ' +
                    "或手动 import 'solely/components/theme/variables.css'。",
            );
        }
    }
}

// 模块被 `import 'solely/components'` 引入时立即执行（SSR 中函数内部直接跳过）
injectThemeVariables();
