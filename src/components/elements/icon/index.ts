/**
 * Solely Icon 组件
 * SVG 图标组件，支持自定义图标注册和 SVG Sprite
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { sanitizeSvg } from '../../../shared/svg-sanitize';
import { IS_DEV } from '../../../shared/env';
import type { SizeAlias } from '../../../shared/size';
import type { IconProps, IconRefs, IconSpin, IconSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

const iconRegistry = new Map<string, string>();

const svgSpriteCache: Map<string, { viewBox: string; content: string }> = new Map();
let spriteLoadingPromise: Promise<void> | null = null;

/** 开发期已提示过的缺失图标名，避免每次渲染刷屏 */
const warnedMissingIcons = new Set<string>();

export async function loadIconSprite(path: string): Promise<void> {
    if (spriteLoadingPromise) return spriteLoadingPromise;

    if (svgSpriteCache.size > 0) return Promise.resolve();

    spriteLoadingPromise = (async () => {
        try {
            const response = await fetch(path);
            const text = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');
            const symbols = doc.querySelectorAll('symbol');

            symbols.forEach(symbol => {
                const id = symbol.id;
                const viewBox = symbol.getAttribute('viewBox') || '0 0 16 16';
                const content = symbol.innerHTML;

                if (id && content) {
                    svgSpriteCache.set(id, { viewBox, content });
                }
            });

            console.info(`[Solely Icon] Loaded ${svgSpriteCache.size} icons from sprite`);
        } catch (error) {
            console.warn('[Solely Icon] Failed to load icon sprite:', error);
        }
    })();

    return spriteLoadingPromise;
}

/**
 * 设置图标 Sprite 文件路径（自动加载）
 * @param path 相对于 public 目录的路径
 */
export function setIconSpritePath(path: string): void {
    loadIconSprite(path);
}

/**
 * 获取 sprite 加载状态
 * @returns 是否正在加载
 */
export function isSpriteLoading(): boolean {
    return !!spriteLoadingPromise;
}

/**
 * 等待 sprite 加载完成
 * @returns Promise
 */
export function waitForSpriteLoad(): Promise<void> {
    if (spriteLoadingPromise) return spriteLoadingPromise;
    return Promise.resolve();
}

/**
 * 注册图标到全局注册表
 * @param name 图标名称
 * @param svgContent SVG 内容（仅 path 部分或完整 SVG）
 */
export function registerIcon(name: string, svgContent: string): void {
    iconRegistry.set(name, svgContent);
}

/**
 * 批量注册图标
 * @param icons 图标对象 { name: svgContent }
 */
export function registerIcons(icons: Record<string, string>): void {
    Object.entries(icons).forEach(([name, content]) => {
        iconRegistry.set(name, content);
    });
}

export function getIcon(name: string): string {
    const registered = iconRegistry.get(name);
    if (registered) return registered;

    const spriteIcon = svgSpriteCache.get(name);
    if (spriteIcon) {
        return spriteIcon.content;
    }

    return '';
}

export function getIconViewBox(name: string): string {
    const spriteIcon = svgSpriteCache.get(name);
    if (spriteIcon) return spriteIcon.viewBox;
    return '0 0 16 16';
}

/**
 * 检查图标是否已注册
 * @param name 图标名称
 * @returns 是否已注册
 */
export function hasIcon(name: string): boolean {
    return iconRegistry.has(name) || svgSpriteCache.has(name);
}

/**
 * 获取所有已注册的图标名称
 * @returns 图标名称数组
 */
export function getRegisteredIcons(): string[] {
    return Array.from(new Set([...iconRegistry.keys(), ...svgSpriteCache.keys()]));
}

/**
 * 把属性/属性值归一化为旋转配置
 *
 * 兼容 attribute 的字符串写法：
 * - 无值 / "" / "true" / "clockwise" → clockwise
 * - "false" / "0" → 不旋转
 * - "counterclockwise" → 逆时针
 */
function normalizeSpin(value: unknown): IconSpin {
    if (value === true) return 'clockwise';
    if (value === false || value === null || value === undefined) return false;

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'false' || normalized === '0') return false;
        if (normalized === 'counterclockwise') return 'counterclockwise';
        return 'clockwise';
    }

    return false;
}

