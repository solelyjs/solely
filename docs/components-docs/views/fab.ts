/**
 * FAB 悬浮按钮组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './fab.html?raw';

interface FabData {
    disabledFab: boolean;
}

@CustomElement({
    tagName: 'docs-fab',
    template,
})
export class DocsFab extends BaseElement<FabData> {
    /**
     * 通过 constructor 初始化数据
     */
    constructor() {
        super({
            disabledFab: true,
        });
    }

    /**
     * 组件挂载后设置初始禁用状态
     */
    mounted(): void {
        // 初始设置为禁用状态
        const fab = this.$refs.disabledFab as unknown as Element;
        if (fab && this.$data.disabledFab) {
            fab.setAttribute('disabled', 'true');
        }
    }

    /**
     * 处理 FAB 点击
     */
    handleFabClick(event: MouseEvent): void {
        alert('FAB 按钮被点击了！');
        // eslint-disable-next-line no-console
        console.log('FAB click event:', event);
    }

    /**
     * 处理测试点击
     */
    handleTestClick(): void {
        alert('点击 FAB 按钮查看点击事件效果！');
    }

    /**
     * 显示隐藏的 FAB
     */
    showHideFab(): void {
        const fab = this.$refs.hideFab as unknown as { show: () => void };
        if (fab && typeof fab.show === 'function') {
            fab.show();
        }
    }

    /**
     * 切换禁用状态（使用 setAttribute）
     */
    toggleDisabled(): void {
        const fab = this.$refs.disabledFab as unknown as Element;
        if (fab) {
            if (this.$data.disabledFab) {
                // 当前是禁用状态，启用它
                fab.removeAttribute('disabled');
                fab.setAttribute('icon', '✓');
            } else {
                // 当前是启用状态，禁用它
                fab.setAttribute('disabled', 'true');
                fab.setAttribute('icon', '🚫');
            }
            this.$data.disabledFab = !this.$data.disabledFab;
        }
    }

    /**
     * 处理禁用 FAB 点击
     */
    handleDisabledFabClick(event: MouseEvent): void {
        const fab = this.$refs.disabledFab as unknown as Element;
        // 检查实际的 disabled attribute
        const isDisabled = fab?.hasAttribute('disabled');
        if (isDisabled) {
            event.stopPropagation();
            alert('当前 FAB 处于禁用状态，点击不会触发事件！');
        } else {
            alert('FAB 按钮被点击了！');
            // eslint-disable-next-line no-console
            console.log('FAB click event:', event);
        }
    }
}

export default DocsFab;
