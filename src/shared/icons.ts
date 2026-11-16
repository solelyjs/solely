/**
 * Solely 线性状态图标
 *
 * 16×16 viewBox、stroke: currentColor，配合 shadow DOM 内的 `.solely-linear-icon`
 * 样式规则使用。命令式组件用 createStatusIcon() 以 DOM API 创建（兼容严格 CSP），
 * 声明式模板可直接把 STATUS_ICON_PATHS 绑到 `<path :d="...">`。
 */

export const STATUS_ICON_PATHS = {
    /** 圆形 + i */
    info: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z M8 7.2v4.4 M8 4.8h.01',
    /** 圆形 + 勾 */
    success: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z M4.9 8.2 7 10.3 11.3 5.8',
    /** 三角 + ! */
    warning: 'M8 2.2 14.6 13.4H1.4L8 2.2Z M8 6.2v3.4 M8 11.6h.01',
    /** 圆形 + 叉 */
    error: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z M5.7 5.7 10.3 10.3 M10.3 5.7 5.7 10.3',
    /** 单独勾 */
    check: 'M3.5 8.5 6.8 11.5 12.5 4.8',
    /** 单独叉 */
    close: 'M4.4 4.4 11.6 11.6 M11.6 4.4 4.4 11.6',
    /** 圆形 + 问号（confirm 弹窗） */
    question:
        'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.4' +
        ' M8 11.5h.01',
} as const;

export type StatusIconName = keyof typeof STATUS_ICON_PATHS;

/** 状态提示类型 → 图标名（alert / message / modal / popconfirm 共用） */
export const STATUS_ICON_BY_TYPE: Record<string, StatusIconName> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    warn: 'warning',
    error: 'error',
    exception: 'error',
    danger: 'error',
    confirm: 'question',
};

/**
 * 创建线性 SVG 图标元素。用 createElementNS 而非 innerHTML，兼容严格 CSP；
 * 惰性调用，模块顶层不触碰 document（SSR 安全）。
 */
export function createStatusIcon(name: StatusIconName, className = 'solely-linear-icon'): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', STATUS_ICON_PATHS[name]);
    svg.appendChild(path);
    return svg;
}
