/**
 * Solely Tooltip 组件（声明式）
 * 文字提示气泡框组件
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 * 纯 CSS 定位，无需 JavaScript 计算
 *
 * 使用方式：
 * ```html
 * <solely-tooltip content="这是提示内容" placement="top" trigger="hover">
 *     <button>悬停显示提示</button>
 * </solely-tooltip>
 * ```
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { computePosition, observePosition } from '../../../shared/floating/position';
import { registerOverlay, type OverlayHandle } from '../../../shared/floating/overlay-stack';
import type { Placement } from '../../../shared/floating/types';
import { linkAria, type AriaLinkHandle } from '../../../shared/aria';
import { oneOf, PLACEMENTS } from '../../../shared/enum';
import type { TooltipProps, TooltipTrigger } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

let tooltipIdCounter = 0;

@CustomElement({
    tagName: 'solely-tooltip',
    template,
    styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'content', type: 'string', default: '' },
        { name: 'placement', type: 'string', default: 'top' },
        { name: 'trigger', type: 'string', default: 'hover' },
        { name: 'visible', type: 'boolean', default: false },
        { name: 'color', type: 'string', default: '' },
        { name: 'maxWidth', type: 'number', default: 250 },
    ],
})
class SolelyTooltip extends BaseElement<TooltipProps> {
    private _clickOutsideHandler?: (event: MouseEvent) => void;
    private _slotBindings: Array<{ element: Element; type: 'focus' | 'blur'; handler: EventListener }> = [];
    private _describedElements: Element[] = [];
    private _ariaLinks = new Map<Element, AriaLinkHandle>();
    private readonly _tooltipId = `solely-tooltip-${++tooltipIdCounter}`;
    private _floating?: HTMLElement;
    private _overlay?: OverlayHandle;
    private _stopObserve?: () => void;
    private _contentSlot?: HTMLSlotElement;
    private _onContentSlotChange?: () => void;
    private _defaultSlot?: HTMLSlotElement;
    private _onDefaultSlotChange?: () => void;

    /** 气泡方位（非法值回退 top） */
    getPlacement(): Placement {
        return oneOf(this.$data.placement, PLACEMENTS, 'top');
    }

    /** 触发方式（非法值回退 hover，避免气泡永远不可触发） */
    getTrigger(): TooltipTrigger {
        return oneOf(this.$data.trigger, ['hover', 'click', 'focus', 'manual'], 'hover');
    }

    /**
     * 获取 tooltip 元素 id（用于 aria-describedby 关联）
     */
    getTooltipId(): string {
        return this._tooltipId;
    }

    /**
     * 读屏描述文案：
     * 优先取 `slot="content"` 的结构化内容纯文本；没有插槽内容时回退 `content` 字符串。
     * aria-describedby 只承载文本，因此结构化内容按 textContent 扁平化。
     */
    private resolveAriaContent(): string {
        const slotted = Array.from(this.querySelectorAll<HTMLElement>(':scope > [slot="content"]'));
        if (slotted.length > 0) {
            const text = slotted
                .map(node => node.textContent ?? '')
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (text) return text;
        }
        return this.$data.content || '';
    }

    /**
     * 监听内容插槽变化：同步读屏代理文本，并让含结构化内容的浮层重新测量高度。
     */
    private bindContentSlotListener(): void {
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="content"]');
        if (!slot || slot === this._contentSlot) return;

        this.unbindContentSlotListener();
        this._contentSlot = slot;
        this._onContentSlotChange = () => {
            this.updateAriaDescribedBy(true);
            this.positionFloating();
        };
        slot.addEventListener('slotchange', this._onContentSlotChange);
    }

    private unbindContentSlotListener(): void {
        if (this._contentSlot && this._onContentSlotChange) {
            this._contentSlot.removeEventListener('slotchange', this._onContentSlotChange);
        }
        this._contentSlot = undefined;
        this._onContentSlotChange = undefined;
    }

    /**
     * 获取 tooltip class 对象
     */
    getTooltipClasses(): Record<string, boolean> {
        return {
            [`tooltip--${this.getPlacement()}`]: true,
            'is-visible': this.$data.visible,
        };
    }

    /**
     * 气泡视觉属性：maxWidth 与自定义背景色。
     * color 通过覆盖 `--solely-inverted-bg` 同时作用于背景与箭头。
     */
    getTooltipStyle(): Record<string, string> {
        const maxWidth = Number(this.$data.maxWidth);
        const styles: Record<string, string> = {
            maxWidth: Number.isFinite(maxWidth) && maxWidth > 0 ? `${maxWidth}px` : '250px',
        };
        if (this.$data.color) {
            styles['--solely-inverted-bg'] = this.$data.color;
        }
        return styles;
    }

    /**
     * click 触发模式下，仅当插槽内容没有可聚焦元素时，让 wrapper 自身进入 Tab 序列，
     * 避免与内部按钮/链接形成两个停点。
     */
    getWrapperTabIndex(): number | null {
        if (this.getTrigger() !== 'click') return null;
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([name])');
        const focusable = slot
            ?.assignedElements()
            .some(el => el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        return focusable ? null : 0;
    }

    /**
     * wrapper 自身获得焦点时，Enter / Space 等价于点击触发。
     */
    handleWrapperKeydown(event: KeyboardEvent): void {
        if (this.getTrigger() !== 'click') return;
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleClick(event);
    }

    /**
     * 用基座纯函数定位视觉层（fixed：不受祖先 overflow 裁剪）。
     * 视觉层仍留在 shadow root 中，aria 关联继续由 light DOM 代理节点承载。
     */
    private positionFloating(): void {
        const floating = this._floating;
        if (!floating || !floating.isConnected) return;

        const anchorRect = this.getBoundingClientRect();
        const floatingRect = floating.getBoundingClientRect();
        const result = computePosition(
            anchorRect,
            {
                // 入场动画带 transform: scale(...)，getBoundingClientRect() 会返回缩放后的尺寸；
                // 定位必须用布局尺寸，否则首次 flip/shift 按偏小的尺寸钳制，滚动后才修正。
                width: floating.offsetWidth || floatingRect.width,
                height: floating.offsetHeight || floatingRect.height,
            },
            {
                placement: this.getPlacement(),
                // fixed 可用区域不含滚动条；jsdom 的 clientWidth 为 0，回退到 innerWidth
                viewport: {
                    width: document.documentElement.clientWidth || window.innerWidth,
                    height: document.documentElement.clientHeight || window.innerHeight,
                },
                offset: 8,
                boundaryPadding: 8,
                flip: true,
                shift: true,
                strategy: 'fixed',
            },
        );

        // 翻转后同步方位类，保留箭头边框朝向
        floating.className = ['tooltip', `tooltip--${result.placement}`, this.$data.visible ? 'is-visible' : '']
            .filter(Boolean)
            .join(' ');

        floating.style.position = 'fixed';
        floating.style.top = `${result.top}px`;
        floating.style.left = `${result.left}px`;
        floating.style.bottom = 'auto';
        floating.style.right = 'auto';
        // CSS 方位类带 translate 居中，fixed 坐标下必须让内联 transform 优先
        floating.style.transform = 'none';

        const arrow = floating.querySelector('.tooltip__arrow') as HTMLElement | null;
        if (arrow) {
            let side: 'top' | 'bottom' | 'left' | 'right' = 'right';
            if (result.placement.startsWith('top')) side = 'top';
            else if (result.placement.startsWith('bottom')) side = 'bottom';
            else if (result.placement.startsWith('left')) side = 'left';
            const half = `${-(arrow.offsetWidth || 8) / 2}px`;
            // result.arrow.x / y 是箭头中心坐标，transform 必须补上对应轴的 -50%
            const centering = side === 'top' || side === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)';

            arrow.style.transform = `${centering} rotate(45deg)`;
            arrow.style.top = 'auto';
            arrow.style.bottom = 'auto';
            arrow.style.left = 'auto';
            arrow.style.right = 'auto';

            if (side === 'top') arrow.style.bottom = half;
            else if (side === 'bottom') arrow.style.top = half;
            else if (side === 'left') arrow.style.right = half;
            else arrow.style.left = half;

            if (side === 'top' || side === 'bottom') {
                if (result.arrow.x !== undefined) arrow.style.left = `${result.arrow.x}px`;
            } else if (result.arrow.y !== undefined) {
                arrow.style.top = `${result.arrow.y}px`;
            }
        }
    }

    /** 登记浮层（仅 z-index）并订阅重定位；重复调用不会重复入栈 */
    private setupFloating(): void {
        const floating = this.shadowRoot?.querySelector('.tooltip') as HTMLElement | null;
        if (!floating) {
            this.teardownFloating();
            return;
        }

        this.bindContentSlotListener();

        if (this._floating === floating) {
            this.positionFloating();
            return;
        }

        this.teardownFloating();
        this._floating = floating;

        this._overlay = registerOverlay({
            kind: 'tooltip',
            container: floating,
            trigger: this,
            // tooltip 可被 Esc 关闭，但不消费事件：继续传给下层可关闭浮层
            escClosable: 'passthrough',
            trapFocus: false,
            lockScroll: false,
            inertBackground: false,
            autoFocus: false,
            returnFocus: false,
            onEscape: () => this.hide(),
        });
        this._overlay.activate();

        this.positionFloating();

        this._stopObserve = observePosition({
            anchor: this,
            floating,
            update: () => this.positionFloating(),
        });
    }

    private teardownFloating(): void {
        this._stopObserve?.();
        this._stopObserve = undefined;
        this.unbindContentSlotListener();
        this._overlay?.deactivate();
        this._overlay?.dispose();
        this._overlay = undefined;
        this._floating = undefined;
    }

    /**
     * 显示 tooltip
     */
    public show(): void {
        if (this.$data.visible) return;
        this.$data.visible = true;
        this.updateAriaDescribedBy(true);
        this.emit('show');
    }

    /**
     * 隐藏 tooltip
     */
    public hide(): void {
        if (!this.$data.visible) return;
        this.$data.visible = false;
        this.updateAriaDescribedBy(false);
        this.emit('hide');
    }

    /**
     * 鼠标移入处理
     */
    handleMouseEnter(event: Event): void {
        if (this.getTrigger() !== 'hover') return;
        event.stopPropagation();
        this.show();
    }

    /**
     * 鼠标移出处理
     */
    handleMouseLeave(event: Event): void {
        if (this.getTrigger() !== 'hover') return;
        event.stopPropagation();
        // 键盘焦点仍在宿主内时不隐藏：hover 提示需同时满足指针与焦点状态
        const active = document.activeElement;
        if (active && (active === this || this.contains(active))) return;
        this.hide();
    }

    /**
     * hover 触发模式下，键盘聚焦同样应展示 tooltip（WAI-ARIA：悬停提示必须可由焦点触发）
     */
    handleWrapperFocusIn(event: FocusEvent): void {
        if (this.getTrigger() !== 'hover') return;
        event.stopPropagation();
        this.show();
    }

    /**
     * hover 触发模式下的失焦：焦点仍在宿主内部时不隐藏
     */
    handleWrapperFocusOut(event: FocusEvent): void {
        if (this.getTrigger() !== 'hover') return;
        const next = event.relatedTarget as Node | null;
        if (next && this.contains(next)) return;
        this.hide();
    }

    /**
     * 聚焦处理
     */
    handleFocus(event: Event): void {
        if (this.getTrigger() !== 'focus') return;
        event.stopPropagation();
        this.show();
    }

    /**
     * 失焦处理
     */
    handleBlur(event: Event): void {
        if (this.getTrigger() !== 'focus') return;
        event.stopPropagation();
        this.hide();
    }

    /**
     * 绑定事件到 slot 内容元素
     */
    private bindSlotEvents(): void {
        const slot = this.shadowRoot?.querySelector('slot');
        if (!slot) return;

        this.unbindSlotEvents();

        const assignedElements = slot.assignedElements();
        assignedElements.forEach(el => {
            const focusable = el.querySelector('input, textarea, select, button, a, [tabindex]') || el;
            this._describedElements.push(focusable);

            if (this.getTrigger() !== 'focus') return;

            const focusHandler = this.handleFocus.bind(this) as EventListener;
            const blurHandler = this.handleBlur.bind(this) as EventListener;

            focusable.addEventListener('focus', focusHandler);
            focusable.addEventListener('blur', blurHandler);
            this._slotBindings.push(
                { element: focusable, type: 'focus', handler: focusHandler },
                { element: focusable, type: 'blur', handler: blurHandler },
            );
        });

        if (this.$data.visible) {
            this.updateAriaDescribedBy(true);
        }
    }

    /**
     * 默认插槽内容变化时重新绑定 focus/aria 关联与 wrapper tabindex。
     * 否则 trigger="focus" 在内容动态替换后会失去焦点事件。
     */
    private bindDefaultSlotListener(): void {
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([name])');
        if (!slot || slot === this._defaultSlot) return;

        this.unbindDefaultSlotListener();
        this._defaultSlot = slot;
        this._onDefaultSlotChange = () => {
            this.bindSlotEvents();
            this.refresh();
        };
        slot.addEventListener('slotchange', this._onDefaultSlotChange);
    }

    private unbindDefaultSlotListener(): void {
        if (this._defaultSlot && this._onDefaultSlotChange) {
            this._defaultSlot.removeEventListener('slotchange', this._onDefaultSlotChange);
        }
        this._defaultSlot = undefined;
        this._onDefaultSlotChange = undefined;
    }

    private unbindSlotEvents(): void {
        // 先解除 aria-describedby，再清理元素引用
        this.updateAriaDescribedBy(false);

        this._slotBindings.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this._slotBindings = [];
        this._describedElements = [];
    }

    /**
     * 同步 slot 内容元素的 aria-describedby 关联（F-3 通用 IDREF 代理）。
     * 显示时保留用户已有值并追加 tooltip id，隐藏时由 `release()` 精确还原原值。
     */
    private updateAriaDescribedBy(visible: boolean): void {
        if (visible) {
            const content = this.resolveAriaContent();
            for (const el of this._describedElements) {
                const link = this._ariaLinks.get(el);
                if (link) {
                    link.update(content, 'tooltip');
                } else {
                    this._ariaLinks.set(
                        el,
                        linkAria(el, 'aria-describedby', {
                            id: this._tooltipId,
                            role: 'tooltip',
                            content,
                        }),
                    );
                }
            }
            return;
        }

        for (const link of this._ariaLinks.values()) link.release();
        this._ariaLinks.clear();
    }

    /**
     * 点击处理
     */
    handleClick(event: Event): void {
        if (this.getTrigger() !== 'click') return;
        event.stopPropagation();

        if (this.$data.visible) {
            this.hide();
            this.unbindClickOutside();
        } else {
            this.show();
            this.bindClickOutside();
        }
    }

    /**
     * 绑定点击外部关闭
     */
    private bindClickOutside(): void {
        if (this._clickOutsideHandler) return;

        this._clickOutsideHandler = (e: MouseEvent) => {
            const path = e.composedPath();
            if (!path.includes(this)) {
                this.hide();
                this.unbindClickOutside();
            }
        };

        document.addEventListener('click', this._clickOutsideHandler);
    }

    /**
     * 解绑点击外部关闭
     */
    private unbindClickOutside(): void {
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler);
            this._clickOutsideHandler = undefined;
        }
    }

    /**
     * 组件挂载后初始化
     */
    mounted(): void {
        this.refresh();
        this.bindSlotEvents();
        this.bindDefaultSlotListener();
    }

    /**
     * 渲染完成后：可见则登记/重定位视觉层，不可见则释放基座资源。
     */
    updated(): void {
        this.bindDefaultSlotListener();
        if (this.$data.visible) {
            this.setupFloating();
            // content 变化后同步代理文本，避免读屏拿到旧描述
            this.updateAriaDescribedBy(true);
        } else {
            this.teardownFloating();
            // 受控 visible=false 不会经过 hide()：必须在这里还原 aria-describedby
            this.updateAriaDescribedBy(false);
        }
    }

    /**
     * 组件销毁时清理
     */
    unmounted(): void {
        this.unbindClickOutside();
        this.unbindDefaultSlotListener();
        this.unbindSlotEvents();
        this.teardownFloating();
    }
}

export default SolelyTooltip;
export { SolelyTooltip };
