/**
 * Solely Upload 组件
 * 上传组件，用于文件上传
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { UploadProps, UploadFile } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-upload',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'action', type: 'string' },
        { name: 'accept', type: 'string' },
        { name: 'multiple', type: 'boolean', default: false },
        { name: 'fileList', type: 'string' },
        { name: 'listType', type: 'string' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'showUploadList', type: 'boolean', default: true },
        { name: 'buttonText', type: 'string' },
        { name: 'drag', type: 'boolean', default: false },
        { name: 'maxCount', type: 'number' },
        { name: 'maxSize', type: 'number' },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyUpload extends BaseElement<UploadProps & { parsedFileList: UploadFile[]; isDragging: boolean }> {
    /**
     * 获取 upload class 对象
     */
    getUploadClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.listType) {
            classes[`upload--${this.$data.listType}`] = true;
        }
        classes['is-disabled'] = !!this.$data.disabled;
        return classes;
    }

    /**
     * 暴露 fileList 属性，使外部可通过 event.target.fileList 访问
     */
    get fileList(): UploadFile[] {
        return this.$data.parsedFileList;
    }

    /**
     * 获取 drag class 对象
     */
    getDragClasses(): Record<string, boolean> {
        return {
            'upload__drag--active': !!this.$data.isDragging,
        };
    }

    mounted(): void {
        this.parseFileList();
        this.$data.isDragging = false;
    }

    /**
     * 解析文件列表
     */
    parseFileList(): void {
        try {
            this.$data.parsedFileList = JSON.parse(this.$data.fileList || '[]');
        } catch {
            this.$data.parsedFileList = [];
        }
    }

    /**
     * 触发文件选择
     */
    triggerUpload(): void {
        if (this.$data.disabled) return;

        const input = this.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
            input.click();
        }
    }

    /**
     * 文件选择变化
     */
    handleFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;

        if (files && files.length > 0) {
            this.handleFiles(files);
        }

        // 重置 input 以便可以重复选择相同文件
        input.value = '';
    }

    /**
     * 处理文件
     */
    handleFiles(files: FileList): void {
        const maxCount = this.$data.maxCount || Infinity;
        const maxSize = this.$data.maxSize || Infinity;

        Array.from(files).forEach(file => {
            // 检查文件数量限制
            if (this.$data.parsedFileList.length >= maxCount) {
                // 派发 error 自定义事件
                this.emit('error', {
                    file: { name: file.name, size: file.size } as UploadFile,
                    message: `文件数量超过限制 (最多 ${maxCount} 个)`,
                });
                return;
            }

            // 检查文件大小限制
            if (file.size > maxSize) {
                // 派发 error 自定义事件
                this.emit('error', {
                    file: { name: file.name, size: file.size } as UploadFile,
                    message: `文件大小超过限制 (${this.formatSize(maxSize)})`,
                });
                return;
            }

            const uploadFile: UploadFile = {
                uid: Date.now() + Math.random().toString(36).substr(2, 9),
                name: file.name,
                size: file.size,
                type: file.type,
                status: 'uploading',
                percent: 0,
            };

            this.$data.parsedFileList.push(uploadFile);

            // 手动派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );

            // 上传文件
            this.uploadFile(uploadFile, file);
        });
    }

    /**
     * 上传文件
     */
    uploadFile(uploadFile: UploadFile, file: File): void {
        // 如果没有配置 action，直接标记为完成
        if (!this.$data.action) {
            uploadFile.status = 'done';
            uploadFile.percent = 100;
            uploadFile.url = URL.createObjectURL(file);

            // 触发响应式更新
            this.refresh();

            // 派发 success 自定义事件
            this.emit('success', {
                file: uploadFile,
                fileList: this.$data.parsedFileList,
            });

            // 同时派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
            return;
        }

        // 使用 XMLHttpRequest 上传文件
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
                uploadFile.percent = Math.round((e.loaded / e.total) * 100);
                // 触发响应式更新
                this.$data.parsedFileList = [...this.$data.parsedFileList];
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                uploadFile.status = 'done';
                uploadFile.percent = 100;

                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.url) {
                        uploadFile.url = response.url;
                    }
                } catch {
                    // 忽略解析错误
                }

                // 触发响应式更新
                this.$data.parsedFileList = [...this.$data.parsedFileList];

                // 派发 success 自定义事件
                this.emit('success', {
                    file: uploadFile,
                    fileList: this.$data.parsedFileList,
                });
            } else {
                uploadFile.status = 'error';
                uploadFile.error = xhr.statusText;

                // 触发响应式更新
                this.$data.parsedFileList = [...this.$data.parsedFileList];

                // 派发 error 自定义事件
                this.emit('error', {
                    file: uploadFile,
                    message: xhr.statusText,
                });
            }

            // 派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        });

        xhr.addEventListener('error', () => {
            uploadFile.status = 'error';
            uploadFile.error = '网络错误';

            // 触发响应式更新
            this.$data.parsedFileList = [...this.$data.parsedFileList];

            // 派发 error 自定义事件
            this.emit('error', {
                file: uploadFile,
                message: '网络错误',
            });

            // 派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        });

        xhr.open('POST', this.$data.action, true);
        xhr.send(formData);
    }

    /**
     * 拖拽悬停
     */
    handleDragOver(event: DragEvent): void {
        event.preventDefault();
        this.$data.isDragging = true;
    }

    /**
     * 拖拽离开
     */
    handleDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.$data.isDragging = false;
    }

    /**
     * 拖拽放下
     */
    handleDrop(event: DragEvent): void {
        event.preventDefault();
        this.$data.isDragging = false;

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.handleFiles(files);
        }
    }

    /**
     * 移除文件
     */
    handleRemove(file: UploadFile): void {
        const index = this.$data.parsedFileList.findIndex(f => f.uid === file.uid);
        if (index > -1) {
            this.$data.parsedFileList.splice(index, 1);

            // 派发 remove 自定义事件
            this.emit('remove', {
                file,
                fileList: this.$data.parsedFileList,
            });

            // 手动派发原生 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    /**
     * 格式化文件大小
     */
    formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 获取状态文本
     */
    getStatusText(status?: string): string {
        const statusMap: Record<string, string> = {
            uploading: '上传中',
            done: '完成',
            error: '失败',
            removed: '已删除',
        };
        return statusMap[status || ''] || '';
    }

    /**
     * 获取文件列表
     */
    public getFileList(): UploadFile[] {
        return this.$data.parsedFileList;
    }

    /**
     * 清空文件列表
     */
    public clear(): void {
        this.$data.parsedFileList = [];
    }
}

export default SolelyUpload;
export { SolelyUpload };
