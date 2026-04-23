import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Tooltip } from '../../../src/components/commands/tooltip';
import template from './tooltip.html?raw';

interface DocsData {
    tooltipLog: string[];
    elementTooltipLog: string[];
}

@CustomElement({
    tagName: 'docs-tooltip',
    template,
})
export class DocsTooltip extends BaseElement<DocsData> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private basicTooltipInstances: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private demoTooltipInstance: any = null;

    constructor() {
        super({
            tooltipLog: [],
            elementTooltipLog: [],
        });
    }

    private addLog(message: string): void {
        this.$data.tooltipLog = [...this.$data.tooltipLog.slice(-4), message];
        this.refresh();
    }

    private clearDemoTooltip(): void {
        if (this.demoTooltipInstance) {
            this.demoTooltipInstance.destroy();
            this.demoTooltipInstance = null;
        }
    }

    mounted(): void {
        // 绑定基础用法的 Tooltip
        const hoverBtn = this.$refs.hoverBtn as HTMLElement;
        if (hoverBtn) {
            this.basicTooltipInstances.push(
                Tooltip.bind(hoverBtn, {
                    content: '悬停提示内容',
                    trigger: 'hover',
                    placement: 'top',
                }),
            );
        }

        const clickBtn = this.$refs.clickBtn as HTMLElement;
        if (clickBtn) {
            this.basicTooltipInstances.push(
                Tooltip.bind(clickBtn, {
                    content: '点击提示内容',
                    trigger: 'click',
                    placement: 'bottom',
                }),
            );
        }

        const focusInput = this.$refs.focusInput as HTMLInputElement;
        if (focusInput) {
            this.basicTooltipInstances.push(
                Tooltip.bind(focusInput, {
                    content: '聚焦提示内容',
                    trigger: 'focus',
                    placement: 'right',
                }),
            );
        }
    }

    unmounted(): void {
        // 销毁所有基础 tooltip
        this.basicTooltipInstances.forEach(instance => instance.destroy());
        this.basicTooltipInstances = [];
        // 销毁演示 tooltip
        this.clearDemoTooltip();
        // 隐藏所有临时 tooltip
        Tooltip.hide();
    }

    bindHoverTooltip(): void {
        this.addLog('悬停提示已绑定');
    }

    bindClickTooltip(): void {
        this.addLog('点击提示已绑定');
    }

    bindFocusTooltip(): void {
        this.addLog('聚焦提示已绑定');
    }

    showTopTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.topBtn as HTMLElement;
        if (btn) {
            // 使用 manual 触发方式，避免与按钮点击事件冲突
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '上方提示',
                trigger: 'manual',
                placement: 'top',
            });
            this.demoTooltipInstance.show();
            this.addLog('上方提示已显示');
        }
    }

    showBottomTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.bottomBtn as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '下方提示',
                trigger: 'manual',
                placement: 'bottom',
            });
            this.demoTooltipInstance.show();
            this.addLog('下方提示已显示');
        }
    }

    showLeftTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.leftBtn as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '左侧提示',
                trigger: 'manual',
                placement: 'left',
            });
            this.demoTooltipInstance.show();
            this.addLog('左侧提示已显示');
        }
    }

    showRightTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.rightBtn as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '右侧提示',
                trigger: 'manual',
                placement: 'right',
            });
            this.demoTooltipInstance.show();
            this.addLog('右侧提示已显示');
        }
    }

    showCustomColorTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.colorBtn as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '自定义颜色提示',
                trigger: 'manual',
                placement: 'top',
                color: '#f5222d',
            });
            this.demoTooltipInstance.show();
            this.addLog('自定义颜色提示已显示');
        }
    }

    showManualTooltip(): void {
        this.clearDemoTooltip();
        const btn = this.$refs.manualBtn as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '手动控制提示',
                trigger: 'manual',
                placement: 'top',
            });
            this.demoTooltipInstance.show();
            this.addLog('手动控制提示已显示（点击"隐藏所有提示"关闭）');
        }
    }

    showControlledTooltip(event: Event): void {
        this.clearDemoTooltip();
        const btn = event.target as HTMLElement;
        if (btn) {
            this.demoTooltipInstance = Tooltip.bind(btn, {
                content: '受控模式提示（visible: true）',
                trigger: 'manual',
                placement: 'top',
                visible: true,
            });
            this.addLog('受控模式提示已显示（点击"隐藏所有提示"关闭）');
        }
    }

    showOnceTooltip(): void {
        const btn = this.$refs.onceBtn as HTMLElement;
        if (btn) {
            Tooltip.show(btn, {
                content: '自动消失的提示（3秒后）',
                placement: 'top',
                duration: 3000,
            });
            this.addLog('临时提示已显示（3秒后自动消失）');
        }
    }

    hideAllTooltips(): void {
        this.clearDemoTooltip();
        Tooltip.hide();
        this.addLog('所有提示已隐藏');
    }

    private addElementLog(message: string): void {
        this.$data.elementTooltipLog = [...this.$data.elementTooltipLog.slice(-4), message];
        this.refresh();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private elementTooltipInstance: any = null;

    bindElementTooltip(): void {
        if (this.elementTooltipInstance) {
            this.elementTooltipInstance.destroy();
            this.elementTooltipInstance = null;
            this.addElementLog('Element：Tooltip 已解绑');
            return;
        }

        const btn = this.$refs.elementTooltipBtn as HTMLElement;
        if (btn) {
            this.elementTooltipInstance = Tooltip.bind(btn, {
                content: 'Element 组件悬停提示',
                placement: 'top',
                trigger: 'hover',
            });
            this.addElementLog('Element：Tooltip 已绑定到 Button');
        }
    }

    showElementTooltip(): void {
        const btn = this.$refs.elementShowBtn as HTMLElement;
        if (btn) {
            Tooltip.show(btn, {
                content: 'Element 临时提示（2秒后消失）',
                placement: 'top',
                duration: 2000,
            });
            this.addElementLog('Element：临时提示已显示');
        }
    }

    showElementContentTooltip(): void {
        const btn = this.$refs.elementShowBtn as HTMLElement;
        if (btn) {
            // 使用 HTMLElement 作为 Tooltip 内容
            const customContent = document.createElement('div');
            customContent.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">✅</span>
                    <span>操作成功完成</span>
                </div>
            `;

            Tooltip.show(btn, {
                content: customContent,
                placement: 'top',
                duration: 3000,
            });
            this.addElementLog('Element：显示自定义 DOM 内容的提示');
        }
    }

    hideAllElementTooltips(): void {
        if (this.elementTooltipInstance) {
            this.elementTooltipInstance.hide();
        }
        Tooltip.hide();
        this.addElementLog('Element：所有提示已隐藏');
    }
}
