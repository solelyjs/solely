/**
 * Breadcrumb 面包屑组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './breadcrumb.html?raw';

@CustomElement({
    tagName: 'docs-breadcrumb',
    template,
})
export class DocsBreadcrumb extends BaseElement<{ title: string }> {
    constructor() {
        super({
            title: '',
        });
    }

    mounted(): void {
        this.initBreadcrumbs();
    }

    /**
     * 初始化所有面包屑示例
     */
    initBreadcrumbs(): void {
        // 基础用法
        const breadcrumb1 = this.$refs.breadcrumb1 as HTMLElement;
        if (breadcrumb1) {
            const items1 = [{ title: '首页', href: '/' }, { title: '组件', href: '/components' }, { title: '面包屑' }];
            breadcrumb1.setAttribute('items', JSON.stringify(items1));
        }

        // 自定义分隔符 - 箭头
        const breadcrumb2 = this.$refs.breadcrumb2 as HTMLElement;
        if (breadcrumb2) {
            const items2 = [{ title: '首页', href: '/' }, { title: '组件', href: '/components' }, { title: '面包屑' }];
            breadcrumb2.setAttribute('items', JSON.stringify(items2));
            breadcrumb2.setAttribute('separator', '>');
        }

        // 自定义分隔符 - 竖线
        const breadcrumb3 = this.$refs.breadcrumb3 as HTMLElement;
        if (breadcrumb3) {
            const items3 = [{ title: '首页', href: '/' }, { title: '组件', href: '/components' }, { title: '面包屑' }];
            breadcrumb3.setAttribute('items', JSON.stringify(items3));
            breadcrumb3.setAttribute('separator', '|');
        }

        // 自定义分隔符 - 箭头符号
        const breadcrumb4 = this.$refs.breadcrumb4 as HTMLElement;
        if (breadcrumb4) {
            const items4 = [{ title: '首页', href: '/' }, { title: '组件', href: '/components' }, { title: '面包屑' }];
            breadcrumb4.setAttribute('items', JSON.stringify(items4));
            breadcrumb4.setAttribute('separator', '→');
        }

        // 点击事件示例
        const breadcrumb5 = this.$refs.breadcrumb5 as HTMLElement;
        if (breadcrumb5) {
            const items5 = [
                {
                    title: '首页',
                    onClick: () => this.logClick('首页'),
                },
                {
                    title: '组件',
                    onClick: () => this.logClick('组件'),
                },
                { title: '面包屑' },
            ];
            breadcrumb5.setAttribute('items', JSON.stringify(items5));

            // 监听点击事件
            breadcrumb5.addEventListener('click', () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const item = (breadcrumb5 as any).clickedItem;
                if (item) {
                    this.logClick(item.title);
                }
            });
        }

        // 使用链接
        const breadcrumb6 = this.$refs.breadcrumb6 as HTMLElement;
        if (breadcrumb6) {
            const items6 = [{ title: '首页', href: '/' }, { title: '产品中心', href: '/products' }, { title: '详情' }];
            breadcrumb6.setAttribute('items', JSON.stringify(items6));
        }
    }

    /**
     * 记录点击日志
     */
    logClick(title: string): void {
        this.$data.title = `点击了: ${title}`;
        setTimeout(() => {
            this.$data.title = '';
        }, 2000);
    }
}

export default DocsBreadcrumb;
