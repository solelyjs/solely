/**
 * Solely Upload 组件
 * 上传组件，用于文件上传
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type {
    UploadProps,
    UploadFile,
    UploadBeforeUpload,
    UploadCustomRequest,
    UploadRequestHandle,
    UploadRequestOptions,
    UploadListType,
} from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
import { safeJsonParse } from '../utils/helpers';
import { IS_DEV } from '../../../shared/env';
import { oneOf } from '../../../shared/enum';

/** 列表展示类型白名单：非法值回退到 text，避免产出无样式的 upload--xxx 类 */
const UPLOAD_LIST_TYPES: readonly UploadListType[] = ['text', 'picture', 'picture-card'];

/** 上传按钮默认文案（manifest 默认值与拖拽区文案判断共用，避免重复维护） */
const DEFAULT_BUTTON_TEXT = '上传文件';
/** 拖拽区专属默认文案 */
const DEFAULT_DRAG_TEXT = '点击或拖拽文件到此区域上传';

/** 进行中的请求 */
interface ActiveRequest {
    uid: string;
    file: File;
    aborted: boolean;
    finished: boolean;
    /** 取消底层请求（XHR.abort / customRequest 返回的 abort） */
    abortHandle?: () => void;
}

/** 排队中的请求 */
interface QueuedRequest {
    uid: string;
    file: File;
}

