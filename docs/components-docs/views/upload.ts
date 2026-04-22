/**
 * Upload 上传组件文档页面
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './upload.html?raw';

interface UploadDocData {
    eventLogs: string[];
}

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
}

export default DocsUpload;