@CustomElement({
    tagName: 'solely-icon',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'name', type: 'string', default: '' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'color', type: 'string', default: 'currentColor' },
        { name: 'spin', type: 'string', default: false },
        { name: 'spinDuration', type: 'number', default: 1 },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'sprite', type: 'string', default: '' },
    ],
})
class SolelyIcon extends BaseElement<IconProps, IconRefs> {
    /**
     * 尺寸语义：middle / default 归一为 medium；数字保持自定义像素值。
     */
    get size(): IconSize {
        const value = this.$data.size as IconSize | SizeAlias | undefined;
        if (value === 'middle' || value === 'default') return 'medium';
        return value ?? 'medium';
    }

    set size(value: IconSize | SizeAlias) {
        this.$data.size = value === 'middle' || value === 'default' ? 'medium' : value;
    }

    /**
     * 旋转配置
     *
     * 使用自定义访问器把 attribute 的字符串值（如 "false"）归一化为布尔/方向语义。
     */
    get spin(): IconSpin {
        return normalizeSpin(this.$data.spin);
    }

    set spin(value: IconSpin) {
        this.$data.spin = normalizeSpin(value);
    }

    /**
     * 获取图标 SVG 内容
     */
    getIconContent(): string {
        if (!this.$data.name) return '';
        return getIcon(this.$data.name) || this.getDefaultIcon();
    }

    /**
     * 获取图标的 viewBox
     */
    getViewBox(): string {
        if (!this.$data.name) return '0 0 16 16';
        return getIconViewBox(this.$data.name);
    }

    private getDefaultIcon(): string {
        return (
            '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" ' +
            'stroke="currentColor" stroke-width="1.5"/>' +
            '<line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.5"/>' +
            '<circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>'
        );
    }

    /**
     * 获取图标尺寸
     */
    getIconSize(): string {
        const size = this.size || 'medium';
        const sizeMap: Record<string, string> = {
            small: '12px',
            medium: '16px',
            large: '24px',
        };
        const mapped = sizeMap[size];
        if (mapped) return mapped;
        const num = Number(size);
        if (!isNaN(num) && num > 0) return `${num}px`;
        return String(size);
    }

    /**
     * 获取 CSS 尺寸变量
     */
    getSizeStyle(): string {
        const size = this.getIconSize();
        return `--icon-size: ${size};`;
    }

    /**
     * 获取旋转样式
     */
    getSpinStyle(): string {
        const spin = this.spin;
        if (!spin) return '';
        const duration = this.$data.spinDuration || 1;
        const direction = spin === 'counterclockwise' ? 'reverse' : 'normal';
        return `--spin-direction: ${direction}; --spin-duration: ${duration}s;`;
    }

    /**
     * 获取颜色样式
     */
    getColorStyle(): string {
        const color = this.$data.color;
        if (!color) return '';
        return `--icon-color: ${color};`;
    }

    /**
     * 获取图标类名
     */
    getIconClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {
            icon: true,
            'is-spinning': !!this.spin,
        };

        // 尺寸类
        const size = this.$data.size;
        if (size === 'small' || size === 'medium' || size === 'large') {
            classes[`icon--${size}`] = true;
        }

