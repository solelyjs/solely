/**
 * Skeleton 骨架屏组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './skeleton.html?raw';

interface SkeletonDocData {
    loading: boolean;
    listLoading: boolean;
}

@CustomElement({
    tagName: 'docs-skeleton',
    template,
})
export class DocsSkeleton extends BaseElement<SkeletonDocData> {
    constructor() {
        super({
            loading: true,
            listLoading: true,
        });
    }

    /**
     * 切换加载状态
     */
    toggleLoading(): void {
        this.$data.loading = !this.$data.loading;
        const skeleton = this.$refs.skeleton1 as HTMLElement;
        if (skeleton) {
            if (this.$data.loading) {
                skeleton.setAttribute('loading', '');
            } else {
                skeleton.removeAttribute('loading');
            }
        }
    }

    /**
     * 切换列表加载状态
     */
    toggleListLoading(): void {
        this.$data.listLoading = !this.$data.listLoading;
        const skeleton = this.$refs.skeleton2 as HTMLElement;
        if (skeleton) {
            if (this.$data.listLoading) {
                skeleton.setAttribute('loading', '');
            } else {
                skeleton.removeAttribute('loading');
            }
        }
    }
}

export default DocsSkeleton;
