/**
 * Upload 上传组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './upload.html?raw';

interface UploadDocData {
    eventLogs: string[];
}

/** customRequest 的回调参数（只列出文档 mock 用到的部分） */
type MockUploadOptions = {
    file: File;
    onProgress: (percent: number) => void;
    onSuccess: (response?: unknown) => void;
    onError: (error?: unknown) => void;
    signal?: AbortSignal;
};

type MockUploadRequest = (options: MockUploadOptions) => { abort: () => void };

@CustomElement({
    tagName: 'docs-upload',
    template,
})
export class DocsUpload extends BaseElement<UploadDocData> {
    constructor() {
        super({
            eventLogs: [],
        });
    }

    /**
     * 处理上传 change 事件
     */
    handleUploadChange(event: Event): void {
        const target = event.target as unknown as { fileList: { name: string; status: string }[] };
        const fileList = target?.fileList ?? [];
        this.addEventLog(`change: 文件列表更新，共 ${fileList.length} 个文件`);
    }

    /**
     * 处理上传成功事件
     */
    handleUploadSuccess(event: CustomEvent<{ file: { name: string } }>): void {
        const file = event.detail?.file;
        this.addEventLog(`success: ${file?.name ?? '未知文件'} 上传成功`);
    }

    /**
     * 处理上传错误事件
     */
    handleUploadError(event: CustomEvent<{ file: { name: string }; message: string }>): void {
        const { file, message } = event.detail ?? {};
        this.addEventLog(`error: ${file?.name ?? '未知文件'} - ${message ?? '上传失败'}`);
    }

    /**
     * 处理上传进度事件
     */
    handleUploadProgress(
        event: CustomEvent<{ file: { name: string }; percent: number; overallPercent: number }>,
    ): void {
        const { file, percent, overallPercent } = event.detail ?? {};
        this.addEventLog(`progress: ${file?.name ?? '未知文件'} ${percent ?? 0}%（整体 ${overallPercent ?? 0}%）`);
    }

    /**
     * 处理上传取消事件
     */
    handleUploadCancel(event: CustomEvent<{ file: { name: string } }>): void {
        const file = event.detail?.file;
        this.addEventLog(`cancel: ${file?.name ?? '未知文件'} 已取消`);
    }

    /**
     * 处理文件移除事件
     */
    handleUploadRemove(event: CustomEvent<{ file: { name: string } }>): void {
        const file = event.detail?.file;
        this.addEventLog(`remove: ${file?.name ?? '未知文件'} 已移除`);
    }

    /**
     * 添加事件日志
     */
    addEventLog(message: string): void {
        const logs = this.$data.eventLogs || [];
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.length > 5) logs.pop();
        this.$data.eventLogs = logs;
        if (this.$refs.eventLog) {
            this.$refs.eventLog.textContent = logs.join('\n');
        }
    }

    /**
     * 文档站没有后端：用定时器模拟进度 / 完成 / 取消，避免所有样例都显示上传失败。
     * customRequest 只能 JS 属性赋值，不能写成 HTML attribute。
     */
    private createMockRequest(): MockUploadRequest {
        return ({ onProgress, onSuccess, onError, signal }) => {
            let percent = 0;
            const timer = window.setInterval(() => {
                percent += 25;
                onProgress(percent);
                if (percent >= 100) {
                    window.clearInterval(timer);
                    onSuccess({ url: 'mock://done' });
                }
            }, 300);
            signal?.addEventListener('abort', () => window.clearInterval(timer));
            return {
                abort: () => {
                    window.clearInterval(timer);
                    onError('用户取消');
                },
            };
        };
    }

    /** 文档页挂载后统一注入 mock 上传与示例钩子 */
    mounted(): void {
        const mockRequest = this.createMockRequest();
        const noTarget = this.$refs.noTargetUpload;

        // 每个可交互样例都应能演示完整成功流程；
        // 只保留「未配置上传目标」那一个刻意演示 error（0.8.0 验收样例）。
        this.querySelectorAll('solely-upload').forEach(el => {
            if (el === noTarget) return;
            (el as unknown as { customRequest?: MockUploadRequest }).customRequest = mockRequest;
        });

        // before-upload 样例额外注入校验钩子：拒绝 .exe，其余放行
        const hooksUpload = this.$refs.hooksUpload as unknown as { beforeUpload?: (file: File) => boolean } | undefined;
        if (hooksUpload) {
            hooksUpload.beforeUpload = (file: File) => !file.name.toLowerCase().endsWith('.exe');
        }
    }
}

export default DocsUpload;
