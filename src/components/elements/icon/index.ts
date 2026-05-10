/**
 * Solely Icon 组件
 * SVG 图标组件，支持自定义图标注册和 SVG Sprite
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { IconProps, IconRefs, IconSpin } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

const iconRegistry = new Map<string, string>();

const svgSpriteCache: Map<string, { viewBox: string; content: string }> = new Map();
let spriteLoadingPromise: Promise<void> | null = null;

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

@CustomElement({
    tagName: 'solely-icon',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'name', type: 'string', default: '' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'color', type: 'string', default: '' },
        { name: 'spin', type: 'string', default: '' },
        { name: 'spinDuration', type: 'number', default: 1 },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'sprite', type: 'string', default: '' },
    ],
})
class SolelyIcon extends BaseElement<IconProps, IconRefs> {
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
        const size = this.$data.size || 'medium';
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
        const spin = this.$data.spin as IconSpin;
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
            'is-spinning': !!this.$data.spin,
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
        return false;
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

        const spin = this.$data.spin as IconSpin;
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
     */
    private updateSvgContent(): void {
        const svgEl = this.$refs.svgRef;
        if (svgEl && this.hasIcon()) {
            svgEl.innerHTML = this.getIconContent();
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
