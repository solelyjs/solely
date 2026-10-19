/**
 * SVG 内容消毒工具
 *
 * 背景：icon 组件通过 `innerHTML` 注入 SVG 内容，内容来源包括
 * 开发者注册的图标（registerIcon）和远程加载的 SVG Sprite（loadIconSprite）。
 * 后者可能来自第三方源，恶意 SVG 可携带 SMIL 事件属性（onbegin/onend）、
 * <script>、<foreignObject>、javascript: 链接等 XSS 载荷。
 *
 * 注意：通过 innerHTML 注入的 <script> 不会执行，但 SVG 的 SMIL 动画
 * 事件属性（如 <animate onbegin="...">）在现代浏览器中仍会触发，
 * 因此必须在注入前消毒。
 *
 * 设计取舍：不引入 DOMPurify 等运行时依赖（本项目零运行时依赖是核心卖点），
 * 采用 DOMParser + 手写规则，覆盖：
 * - 元素白名单：仅保留合法 SVG 元素，其余（script / foreignObject / HTML /
 *   MathML / 未知命名空间）一律移除
 * - on* 事件属性（含 SMIL 的 onbegin/onend/onrepeat）
 * - 危险协议 URL：javascript: / vbscript: / data:text/html
 * - SMIL 动画写属性载荷：<set>/<animate> 等通过 attributeName 在运行时
 *   写入 on*（无条件拦截）或 URL 属性（值携带危险协议时拦截）
 */

import { IS_DEV } from './env';

/**
 * 允许保留的 SVG 元素白名单（统一小写比较）
 *
 * 采用白名单而非黑名单：不在名单内的元素一律移除，从结构上消除
 * 「HTML / MathML 元素借道 integration point 存活」的问题，无需再逐个
 * 追补 img / video / base / form 等特例（黑名单模式永远补不完）。
 *
 * 刻意排除：
 * - `script`：可执行
 * - `foreignObject`：内嵌完整 HTML 上下文，等于绕过本消毒器
 * 保留：`a`（SVG 合法链接元素，href 由协议规则把关）、
 * `style`（iconfont sprite 内嵌样式是常见写法）
 */
const ALLOWED_TAGS = new Set([
    // 容器与结构
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'switch',
    'view',
    'metadata',
    'title',
    'desc',
    'style',
    'a',
    // 基础形状
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    // 文本
    'text',
    'tspan',
    'textpath',
    // 图像
    'image',
    // 渐变与图案
    'lineargradient',
    'radialgradient',
    'stop',
    'pattern',
    'solidcolor',
    // 裁剪 / 蒙版 / 标记
    'clippath',
    'mask',
    'marker',
    // 滤镜
    'filter',
    'feblend',
    'fecolormatrix',
    'fecomponenttransfer',
    'fecomposite',
    'feconvolvematrix',
    'fediffuselighting',
    'fedisplacementmap',
    'fedistantlight',
    'fedropshadow',
    'feflood',
    'fefunca',
    'fefuncb',
    'fefuncg',
    'fefuncr',
    'fegaussianblur',
    'feimage',
    'femerge',
    'femergenode',
    'femorphology',
    'feoffset',
    'fepointlight',
    'fespecularlighting',
    'fespotlight',
    'fetile',
    'feturbulence',
    // 动画（SMIL，另有 attributeName 载荷检查）
    'animate',
    'animatemotion',
    'animatetransform',
    'set',
    'mpath',
    'discard',
]);

/** SMIL 动画类元素（可在运行时写入属性/URL） */
const SMIL_TAGS = new Set(['set', 'animate', 'animatetransform', 'animatemotion']);

/** 危险 URL 协议（去除空白与控制字符后匹配） */
const JS_PROTOCOL = /^\s*(?:javascript|vbscript)\s*:/i;
const DATA_HTML_PROTOCOL = /^\s*data:(?!image\/)/i;

/** 需要检查的 URL 属性 */
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/** SMIL 动画元素中承载目标值的属性 */
const SMIL_VALUE_ATTRS = ['to', 'values', 'from', 'by'];

/** 消毒结果缓存（相同输入只解析一次，避免列表场景重复 DOMParser 开销） */
const sanitizeCache = new Map<string, string>();
const CACHE_LIMIT = 500;

/**
 * 判断属性值是否为危险协议 URL
 */
function isDangerousUrl(value: string): boolean {
    // 去掉空白与控制字符，防止 "java\tscript:" 之类的混淆
    const normalized = value.replace(/[\s-]+/g, '');
    return JS_PROTOCOL.test(normalized) || DATA_HTML_PROTOCOL.test(normalized);
}