@CustomElement({
    tagName: 'solely-upload',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'action', type: 'string' },
        { name: 'method', type: 'string', default: 'POST' },
        { name: 'headers', type: 'object' },
        { name: 'name', type: 'string', default: 'file' },
        { name: 'withCredentials', type: 'boolean', default: false },
        { name: 'data', type: 'object' },
        { name: 'timeout', type: 'number', default: 0 },
        // 0 / 负数 / 非数字 = 不限制并发
        { name: 'maxConcurrency', type: 'number', default: 0 },
        // 函数属性：仅支持 JS 属性赋值，不支持从 HTML attribute 传入
        { name: 'beforeUpload' },
        { name: 'customRequest' },
        { name: 'accept', type: 'string' },
        { name: 'multiple', type: 'boolean', default: false },
        { name: 'fileList', type: 'string', default: [] },
        { name: 'listType', type: 'string', default: 'text' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'showUploadList', type: 'boolean', default: true },
        { name: 'showIcon', type: 'boolean', default: true },
        { name: 'buttonText', type: 'string', default: DEFAULT_BUTTON_TEXT },
        { name: 'drag', type: 'boolean', default: false },
        { name: 'maxCount', type: 'number', default: Infinity },
        { name: 'maxSize', type: 'number', default: Infinity },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyUpload extends BaseElement<UploadProps & { parsedFileList: UploadFile[]; isDragging: boolean }> {
    /** uid → 进行中的请求 */
    #active = new Map<string, ActiveRequest>();
    /** 超过并发上限后等待的请求 */
    #queue: QueuedRequest[] = [];
    /** 组件是否已卸载（卸载后的回调不再派发事件） */
    #isUnmounted = false;
    /** 防止 #pumpQueue 重入 */
    #isPumping = false;
    /** 是否已提示过“未配置上传目标” */
    #warnedMissingAction = false;

    /**
     * 获取 upload class 对象
     */
    getUploadClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        classes[`upload--${this.getListType()}`] = true;
        classes['is-disabled'] = !!this.$data.disabled;
        return classes;
    }

    /**
     * 归一化列表展示类型：非法值回退到 text
     */
    getListType(): UploadListType {
        return oneOf(this.$data.listType, UPLOAD_LIST_TYPES, 'text');
    }

    /**
     * 暴露 fileList 属性，使外部可通过 event.target.fileList 访问。
     *
     * getter 返回规范化后的数组；setter 同时接受数组与 JSON 字符串，
     * 方便受控使用（`el.fileList = [...]`）与属性传值（`file-list="[...]"`）。
     */
    get fileList(): UploadFile[] {
        return this.$data.parsedFileList;
    }

    set fileList(value: UploadFile[] | string) {
        if (typeof value === 'string') {
            this.$data.fileList = value;
            this.parseFileList();
            return;
        }

        const normalized = this.#normalizeFileList(value);
        this.$data.parsedFileList = normalized;
        this.$data.fileList = JSON.stringify(normalized);
    }

    /**
     * 拖拽区文案
     *
     * buttonText 有 manifest 默认值「上传文件」，但拖拽区未显式设置时
     * 仍应展示拖拽专属文案；显式改为其它值时跟随 buttonText。
     */
    getDragText(): string {
        const text = this.$data.buttonText;
        return text && text !== DEFAULT_BUTTON_TEXT ? text : DEFAULT_DRAG_TEXT;
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
        this.#isUnmounted = false;
        this.refresh();
        this.parseFileList();
        this.$data.isDragging = false;
    }

    unmounted(): void {
        this.#isUnmounted = true;
        // 取消进行中的请求与排队项，且不派发事件
        this.#cancelAll(false);
    }

    /**
     * 解析文件列表。
     *
     * 外部传入的已有文件只需要 name / url / status，不要求是 File 实例；
     * 缺少 uid 时自动补齐，非法项直接跳过，保证渲染不会因数据形状崩溃。
     */
    parseFileList(): void {
        const raw = this.$data.fileList;
        const parsed = typeof raw === 'string' ? safeJsonParse<unknown>(raw, []) : raw;
        this.$data.parsedFileList = this.#normalizeFileList(parsed);
    }

    #normalizeFileList(value: unknown): UploadFile[] {
        if (!Array.isArray(value)) return [];

        return value
            .filter(item => !!item && typeof item === 'object')
            .map(item => {
                const file = { ...(item as Partial<UploadFile>) } as UploadFile;
                if (!file.uid) {
                    file.uid = this.#createUid();
                }
                if (typeof file.name !== 'string' || !file.name) {
                    const fromUrl = typeof file.url === 'string' ? file.url.split('/').pop() : '';
                    file.name = fromUrl || '未命名文件';
                }
                if (!file.status) {
                    file.status = 'done';
                }
                return file;
            });
    }

    #createUid(): string {
        return Date.now() + Math.random().toString(36).slice(2, 11);
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
     *
     * 事件契约：一次选择只派发一次汇总 change（至少有一个文件通过校验并进入列表时）。
     * 逐个文件的进度 / 成功 / 失败 / 取消通过 progress / success / error / cancel 事件表达。
     */
    handleFiles(files: FileList): void {
        // 统一入口守卫：拖拽、文件选择、命令式调用都不得绕过 disabled
        if (this.$data.disabled) return;

        // 0 是合法的数量上限（禁止选择），不能用 || 回退成 Infinity
        const maxCount = this.$data.maxCount ?? Infinity;
        // maxSize=0（以及负数、非数字）沿用旧语义：不限制大小
        const maxSize = this.#maxSizeLimit();
        const accept = this.$data.accept;

        let accepted = 0;

        Array.from(files).forEach(file => {
            // 1. 数量校验（与历史行为一致，逐项检查当前列表长度）
            if (this.$data.parsedFileList.length >= maxCount) {
                this.#emitReject(file, `文件数量超过限制 (最多 ${maxCount} 个)`, 'max-count');
                return;
            }

            // 2. 类型校验（在 before-upload 之前）
            if (!this.#matchesAccept(file, accept)) {
                this.#emitReject(file, `文件类型不符合限制 (${accept})`, 'accept');
                return;
            }

            // 3. 大小校验（在 before-upload 之前）
            if (file.size > maxSize) {
                this.#emitReject(file, `文件大小超过限制 (${this.formatSize(maxSize)})`, 'max-size');
                return;
            }

            const uploadFile: UploadFile = {
                uid: this.#createUid(),
                name: file.name,
                size: file.size,
                type: file.type,
                // 配置了 before-upload 时先等钩子结果，避免 UI 直接显示“上传中”
                status: this.#getBeforeUpload() ? 'waiting' : 'uploading',
                percent: 0,
            };

            this.$data.parsedFileList.push(uploadFile);
            accepted += 1;

            this.#processFile(uploadFile, file);
        });

        if (accepted > 0) {
            // 同步字符串属性，避免重新挂载时 parseFileList 读到旧数据
            this.$data.fileList = JSON.stringify(this.$data.parsedFileList);
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    #maxSizeLimit(): number {
        const value = Number(this.$data.maxSize);
        return Number.isFinite(value) && value > 0 ? value : Infinity;
    }

    /**
     * 兼容旧版公开方法：对列表中已有的文件项触发上传
     */
    public uploadFile(uploadFile: UploadFile, file: File): void {
        if (this.#isUnmounted || !this.#findFile(uploadFile.uid)) return;
        uploadFile.status = 'uploading';
        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.#startOrQueue(uploadFile, file);
    }

    /**
     * accept 校验
     *
     * 支持 `.png`、`image/*`、`application/pdf` 三类写法，逗号分隔。
     */
    #matchesAccept(file: File, accept?: string): boolean {
        if (!accept || !accept.trim()) return true;

        const tokens = accept
            .split(',')
            .map(token => token.trim().toLowerCase())
            .filter(Boolean);
        if (tokens.length === 0) return true;

        const fileName = (file.name || '').toLowerCase();
        const mimeType = (file.type || '').toLowerCase();

        return tokens.some(token => {
            if (token.startsWith('.')) {
                return fileName.endsWith(token);
            }
            if (token.endsWith('/*')) {
                return mimeType.startsWith(token.slice(0, -1));
            }
            return mimeType === token;
        });
    }

    #emitReject(file: File, message: string, reason: string): void {
        this.emit('error', {
            file: { name: file.name, size: file.size } as UploadFile,
            message,
            reason,
        });
    }

    #getBeforeUpload(): UploadBeforeUpload | undefined {
        const hook = this.$data.beforeUpload;
        return typeof hook === 'function' ? hook : undefined;
    }

    #getCustomRequest(): UploadCustomRequest | undefined {
        const hook = this.$data.customRequest;
        return typeof hook === 'function' ? hook : undefined;
    }

    /**
     * 执行 before-upload，然后进入上传/排队
     */
    #processFile(uploadFile: UploadFile, file: File): void {
        const hook = this.#getBeforeUpload();
        if (!hook) {
            this.#startOrQueue(uploadFile, file);
            return;
        }

        let result: unknown;
        try {
            result = hook.call(this, file, this.$data.parsedFileList.slice());
        } catch (error) {
            this.#failFile(uploadFile, this.#errorMessage(error, 'before-upload 校验失败'), 'before-upload');
            return;
        }

        if (result && typeof (result as Promise<unknown>).then === 'function') {
            (result as Promise<unknown>)
                .then(value => this.#applyBeforeUploadResult(uploadFile, file, value))
                .catch(error =>
                    this.#failFile(uploadFile, this.#errorMessage(error, 'before-upload 校验失败'), 'before-upload'),
                );
            return;
        }

        this.#applyBeforeUploadResult(uploadFile, file, result);
    }

    #applyBeforeUploadResult(uploadFile: UploadFile, file: File, result: unknown): void {
        if (this.#isUnmounted || !this.#findFile(uploadFile.uid)) return;
        // 钩子等待期间用户可能已取消或移除该文件
        if (uploadFile.status === 'cancelled' || uploadFile.status === 'removed') return;

        if (result === false) {
            this.#failFile(uploadFile, 'before-upload 返回 false，已拒绝上传', 'before-upload');
            return;
        }

        let payload = file;
        if (typeof File !== 'undefined' && result instanceof File) {
            payload = result;
            uploadFile.name = payload.name;
            uploadFile.size = payload.size;
            uploadFile.type = payload.type;
        }

        uploadFile.status = 'uploading';
        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.#startOrQueue(uploadFile, payload);
    }

    #failFile(uploadFile: UploadFile, message: string, reason: string): void {
        if (this.#isUnmounted) return;
        if (uploadFile.status === 'cancelled' || uploadFile.status === 'removed') return;

        uploadFile.status = 'error';
        uploadFile.error = message;
        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.emit('error', { file: uploadFile, message, reason });
    }

    #errorMessage(error: unknown, fallback: string): string {
        if (error instanceof Error && error.message) return `${fallback}: ${error.message}`;
        if (typeof error === 'string' && error) return `${fallback}: ${error}`;
        return fallback;
    }

    /**
     * 并发控制：未超过上限立即开始，否则排队
     */
    #startOrQueue(uploadFile: UploadFile, file: File): void {
        if (this.#isUnmounted || !this.#findFile(uploadFile.uid)) return;

        const limit = this.#concurrencyLimit();
        if (this.#active.size >= limit) {
            uploadFile.status = 'waiting';
            this.#queue.push({ uid: uploadFile.uid, file });
            this.$data.parsedFileList = [...this.$data.parsedFileList];
            return;
        }

        this.#startRequest(uploadFile, file);
    }

    #concurrencyLimit(): number {
        const value = Number(this.$data.maxConcurrency);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : Infinity;
    }

    #pumpQueue(): void {
        if (this.#isPumping) return;
        if (this.#isUnmounted) {
            this.#queue = [];
            return;
        }

        this.#isPumping = true;
        try {
            const limit = this.#concurrencyLimit();
            while (this.#queue.length > 0 && this.#active.size < limit) {
                const next = this.#queue.shift() as QueuedRequest;
                const uploadFile = this.#findFile(next.uid);
                if (!uploadFile || uploadFile.status !== 'waiting') continue;
                this.#startRequest(uploadFile, next.file);
            }
        } finally {
            this.#isPumping = false;
        }
    }

    /**
     * 开始一次上传
     *
     * 优先级：custom-request > action(XHR)。
     * 两者都没有时按失败处理：不再伪造 done / 100% / success。
     */
    #startRequest(uploadFile: UploadFile, file: File): void {
        uploadFile.status = 'uploading';
        this.$data.parsedFileList = [...this.$data.parsedFileList];

        const customRequest = this.#getCustomRequest();
        if (customRequest) {
            this.#startCustomRequest(uploadFile, file, customRequest);
            return;
        }

        if (!this.$data.action) {
            this.#failMissingAction(uploadFile);
            this.#pumpQueue();
            return;
        }

        this.#startXHR(uploadFile, file);
    }

    /**
     * 未配置 action / custom-request：显式失败
     *
     * 覆盖式地标记错误并派发 error，同时在开发环境给出一次可见告警。
     */
    #failMissingAction(uploadFile: UploadFile): void {
        const message = '未配置 action 或 custom-request，文件未上传';
        uploadFile.status = 'error';
        uploadFile.error = message;

        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.emit('error', {
            file: uploadFile,
            message,
            reason: 'missing-action',
        });

        if (IS_DEV && !this.#warnedMissingAction) {
            this.#warnedMissingAction = true;
            console.warn(
                '[Solely Upload] <solely-upload> 未配置 action 或 custom-request，文件不会上传。' +
                    '请设置 action 属性或 customRequest 属性；如需仅预览本地文件，请使用 custom-request 自行处理。',
            );
        }
    }

    #startXHR(uploadFile: UploadFile, file: File): void {
        const token: ActiveRequest = {
            uid: uploadFile.uid,
            file,
            aborted: false,
            finished: false,
        };
        this.#active.set(uploadFile.uid, token);

        let xhr: XMLHttpRequest;
        try {
            xhr = new XMLHttpRequest();
            token.abortHandle = () => xhr.abort();

            const formData = new FormData();
            formData.append(this.$data.name || 'file', file);
            this.#appendExtraData(formData);

            xhr.upload.addEventListener('progress', event => {
                if (token.aborted || token.finished || this.#isUnmounted) return;
                if (!event.lengthComputable || event.total <= 0) return;
                this.#updateProgress(uploadFile, (event.loaded / event.total) * 100, token);
            });

            xhr.addEventListener('load', () => {
                if (token.aborted || token.finished || this.#isUnmounted) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    let response: unknown = xhr.responseText;
                    try {
                        response = JSON.parse(xhr.responseText);
                    } catch {
                        // 响应不是 JSON 时保留原始文本
                    }
                    this.#succeed(uploadFile, token, response);
                } else {
                    this.#fail(uploadFile, token, xhr.statusText || `HTTP ${xhr.status}`, 'http');
                }
            });

            xhr.addEventListener('error', () => {
                this.#fail(uploadFile, token, '网络错误', 'network');
            });

            xhr.addEventListener('timeout', () => {
                this.#fail(uploadFile, token, '上传超时', 'timeout');
            });

            xhr.open(this.$data.method || 'POST', this.$data.action || '', true);

            const headers = this.$data.headers;
            if (headers && typeof headers === 'object') {
                Object.entries(headers).forEach(([key, value]) => {
                    if (value == null) return;
                    xhr.setRequestHeader(key, String(value));
                });
            }

            if (this.$data.withCredentials) {
                xhr.withCredentials = true;
            }

            const timeout = Number(this.$data.timeout);
            if (Number.isFinite(timeout) && timeout > 0) {
                xhr.timeout = timeout;
            }

            xhr.send(formData);
        } catch (error) {
            this.#fail(uploadFile, token, this.#errorMessage(error, '上传失败'), 'request');
            return;
        }
    }

    #appendExtraData(formData: FormData): void {
        const extra = this.$data.data;
        if (!extra || typeof extra !== 'object') return;

        Object.entries(extra).forEach(([key, value]) => {
            if (value == null) return;
            const values = Array.isArray(value) ? value : [value];
            values.forEach(item => {
                if (typeof Blob !== 'undefined' && item instanceof Blob) {
                    formData.append(key, item);
                } else {
                    formData.append(key, String(item));
                }
            });
        });
    }

    #startCustomRequest(uploadFile: UploadFile, file: File, customRequest: UploadCustomRequest): void {
        const token: ActiveRequest = {
            uid: uploadFile.uid,
            file,
            aborted: false,
            finished: false,
        };
        this.#active.set(uploadFile.uid, token);

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        token.abortHandle = () => controller?.abort();

        const options: UploadRequestOptions = {
            file,
            uploadFile,
            action: this.$data.action,
            method: this.$data.method || 'POST',
            name: this.$data.name || 'file',
            headers: this.$data.headers,
            data: this.$data.data,
            withCredentials: !!this.$data.withCredentials,
            timeout: Number(this.$data.timeout) || 0,
            signal: controller ? controller.signal : (undefined as unknown as AbortSignal),
            onProgress: (percent, event) => {
                if (token.aborted || token.finished || this.#isUnmounted) return;
                this.#updateProgress(uploadFile, percent, token, event);
            },
            onSuccess: response => {
                if (token.aborted || token.finished || this.#isUnmounted) return;
                this.#succeed(uploadFile, token, response);
            },
            onError: error => {
                if (token.aborted || token.finished || this.#isUnmounted) return;
                this.#fail(uploadFile, token, this.#errorMessage(error, '上传失败'), 'custom-request');
            },
            abort: () => this.abort(uploadFile.uid),
        };

        try {
            const result = customRequest.call(this, options);
            if (result && typeof (result as Promise<UploadRequestHandle>).then === 'function') {
                (result as Promise<UploadRequestHandle | void>)
                    .then(handle => {
                        if (!handle?.abort) return;
                        if (token.finished || token.aborted) {
                            return;
                        }
                        token.abortHandle = () => handle.abort?.();
                    })
                    .catch(error => {
                        if (token.aborted || token.finished || this.#isUnmounted) return;
                        this.#fail(uploadFile, token, this.#errorMessage(error, '上传失败'), 'custom-request');
                    });
            } else {
                const handle = result as unknown as UploadRequestHandle | undefined;
                if (handle && typeof handle.abort === 'function') {
                    token.abortHandle = () => handle.abort?.();
                }
            }
        } catch (error) {
            this.#fail(uploadFile, token, this.#errorMessage(error, '上传失败'), 'custom-request');
        }
    }

    #updateProgress(uploadFile: UploadFile, percent: number, token?: ActiveRequest, event?: ProgressEvent): void {
        if (this.#isUnmounted) return;
        if (token && (token.aborted || token.finished)) return;

        const raw = Number(percent);
        if (!Number.isFinite(raw)) return;

        const previous = Math.max(0, Math.min(100, Number(uploadFile.percent) || 0));
        const next = Math.max(previous, Math.min(100, Math.max(0, Math.round(raw))));

        if (next === previous && uploadFile.percent !== undefined) return;

        uploadFile.percent = next;
        this.$data.parsedFileList = [...this.$data.parsedFileList];

        this.emit('progress', {
            file: uploadFile,
            percent: next,
            overallPercent: this.getOverallPercent(),
            event,
        });
    }

    #succeed(uploadFile: UploadFile, token: ActiveRequest, response?: unknown): void {
        if (token.aborted || token.finished) return;

        uploadFile.status = 'done';
        uploadFile.percent = 100;
        uploadFile.error = undefined;
        uploadFile.response = response;

        const url = this.#extractUrl(response);
        if (url) {
            uploadFile.url = url;
        }

        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.emit('success', {
            file: uploadFile,
            fileList: this.$data.parsedFileList,
            response,
        });

        this.#finishToken(token);
    }

    #fail(uploadFile: UploadFile, token: ActiveRequest, message: string, reason: string): void {
        if (token.aborted || token.finished) return;

        uploadFile.status = 'error';
        uploadFile.error = message;

        this.$data.parsedFileList = [...this.$data.parsedFileList];
        this.emit('error', {
            file: uploadFile,
            message,
            reason,
        });

        this.#finishToken(token);
    }

    #extractUrl(response: unknown): string | undefined {
        if (typeof response === 'string') {
            try {
                return this.#extractUrl(JSON.parse(response));
            } catch {
                return undefined;
            }
        }
        if (response && typeof response === 'object') {
            const url = (response as { url?: unknown }).url;
            return typeof url === 'string' ? url : undefined;
        }
        return undefined;
    }

    #finishToken(token: ActiveRequest): void {
        if (token.finished) return;
        token.finished = true;
        this.#active.delete(token.uid);
        this.#pumpQueue();
    }

    #findFile(uid: string): UploadFile | undefined {
        const files = this.$data.parsedFileList;
        if (!Array.isArray(files)) return undefined;
        return files.find(file => file.uid === uid);
    }

    /**
     * 取消单个上传
     *
     * 进行中的请求会被 abort，排队中的请求会出队；
     * 文件保留在列表中，状态置为 cancelled，并派发 cancel 事件。
     */
    public abort(uid: string): void {
        const file = this.#findFile(uid);
        if (!file) return;
        if (file.status !== 'uploading' && file.status !== 'waiting') return;

        this.#cancelUid(uid, true);
        this.#pumpQueue();
    }

    /**
     * 取消全部上传（进行中 + 排队中）
     */
    public abortAll(): void {
        const files = this.$data.parsedFileList;
        const uids = (Array.isArray(files) ? files : [])
            .filter(file => file.status === 'uploading' || file.status === 'waiting')
            .map(file => file.uid);

        this.#queue = [];
        uids.forEach(uid => this.#cancelUid(uid, true));
    }

    #cancelUid(uid: string, emitEvent: boolean): void {
        const token = this.#active.get(uid);
        if (token) {
            token.aborted = true;
            this.#active.delete(uid);
            try {
                token.abortHandle?.();
            } catch {
                // 底层取消失败不应影响组件状态
            }
        }

        this.#queue = this.#queue.filter(item => item.uid !== uid);

        const file = this.#findFile(uid);
        if (!file) return;
        if (file.status !== 'uploading' && file.status !== 'waiting') return;

        file.status = 'cancelled';
        file.error = '上传已取消';
        this.$data.parsedFileList = [...this.$data.parsedFileList];

        if (emitEvent && this.isConnected) {
            this.emit('cancel', {
                file,
                fileList: this.$data.parsedFileList,
            });
        }
    }

    #cancelAll(emitEvent: boolean): void {
        const files = this.$data.parsedFileList;
        const uids = (Array.isArray(files) ? files : [])
            .filter(file => file.status === 'uploading' || file.status === 'waiting')
            .map(file => file.uid);

        this.#queue = [];
        uids.forEach(uid => this.#cancelUid(uid, emitEvent));
    }

    /**
     * 拖拽悬停
     */
    handleDragOver(event: DragEvent): void {
        // disabled 时既不显示拖拽态，也不阻止默认行为：浏览器据此拒绝 drop
        if (this.$data.disabled) return;
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
        this.$data.isDragging = false;
        if (this.$data.disabled) return;
        event.preventDefault();

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.handleFiles(files);
        }
    }

    /**
     * 拖拽区 / 按钮的键盘触发
     */
    handleTriggerKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.triggerUpload();
    }

    /**
     * 移除按钮的键盘触发
     */
    handleRemoveKeydown(file: UploadFile, event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleRemove(file);
    }

    /**
     * 移除文件
     */
    handleRemove(file: UploadFile): void {
        if (this.$data.disabled) return;

        const index = this.$data.parsedFileList.findIndex(f => f.uid === file.uid);
        if (index > -1) {
            // 移除上传中的文件时先取消底层请求（静默，不再额外派发 cancel）
            this.#cancelUid(file.uid, false);
            this.$data.parsedFileList.splice(index, 1);
            // 同步字符串属性，避免重新挂载时已删除文件复活
            this.$data.fileList = JSON.stringify(this.$data.parsedFileList);

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
            waiting: '等待上传',
            uploading: '上传中',
            done: '完成',
            error: '失败',
            removed: '已删除',
            cancelled: '已取消',
        };
        return statusMap[status || ''] || '';
    }

    /**
     * 是否存在进行中 / 等待中的上传
     */
    isUploading(): boolean {
        const files = this.$data.parsedFileList;
        return Array.isArray(files) && files.some(file => file.status === 'uploading' || file.status === 'waiting');
    }

    /**
     * 整体上传进度（0-100）
     *
     * 按列表内全部文件计算：完成计 100，其它取当前 percent。
     */
    public getOverallPercent(): number {
        const files = this.$data.parsedFileList;
        if (!Array.isArray(files) || files.length === 0) return 0;

        const total = files.reduce((sum, file) => {
            if (file.status === 'done') return sum + 100;
            const percent = Math.max(0, Math.min(100, Number(file.percent) || 0));
            return sum + percent;
        }, 0);

        return Math.round(total / files.length);
    }

    /**
     * 获取文件列表
     */
    public getFileList(): UploadFile[] {
        return this.$data.parsedFileList;
    }

    /**
     * 清空文件列表
     *
     * 会取消进行中的上传，并同步清空 fileList 字符串属性。
     * 仅在列表非空且组件仍处于连接状态时派发一次 change 事件。
     */
    public clear(): void {
        const hadFiles = this.$data.parsedFileList.length > 0;

        // 清空时静默取消，不额外派发 cancel
        this.#cancelAll(false);

        this.$data.parsedFileList = [];
        this.$data.fileList = '[]';

        if (!hadFiles || !this.isConnected) return;

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }
}

export default SolelyUpload;
export { SolelyUpload };
