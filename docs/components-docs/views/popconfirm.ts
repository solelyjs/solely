import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Popconfirm } from '../../../src/components/commands/popconfirm';
import template from './popconfirm.html?raw';

interface DocsData {
    popconfirmLog: string[];
}

@CustomElement({
    tagName: 'docs-popconfirm',
    template,
})
export class DocsPopconfirm extends BaseElement<DocsData> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private bindInstance: any = null;

    constructor() {
        super({
            popconfirmLog: [],
        });
    }

    private addLog(message: string): void {
        this.$data.popconfirmLog = [...this.$data.popconfirmLog.slice(-4), message];
        this.refresh();
    }

    mounted(): void {
        // 在组件挂载时就绑定到元素
        const btn = this.$refs.bindBtn as HTMLElement;
        if (btn) {
            this.bindInstance = Popconfirm.bind(btn, {
                title: '绑定确认框',
                description: '点击按钮显示，点击外部关闭',
                onConfirm: () => {
                    this.addLog('绑定确认框 - 用户确认');
                },
                onCancel: () => {
                    this.addLog('绑定确认框 - 用户取消');
                },
            });
        }
    }

    unmounted(): void {
        // 清理绑定的实例
        this.bindInstance?.destroy();
        this.bindInstance = null;
    }

    showBasicConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '确认删除',
            description: '您确定要删除此项吗？',
            onConfirm: () => {
                this.addLog('用户确认删除');
            },
            onCancel: () => {
                this.addLog('用户取消删除');
            },
        });
        this.addLog('确认框已显示');
    }

    showCustomConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '确认操作',
            description: '此操作不可逆，请谨慎操作',
            okText: '我确定',
            cancelText: '再想想',
            onConfirm: () => {
                this.addLog('用户确认操作');
            },
            onCancel: () => {
                this.addLog('用户取消操作');
            },
        });
        this.addLog('自定义确认框已显示');
    }

    showDangerConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '危险操作',
            description: '此操作具有风险，是否继续？',
            okText: '继续',
            cancelText: '取消',
            okType: 'danger',
            onConfirm: () => {
                this.addLog('用户确认危险操作');
            },
            onCancel: () => {
                this.addLog('用户取消危险操作');
            },
        });
        this.addLog('危险操作确认框已显示');
    }

    showNoCancelConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '仅确认操作',
            description: '这个确认框没有取消按钮',
            showCancel: false,
            onConfirm: () => {
                this.addLog('用户确认操作');
            },
        });
        this.addLog('无取消按钮确认框已显示');
    }

    showTopConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '上方确认',
            placement: 'top',
            onConfirm: () => {
                this.addLog('上方确认完成');
            },
        });
        this.addLog('上方确认框已显示');
    }

    showBottomConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '下方确认',
            placement: 'bottom',
            onConfirm: () => {
                this.addLog('下方确认完成');
            },
        });
        this.addLog('下方确认框已显示');
    }

    showLeftConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '左侧确认',
            placement: 'left',
            onConfirm: () => {
                this.addLog('左侧确认完成');
            },
        });
        this.addLog('左侧确认框已显示');
    }

    showRightConfirm(event: Event): void {
        const target = event.target as HTMLElement;
        Popconfirm.show(target, {
            title: '右侧确认',
            placement: 'right',
            onConfirm: () => {
                this.addLog('右侧确认完成');
            },
        });
        this.addLog('右侧确认框已显示');
    }

    bindConfirm(): void {
        // 这个方法现在不需要了，绑定在 connectedCallback 中完成
    }
}