/**
 * 判断 SMIL 元素是否携带危险载荷：
 * - attributeName 命中 on*：无条件拦截（运行时写入事件属性必然可执行）
 * - attributeName 命中 URL 属性：仅当 to/values/from/by 携带危险协议时拦截
 *   （放行 `<animate attributeName="href" to="#anchor">` 之类的无害动画）
 */
function isDangerousSmil(el: Element): boolean {
    const attributeName = (el.getAttribute('attributeName') || '').toLowerCase();
    if (!attributeName) return false;
    if (attributeName.startsWith('on')) return true;
    if (URL_ATTRS.has(attributeName)) {
        return SMIL_VALUE_ATTRS.some(attr => {
            const val = el.getAttribute(attr);
            return val !== null && isDangerousUrl(val);
        });
    }
    return false;
}

/**
 * 消毒 SVG 字符串，移除可执行载荷
 * @param svg 原始 SVG 内容
 * @returns 消毒后的 SVG 字符串；解析失败或环境无 DOMParser 时返回空串（安全兜底）
 */
export function sanitizeSvg(svg: string): string {
    if (!svg) return '';

    // SSR/Node 环境无 DOMParser：无法消毒，按 fail-closed 返回空串（即该环境下不输出图标）
    // 注意：本框架目前没有 SSR 渲染器，icon 的注入路径依赖真实 DOM（$refs.svgRef），
    // 正常使用不会走到这里；若将来引入 SSR，需在此提供 escape hatch（如构建期预消毒）。
    if (typeof DOMParser === 'undefined') return '';

    const cached = sanitizeCache.get(svg);
    if (cached !== undefined) return cached;

    const result = doSanitize(svg);

    if (sanitizeCache.size >= CACHE_LIMIT) {
        // 简单的容量控制：淘汰最早写入的一批
        const excess = sanitizeCache.size - CACHE_LIMIT + 1;
        const keys = sanitizeCache.keys();
        for (let i = 0; i < excess; i++) {
            const oldest = keys.next().value;
            if (oldest === undefined) break;
            sanitizeCache.delete(oldest);
        }
    }
    sanitizeCache.set(svg, result);

    return result;
}

function doSanitize(svg: string): string {
    const wrapper = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;

    // 首选 XML 严格解析：保持 SVG foreign content 语义（自闭合斜杠、camelCase 属性大小写）
    const xmlDoc = new DOMParser().parseFromString(wrapper, 'image/svg+xml');
    if (!xmlDoc.querySelector('parsererror')) {
        sanitizeElement(xmlDoc.documentElement);
        // 去掉包裹层 <svg>，仅返回内部内容
        return xmlDoc.documentElement.innerHTML;
    }

    // XML 解析失败（最常见于 registerIcon 收到未转义 & 的 JS 字符串）：
    // 回退 text/html 容错解析，避免整个图标被静默清空。
    //
    // 安全要点：回退必须同样以 <svg> 包裹，保持与注入阶段（svgEl.innerHTML
    // 的 SVG foreign content）一致的解析语境。若用 <div> 包裹，<style> 在
    // HTML 语境是 RAWTEXT（内容不按标记解析，消毒器看不到内部标签），而
    // 注入时 foreign content 会按标记重新解析——构成 mXSS 绕过。
    // svg 包裹下 HTML 专有标签（img/iframe 等）会触发 foreign content
    // breakout 落到 svg 之外，取 firstElementChild（svg）时被自然丢弃，
    // 恶意内容不会进入消毒结果。
    if (IS_DEV) {
        console.warn('[Solely Icon] SVG XML 解析失败，回退 HTML 容错解析');
    }
    const htmlDoc = new DOMParser().parseFromString(wrapper, 'text/html');
    const root = htmlDoc.body?.firstElementChild;
    if (!root) return '';

    sanitizeElement(root);
    return root.innerHTML;
}

function sanitizeElement(el: Element): void {
    // 自顶向下递归：父节点先过滤，被移除的子树不再继续遍历
    for (const child of Array.from(el.children)) {
        const tag = child.tagName.toLowerCase();
        // 白名单外元素整体移除（script / foreignObject / HTML / MathML / 未知命名空间）
        if (!ALLOWED_TAGS.has(tag)) {
            child.remove();
            continue;
        }
        // SMIL 动画写属性载荷：整个元素移除
        if (SMIL_TAGS.has(tag) && isDangerousSmil(child)) {
            child.remove();
            continue;
        }
        sanitizeElement(child);
    }

    // 移除危险属性：on* 事件属性、危险协议的 URL 属性
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            continue;
        }
        if (URL_ATTRS.has(name) && isDangerousUrl(attr.value)) {
            el.removeAttribute(attr.name);
        }
    }
}