        return classes;
    }

    /**
     * 是否有有效图标（或正在加载中）
     * 用于模板条件渲染，加载中时返回 true 以创建 SVG 元素
     */
    hasIcon(): boolean {
        if (!this.$data.name) return false;
        // 如果已经在注册表中，直接返回 true
        if (hasIcon(this.$data.name)) return true;
        // 如果 sprite 正在加载，返回 true（SVG 元素会被创建，内容稍后更新）
        if (spriteLoadingPromise) return true;
        // 如果有 sprite 属性，返回 true（会触发加载）
        if (this.$data.sprite) return true;

        this.warnMissingIcon(this.$data.name);
        return false;
    }

    /**
     * 图标未注册且未配置 sprite 时，开发期给出一次性告警。
     *
     * 组件不会默认加载包内 sprite：包发布时排除了 dist/icons（sprite 约 1.1MB），
     * 且模块内 URL 在打包器/SSR 下无法可靠解析。调用方需显式
     * `setIconSpritePath()` / `registerIcon()`，或通过 `sprite` 属性指定路径。
     */
    private warnMissingIcon(name: string): void {
        if (!IS_DEV || warnedMissingIcons.has(name)) return;
        warnedMissingIcons.add(name);
        console.warn(
            `[Solely Icon] 图标 "${name}" 未注册，也未配置 sprite，当前渲染为占位空白。\n` +
                `请使用 registerIcon('${name}', svgContent) 注册，或调用 setIconSpritePath('/icons/bootstrap-icons.svg')，` +
                `或在该元素上设置 sprite="<路径>"。`,
        );
    }

    /**
     * 更新宿主元素的 CSS 变量（尺寸、颜色、旋转）
     */
    private updateHostStyles(): void {
        this.style.setProperty('--icon-size', this.getIconSize());

        const color = this.$data.color;
        if (color) {
            this.style.setProperty('--icon-color', color);
        } else {
            this.style.removeProperty('--icon-color');
        }

        const spin = this.spin;
        if (spin) {
            const duration = this.$data.spinDuration || 1;
            const direction = spin === 'counterclockwise' ? 'reverse' : 'normal';
            this.style.setProperty('--spin-duration', `${duration}s`);
            this.style.setProperty('--spin-direction', direction);
        } else {
            this.style.removeProperty('--spin-duration');
            this.style.removeProperty('--spin-direction');
        }

        this.classList.remove('icon--small', 'icon--medium', 'icon--large');
        const size = this.$data.size;
        if (size === 'small' || size === 'medium' || size === 'large') {
            this.classList.add(`icon--${size}`);
        }
    }

    /**
     * 组件挂载后更新 SVG 内容
     */
    async mounted(): Promise<void> {
        this.refresh();
        this.updateHostStyles();

        const sprite = this.$data.sprite;
        if (sprite) {
            try {
                await loadIconSprite(sprite);
                this.updateSvgContent();
                // 从组件内部派发 sprite-loaded 事件，确保 composed: true 可穿透 Shadow DOM
                this.dispatchEvent(new Event('sprite-loaded', { bubbles: true, composed: true }));
            } catch {
                this.updateSvgContent();
                this.dispatchEvent(new Event('sprite-error', { bubbles: true, composed: true }));
            }
        } else if (spriteLoadingPromise) {
            try {
                await spriteLoadingPromise;
                this.updateSvgContent();
                this.dispatchEvent(new Event('sprite-loaded', { bubbles: true, composed: true }));
            } catch {
                this.updateSvgContent();
                this.dispatchEvent(new Event('sprite-error', { bubbles: true, composed: true }));
            }
        } else {
            this.updateSvgContent();
        }
    }

    /**
     * 数据变化时更新 SVG 内容
     */
    updated(): void {
        this.updateHostStyles();
        this.updateSvgContent();
    }

    /**
     * 更新 SVG 元素的内容
     *
     * 安全说明：图标内容来自两个渠道——
     * 1. registerIcon/registerIcons：开发者代码主动注册，可信；
     * 2. loadIconSprite 远程加载的 SVG Sprite：可能来自第三方源，
     *    恶意 SVG 可携带 SMIL 事件属性（onbegin 等）、<script>、
     *    <foreignObject>、javascript: 链接等 XSS 载荷。
     * 因此注入前统一经 sanitizeSvg 消毒（移除危险元素/属性）。
     * 注意：innerHTML 注入的 <script> 虽不执行，但 SMIL 事件属性会。
     */
    private updateSvgContent(): void {
        const svgEl = this.$refs.svgRef;
        if (svgEl && this.hasIcon()) {
            svgEl.innerHTML = sanitizeSvg(this.getIconContent());
        }
    }

    /**
     * 处理点击事件
     */
    handleClick(event: MouseEvent): void {
        if (this.$data.disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

    /**
     * 聚焦图标（如果可交互）
     */
    public focus(): void {
        this.$refs.svgRef?.focus();
    }

    /**
     * 失焦图标
     */
    public blur(): void {
        this.$refs.svgRef?.blur();
    }
}

export { SolelyIcon };
