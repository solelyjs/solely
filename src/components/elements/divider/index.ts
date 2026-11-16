/**
 * Solely Divider 组件
 * 分割线组件，用于内容的分隔
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { DividerProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-divider',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'horizontal' },
        { name: 'orientation', type: 'string', default: 'center' },
        { name: 'dashed', type: 'boolean', default: false },
        { name: 'content', type: 'string', default: '' },
        { name: 'hasSlotContent', type: 'boolean', default: false },
    ],
})
class SolelyDivider extends BaseElement<DividerProps & { hasSlotContent: boolean }> {
    /**
     * 获取 divider class 对象
     */
    getDividerClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.type) {
            classes[`divider--${this.$data.type}`] = true;
        }
        if (this.$data.orientation) {
            classes[`divider--${this.$data.orientation}`] = true;
        }
        classes['divider--dashed'] = !!this.$data.dashed;
        return classes;
    }

    mounted(): void {
        this.refresh();
        // 检查是否有 slot 内容
        this.$data.hasSlotContent = this.hasMeaningfulSlotContent();
    }

    /**
     * 判断是否存在有效的 slot 内容
     *
     * 只有非空白文本，或元素自身（含后代）包含非空白文本时才算内容。
     * 这样可避免空 <span>、<template> 或纯空白文本被误判为内容，
     * 从而渲染出空的 [part=content] 包裹层。
     */
    private hasMeaningfulSlotContent(): boolean {
        return Array.from(this.childNodes).some(node => this.isMeaningfulNode(node));
    }

    private isMeaningfulNode(node: Node): boolean {
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent || '').trim() !== '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return false;

        // <template> 的内容不会渲染到页面
        if (node.nodeName === 'TEMPLATE') return false;

        const element = node as Element;
        if ((element.textContent || '').trim() !== '') return true;

        // 元素自身没有文本时，继续检查后代元素
        return Array.from(element.children).some(child => this.isMeaningfulNode(child));
    }
}

export default SolelyDivider;
export { SolelyDivider };
