/**
 * Upload 组件类型定义
 */

export type UploadListType = 'text' | 'picture' | 'picture-card';

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
    status?: 'uploading' | 'done' | 'error' | 'removed';
    /** 上传进度 */
    percent?: number;
    /** 文件URL */
    url?: string;
    /** 错误信息 */
    error?: string;
}

export interface UploadProps {
    /** 上传地址 */
    action?: string;
    /** 接受上传的文件类型 */
    accept?: string;
    /** 是否支持多选 */
    multiple?: boolean;
    /** 上传文件列表（JSON字符串） */
    fileList?: string;
    /** 上传列表的内建样式 */
    listType?: UploadListType;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示上传列表 */
    showUploadList?: boolean;
    /** 上传按钮文字 */
    buttonText?: string;
    /** 是否支持拖拽上传 */
    drag?: boolean;
    /** 最大文件数量 */
    maxCount?: number;
    /** 文件大小限制（字节） */
    maxSize?: number;
    /** 是否撑满父容器宽度 */
    block?: boolean;
}
