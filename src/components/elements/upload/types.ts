/**
 * Upload 组件类型定义
 */

export type UploadListType = 'text' | 'picture' | 'picture-card';

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'error' | 'removed' | 'cancelled';

export interface UploadFile {
    /** 文件唯一标识 */
    uid: string;
    /** 文件名 */
    name: string;
    /** 文件大小 */
    size?: number;
    /** 文件类型 */
    type?: string;
    /** 上传状态 */
    status?: UploadStatus;
    /** 上传进度（0-100） */
    percent?: number;
    /** 文件URL */
    url?: string;
    /** 错误信息 */
    error?: string;
    /** 服务端响应（成功时） */
    response?: unknown;
}

/**
 * before-upload 返回值
 * - false：拒绝上传
 * - File：替换实际要上传的文件
 * - 其它真值 / undefined：按原文件继续
 */
export type UploadBeforeUploadResult = boolean | File | void;

/**
 * before-upload 回调
 *
 * 校验（accept / max-size / max-count）在 before-upload 之前完成，
 * 因此本回调只需要处理业务规则。
 */
export type UploadBeforeUpload = (
    file: File,
    fileList: UploadFile[],
) => UploadBeforeUploadResult | Promise<UploadBeforeUploadResult>;

/**
 * custom-request 回调参数
 *
 * 传入的 `onProgress` / `onSuccess` / `onError` 必须由实现主动调用；
 * `abort` 可被实现调用以结束本次上传（会走组件的取消流程）。
 * `signal` 在组件取消（移除文件 / abort / abortAll / 卸载）时触发。
 */
export interface UploadRequestOptions {
    /** 原始 File */
    file: File;
    /** 对应的文件项 */
    uploadFile: UploadFile;
    /** 上传地址 */
    action?: string;
    /** 请求方法，默认 POST */
    method: string;
    /** 文件字段名，默认 file */
    name: string;
    /** 额外请求头 */
    headers?: Record<string, string>;
    /** 额外表单字段 */
    data?: Record<string, unknown>;
    /** 是否携带 Cookie */
    withCredentials: boolean;
    /** 超时时间（毫秒），0 表示不限制 */
    timeout: number;
    /** 取消信号 */
    signal: AbortSignal;
    /** 进度回调，参数为 0-100 */
    onProgress: (percent: number, event?: ProgressEvent) => void;
    /** 成功回调，可传入服务端响应 */
    onSuccess: (response?: unknown) => void;
    /** 失败回调，可传入错误对象或字符串 */
    onError: (error?: unknown) => void;
    /** 取消本次上传（等价于组件 abort(uploadFile.uid)） */
    abort: () => void;
}

/** custom-request 可返回一个带 abort 的句柄，供组件取消时调用 */
export interface UploadRequestHandle {
    abort?: () => void;
}

export type UploadCustomRequest = (
    options: UploadRequestOptions,
) => UploadRequestHandle | void | Promise<UploadRequestHandle | void>;

export interface UploadProps {
    /** 上传地址 */
    action?: string;
    /** 请求方法，默认 POST */
    method?: string;
    /** 额外请求头 */
    headers?: Record<string, string>;
    /** 文件字段名，默认 file */
    name?: string;
    /** 是否携带 Cookie */
    withCredentials?: boolean;
    /** 额外表单字段 */
    data?: Record<string, unknown>;
    /** 超时时间（毫秒），0 表示不限制 */
    timeout?: number;
    /** 最大并发上传数，0 或负数表示不限制 */
    maxConcurrency?: number;
    /** before-upload 钩子（通过 JS 属性设置） */
    beforeUpload?: UploadBeforeUpload;
    /** custom-request 钩子（通过 JS 属性设置） */
    customRequest?: UploadCustomRequest;
    /** 接受上传的文件类型 */
    accept?: string;
    /** 是否支持多选 */
    multiple?: boolean;
    /**
     * 上传文件列表。
     *
     * - attribute：只接受 JSON 字符串（由 manifest 的 `type: 'string'` 负责转换）；
     * - JS property：`el.fileList` 读取为规范化后的 `UploadFile[]`，赋值同时接受数组与 JSON 字符串。
     */
    fileList?: string | UploadFile[];
    /** 上传列表的内建样式 */
    listType?: UploadListType;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示上传列表 */
    showUploadList?: boolean;
    /** 是否显示拖拽区的装饰图标，默认 true */
    showIcon?: boolean;
    /** 上传按钮文字 */
    buttonText?: string;
    /** 是否支持拖拽上传 */
    drag?: boolean;
    /** 最大文件数量 */
    maxCount?: number;
    /** 文件大小限制（字节），0 或未设置表示不限制 */
    maxSize?: number;
    /** 是否撑满父容器宽度 */
    block?: boolean;
}
