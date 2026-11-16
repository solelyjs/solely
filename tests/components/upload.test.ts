/**
 * Upload 组件测试
 *
 * 覆盖：
 * - 默认行为（无新属性）与改造前保持一致：POST、字段名 file、change/success/error 语义
 * - before-upload：false 拒绝、Promise 等待、File 替换、异常
 * - custom-request：onProgress / onSuccess / onError / abort
 * - 请求配置：method / headers / name / with-credentials / data / timeout
 * - 进度：0-100、单调不减、单文件与整体进度
 * - 成功 / 失败 / 超时 / 取消 / 并发排队
 * - 受控 fileList（外部文件、非 File 实例）
 * - 校验：accept / max-size / max-count，均先于 before-upload
 * - 无障碍：键盘触发、aria 状态
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import '../../src/components/elements/upload';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 20));

type Listener = (event: any) => void;

/** 可手动驱动的 XHR mock，避免测试打真实网络 */
class MockXHR {
    static instances: MockXHR[] = [];

    uploadListeners = new Map<string, Listener[]>();
    listeners = new Map<string, Listener[]>();

    upload = {
        addEventListener: (type: string, listener: Listener) => this.addListener(this.uploadListeners, type, listener),
    };

    method = '';
    url = '';
    async = true;
    status = 0;
    statusText = '';
    responseText = '';
    withCredentials = false;
    timeout = 0;
    aborted = false;
    sent = false;
    headers: Record<string, string> = {};
    body: FormData | null = null;

    constructor() {
        MockXHR.instances.push(this);
    }

    static reset(): void {
        MockXHR.instances = [];
    }

    static last(): MockXHR {
        return MockXHR.instances[MockXHR.instances.length - 1];
    }

    open(method: string, url: string, async = true): void {
        this.method = method;
        this.url = url;
        this.async = async;
    }

    setRequestHeader(key: string, value: string): void {
        this.headers[key] = value;
    }

    addEventListener(type: string, listener: Listener): void {
        this.addListener(this.listeners, type, listener);
    }

    send(body: FormData): void {
        this.body = body;
        this.sent = true;
    }

    abort(): void {
        this.aborted = true;
        this.dispatch(this.listeners, 'abort');
    }

    private addListener(map: Map<string, Listener[]>, type: string, listener: Listener): void {
        const list = map.get(type) || [];
        list.push(listener);
        map.set(type, list);
    }

    private dispatch(map: Map<string, Listener[]>, type: string, extra: Record<string, unknown> = {}): void {
        const list = map.get(type) || [];
        list.forEach(listener => listener({ type, lengthComputable: false, loaded: 0, total: 0, ...extra }));
    }

    emitUploadProgress(loaded: number, total: number): void {
        this.dispatch(this.uploadListeners, 'progress', { lengthComputable: true, loaded, total });
    }

    respond(status = 200, body = '{}', statusText = 'OK'): void {
        this.status = status;
        this.responseText = body;
        this.statusText = statusText;
        this.dispatch(this.listeners, 'load');
    }

    networkError(): void {
        this.dispatch(this.listeners, 'error');
    }

    triggerTimeout(): void {
        this.dispatch(this.listeners, 'timeout');
    }
}

const originalXHR = globalThis.XMLHttpRequest;

function mount(attrs: Record<string, string> = {}): any {
    const el = document.createElement('solely-upload') as any;
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    document.body.appendChild(el);
    return el;
}

function collect(el: any, type: string): any[] {
    const events: any[] = [];
    el.addEventListener(type, (event: Event) => events.push(event));
    return events;
}

function createFileList(files: File[]): FileList {
    return {
        ...files,
        item: (index: number) => files[index],
        length: files.length,
    } as unknown as FileList;
}

function selectFiles(el: any, files: File[]): void {
    const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: createFileList(files), configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

let createdURLs: string[];
let revokedURLs: string[];

beforeEach(() => {
    document.body.innerHTML = '';
    MockXHR.reset();
    (globalThis as any).XMLHttpRequest = MockXHR;

    createdURLs = [];
    revokedURLs = [];
    (URL as any).createObjectURL = vi.fn(() => {
        const url = `blob:test/${createdURLs.length + 1}`;
        createdURLs.push(url);
        return url;
    });
    (URL as any).revokeObjectURL = vi.fn((url: string) => {
        revokedURLs.push(url);
    });
});

afterEach(() => {
    (globalThis as any).XMLHttpRequest = originalXHR;
    vi.restoreAllMocks();
});

describe('默认行为', () => {
    it('未配置 action / custom-request 时显式失败：不伪造 success、不创建 objectURL', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount({ multiple: '' });
        await tick();

        const change = collect(el, 'change');
        const success = collect(el, 'success');
        const errors = collect(el, 'error');

        selectFiles(el, [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
        ]);
        await tick();

        const files = el.getFileList();
        expect(files).toHaveLength(2);
        expect(files.every((file: any) => file.status === 'error')).toBe(true);
        expect(files.every((file: any) => file.error.includes('未配置'))).toBe(true);
        expect(change).toHaveLength(1);
        expect(success).toHaveLength(0);
        expect(errors).toHaveLength(2);
        expect(errors[0].detail.reason).toBe('missing-action');
        expect(createdURLs).toHaveLength(0);

        // 列表中可见错误信息，开发期给出一次告警
        const errorText = el.shadowRoot.querySelector('.upload__list-error') as HTMLElement;
        expect(errorText.textContent).toContain('未配置');
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('配置 action 时仍使用 POST + 字段名 file，成功派发 success 且不额外派发 change', async () => {
        const el = mount({ action: '/api/upload' });
        await tick();

        const change = collect(el, 'change');
        const success = collect(el, 'success');
        const progress = collect(el, 'progress');

        selectFiles(el, [new File(['abc'], 'a.txt', { type: 'text/plain' })]);
        await tick();

        expect(MockXHR.instances).toHaveLength(1);
        const xhr = MockXHR.last();
        expect(xhr.method).toBe('POST');
        expect(xhr.url).toBe('/api/upload');
        expect(xhr.withCredentials).toBe(false);
        expect(xhr.headers).toEqual({});
        expect((xhr.body as FormData).get('file')).toBeInstanceOf(File);

        xhr.emitUploadProgress(40, 100);
        await tick();
        expect(progress).toHaveLength(1);
        expect(progress[0].detail.percent).toBe(40);
        expect(progress[0].detail.overallPercent).toBe(40);

        xhr.respond(200, JSON.stringify({ url: 'https://cdn.example.com/a.txt' }));
        await tick();

        const [file] = el.getFileList();
        expect(file.status).toBe('done');
        expect(file.percent).toBe(100);
        expect(file.url).toBe('https://cdn.example.com/a.txt');
        expect(success).toHaveLength(1);
        expect(success[0].detail.file.uid).toBe(file.uid);
        expect(change).toHaveLength(1);
    });
});

describe('默认值', () => {
    it('未设置时 property 读回文档默认值', async () => {
        const el = mount();
        await tick();

        expect(el.listType).toBe('text');
        expect(el.buttonText).toBe('上传文件');
        expect(el.maxCount).toBe(Infinity);
        expect(el.maxSize).toBe(Infinity);
        expect(el.fileList).toEqual([]);
        expect(el.hasAttribute('list-type')).toBe(false);
        expect(el.hasAttribute('button-text')).toBe(false);

        // 拖拽区未显式设置 buttonText 时仍显示拖拽专属文案
        const drag = mount({ drag: '' });
        await tick();
        expect(drag.shadowRoot.querySelector('.upload__drag-text').textContent).toBe('点击或拖拽文件到此区域上传');
    });

    it('显式设置后 property 读回设置值', async () => {
        const el = mount({
            'list-type': 'picture',
            'button-text': '选择文件',
            'max-count': '2',
            'max-size': '1024',
        });
        await tick();

        expect(el.listType).toBe('picture');
        expect(el.buttonText).toBe('选择文件');
        expect(el.maxCount).toBe(2);
        expect(el.maxSize).toBe(1024);

        el.fileList = [{ name: 'a.txt', status: 'done' }];
        expect(el.fileList).toHaveLength(1);
        expect(el.fileList[0].name).toBe('a.txt');
    });

    it('removeAttribute 后回退到默认值', async () => {
        const el = mount({
            'list-type': 'picture',
            'button-text': '选择文件',
            'max-count': '2',
            'max-size': '1024',
            'file-list': '[{"name":"a.txt","status":"done"}]',
        });
        await tick();
        expect(el.fileList).toHaveLength(1);

        el.removeAttribute('list-type');
        el.removeAttribute('button-text');
        el.removeAttribute('max-count');
        el.removeAttribute('max-size');
        el.removeAttribute('file-list');

        expect(el.listType).toBe('text');
        expect(el.buttonText).toBe('上传文件');
        expect(el.maxCount).toBe(Infinity);
        expect(el.maxSize).toBe(Infinity);
        expect(el.fileList).toEqual([]);
    });

    it('should fall back to text list type for unknown listType', async () => {
        const el = mount({ 'list-type': 'bogus' });
        await tick();

        const root = el.shadowRoot.querySelector('.upload') as HTMLElement;
        expect(root.className).toContain('upload--text');
        expect(root.className).not.toContain('upload--bogus');

        // 图片列表分支也按归一化后的 text 处理
        el.fileList = [{ name: 'a.png', status: 'done', url: 'blob:a' }];
        await tick();
        expect(el.shadowRoot.querySelector('.upload__list-thumb')).toBeNull();
    });
});

describe('请求配置', () => {
    it('method / headers / name / with-credentials / data / timeout 生效', async () => {
        const el = mount({
            action: '/api/upload',
            method: 'PUT',
            name: 'avatar',
            headers: JSON.stringify({ Authorization: 'Bearer token', 'X-Trace': '1' }),
            data: JSON.stringify({ biz: 'demo', tags: ['a', 'b'] }),
            'with-credentials': '',
            timeout: '5000',
        });
        await tick();

        selectFiles(el, [new File(['abc'], 'a.txt')]);
        await tick();

        const xhr = MockXHR.last();
        expect(xhr.method).toBe('PUT');
        expect(xhr.headers).toEqual({ Authorization: 'Bearer token', 'X-Trace': '1' });
        expect(xhr.withCredentials).toBe(true);
        expect(xhr.timeout).toBe(5000);

        const body = xhr.body as FormData;
        expect(body.get('avatar')).toBeInstanceOf(File);
        expect(body.get('file')).toBeNull();
        expect(body.get('biz')).toBe('demo');
        expect(body.getAll('tags')).toEqual(['a', 'b']);
    });
});

describe('before-upload', () => {
    it('返回 false 时拒绝上传并派发 error', async () => {
        const el = mount();
        await tick();
        el.beforeUpload = vi.fn(() => false);

        const success = collect(el, 'success');
        const errors = collect(el, 'error');

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        expect(MockXHR.instances).toHaveLength(0);
        expect(success).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].detail.message).toContain('before-upload');
        expect(errors[0].detail.reason).toBe('before-upload');
        expect(el.getFileList()[0].status).toBe('error');
    });

    it('返回 Promise 时等待，解析后开始上传；返回 File 会替换上传文件', async () => {
        const el = mount({ action: '/api/upload' });
        await tick();

        const replacement = new File(['replaced'], 'replaced.txt', { type: 'text/plain' });
        el.beforeUpload = vi.fn(() => Promise.resolve(replacement));

        selectFiles(el, [new File(['origin'], 'origin.txt', { type: 'text/plain' })]);
        await tick();

        expect(MockXHR.instances).toHaveLength(1);
        const body = MockXHR.last().body as FormData;
        expect((body.get('file') as File).name).toBe('replaced.txt');

        const [file] = el.getFileList();
        expect(file.name).toBe('replaced.txt');
        expect(file.size).toBe(replacement.size);
    });

    it('Promise reject 时文件进入 error 状态并给出原因', async () => {
        const el = mount();
        await tick();
        el.beforeUpload = vi.fn(() => Promise.reject(new Error('业务校验失败')));

        const errors = collect(el, 'error');
        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        expect(errors).toHaveLength(1);
        expect(errors[0].detail.message).toContain('业务校验失败');
        expect(el.getFileList()[0].status).toBe('error');
    });

    it('校验在 before-upload 之前执行', async () => {
        const el = mount({ accept: 'image/*' });
        await tick();
        const hook = vi.fn(() => true);
        el.beforeUpload = hook;

        const errors = collect(el, 'error');
        selectFiles(el, [new File(['a'], 'a.txt', { type: 'text/plain' })]);
        await tick();

        expect(hook).not.toHaveBeenCalled();
        expect(el.getFileList()).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].detail.message).toContain('文件类型不符合限制');
        expect(errors[0].detail.reason).toBe('accept');
    });
});

describe('custom-request', () => {
    it('完全接管上传并暴露四个回调', async () => {
        const el = mount({
            action: '/ignored',
            method: 'PUT',
            name: 'avatar',
            headers: JSON.stringify({ 'X-Trace': '1' }),
            data: JSON.stringify({ biz: 'demo' }),
            'with-credentials': '',
        });
        await tick();

        let options: any;
        const progress = collect(el, 'progress');
        const success = collect(el, 'success');

        el.customRequest = vi.fn((requestOptions: any) => {
            options = requestOptions;
            requestOptions.onProgress(25);
            return { abort: vi.fn() };
        });

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        // 默认 XHR 路径不应被使用
        expect(MockXHR.instances).toHaveLength(0);
        expect(options.file.name).toBe('a.txt');
        expect(options.method).toBe('PUT');
        expect(options.name).toBe('avatar');
        expect(options.headers).toEqual({ 'X-Trace': '1' });
        expect(options.data).toEqual({ biz: 'demo' });
        expect(options.withCredentials).toBe(true);
        expect(options.signal).toBeDefined();
        expect(typeof options.abort).toBe('function');

        expect(progress).toHaveLength(1);
        expect(progress[0].detail.percent).toBe(25);

        options.onSuccess({ url: 'https://cdn.example.com/a.txt' });
        await tick();

        const [file] = el.getFileList();
        expect(file.status).toBe('done');
        expect(file.url).toBe('https://cdn.example.com/a.txt');
        expect(success).toHaveLength(1);
    });

    it('onError 会标记失败，Promise reject 同样处理', async () => {
        const el = mount();
        await tick();

        const errors = collect(el, 'error');
        el.customRequest = () => Promise.reject(new Error('custom boom'));

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        expect(errors).toHaveLength(1);
        expect(errors[0].detail.message).toContain('custom boom');
        expect(el.getFileList()[0].status).toBe('error');
    });

    it('abort 会调用 customRequest 返回的 abort 并标记为已取消', async () => {
        const el = mount();
        await tick();

        const abortHandle = vi.fn();
        el.customRequest = () => ({ abort: abortHandle });

        const cancel = collect(el, 'cancel');
        const errors = collect(el, 'error');

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        const [file] = el.getFileList();
        el.abort(file.uid);
        await tick();

        expect(abortHandle).toHaveBeenCalledTimes(1);
        expect(file.status).toBe('cancelled');
        expect(cancel).toHaveLength(1);
        expect(errors).toHaveLength(0);
    });
});

describe('进度', () => {
    it('0-100 单调不减，进度事件带文件标识与整体进度', async () => {
        const el = mount({ action: '/api/upload', multiple: '' });
        await tick();

        const progress = collect(el, 'progress');
        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
        await tick();

        expect(MockXHR.instances).toHaveLength(2);
        const [first, second] = MockXHR.instances;

        first.emitUploadProgress(40, 100);
        await tick();
        expect(progress).toHaveLength(1);
        expect(progress[0].detail.percent).toBe(40);
        expect(progress[0].detail.file.uid).toBe(el.getFileList()[0].uid);

        // 回退的进度被忽略
        first.emitUploadProgress(20, 100);
        await tick();
        expect(progress).toHaveLength(1);
        expect(el.getFileList()[0].percent).toBe(40);

        // 超过 100 被夹取
        first.emitUploadProgress(200, 100);
        await tick();
        expect(el.getFileList()[0].percent).toBe(100);

        second.emitUploadProgress(60, 100);
        await tick();
        expect(progress[progress.length - 1].detail.overallPercent).toBe(80); // (100 + 60) / 2

        // 已完成的文件计 100
        first.respond(200, '{}');
        await tick();
        second.emitUploadProgress(80, 100);
        await tick();
        expect(progress[progress.length - 1].detail.overallPercent).toBe(90); // (100 + 80) / 2
        expect(el.getOverallPercent()).toBe(90);
    });
});

describe('失败 / 超时 / 取消', () => {
    it('HTTP 非 2xx、网络错误与超时分别派发 error', async () => {
        const el = mount({ action: '/api/upload', multiple: '' });
        await tick();

        const errors = collect(el, 'error');
        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt')]);
        await tick();

        const [first, second, third] = MockXHR.instances;
        first.respond(500, 'error', 'Server Error');
        second.networkError();
        third.triggerTimeout();
        await tick();

        expect(errors).toHaveLength(3);
        expect(errors[0].detail.message).toBe('Server Error');
        expect(errors[1].detail.message).toBe('网络错误');
        expect(errors[2].detail.message).toBe('上传超时');
        expect(el.getFileList().every((file: any) => file.status === 'error')).toBe(true);
    });

    it('取消单个上传只影响该文件', async () => {
        const el = mount({ action: '/api/upload', multiple: '' });
        await tick();

        const cancel = collect(el, 'cancel');
        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
        await tick();

        const [firstXHR, secondXHR] = MockXHR.instances;
        const [firstFile, secondFile] = el.getFileList();

        el.abort(firstFile.uid);
        await tick();

        expect(firstXHR.aborted).toBe(true);
        expect(secondXHR.aborted).toBe(false);
        expect(firstFile.status).toBe('cancelled');
        expect(secondFile.status).toBe('uploading');
        expect(cancel).toHaveLength(1);
    });

    it('abortAll 取消全部进行中的上传，文件保留且状态为 cancelled', async () => {
        const el = mount({ action: '/api/upload', multiple: '' });
        await tick();

        const cancel = collect(el, 'cancel');
        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
        await tick();

        el.abortAll();
        await tick();

        expect(MockXHR.instances.every(xhr => xhr.aborted)).toBe(true);
        expect(el.getFileList().every((file: any) => file.status === 'cancelled')).toBe(true);
        expect(cancel).toHaveLength(2);
        expect(el.isUploading()).toBe(false);
    });

    it('移除上传中的文件会取消请求，clear() 会取消全部并回收 URL', async () => {
        const el = mount({ action: '/api/upload', multiple: '' });
        await tick();

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        const [file] = el.getFileList();
        el.handleRemove(file);
        await tick();
        expect(MockXHR.last().aborted).toBe(true);
        expect(el.getFileList()).toHaveLength(0);

        selectFiles(el, [new File(['b'], 'b.txt')]);
        await tick();
        el.clear();
        await tick();
        expect(MockXHR.last().aborted).toBe(true);
        expect(el.getFileList()).toHaveLength(0);
    });

    it('组件卸载会取消进行中的请求并静默处理', async () => {
        const el = mount({ action: '/api/upload' });
        await tick();

        const cancel = collect(el, 'cancel');
        const errors = collect(el, 'error');
        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        const xhr = MockXHR.last();
        el.remove();
        await tick();

        expect(xhr.aborted).toBe(true);
        expect(cancel).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });
});

describe('并发排队', () => {
    it('max-concurrency 超出上限时排队，完成后自动补位', async () => {
        const el = mount({ action: '/api/upload', multiple: '', 'max-concurrency': '2' });
        await tick();

        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt')]);
        await tick();

        expect(MockXHR.instances).toHaveLength(2);
        const files = el.getFileList();
        expect(files[0].status).toBe('uploading');
        expect(files[1].status).toBe('uploading');
        expect(files[2].status).toBe('waiting');

        MockXHR.instances[0].respond(200, '{}');
        await tick();

        expect(MockXHR.instances).toHaveLength(3);
        expect(el.getFileList()[2].status).toBe('uploading');
    });
});

describe('受控 fileList', () => {
    it('外部传入的 url/name/status 可渲染，非 File 实例不会被当作文件处理', async () => {
        const el = document.createElement('solely-upload') as any;
        el.fileList = [
            { name: 'photo.png', url: 'https://example.com/photo.png', status: 'done' },
            { uid: 'u2', name: 'report.pdf', status: 'uploading', percent: 40 },
        ];
        document.body.appendChild(el);
        await tick();

        const files = el.getFileList();
        expect(files).toHaveLength(2);
        expect(files[0].uid).toBeTruthy();
        expect(files[1].uid).toBe('u2');

        const names = Array.from(el.shadowRoot.querySelectorAll('.upload__list-name')).map((node: any) =>
            node.textContent.trim(),
        );
        expect(names).toEqual(['photo.png', 'report.pdf']);

        const progressbar = el.shadowRoot.querySelector('[role="progressbar"]') as HTMLElement;
        expect(progressbar.getAttribute('aria-valuenow')).toBe('40');
        expect((el.shadowRoot.querySelector('.upload__list-status') as HTMLElement).textContent.trim()).toBe('完成');
    });

    it('file-list 属性 JSON 同样可渲染', async () => {
        const el = mount({ 'file-list': JSON.stringify([{ name: 'a.txt', status: 'done' }]) });
        await tick();

        expect(el.getFileList()).toHaveLength(1);
        expect(el.getFileList()[0].name).toBe('a.txt');
    });
});

describe('校验', () => {
    it('accept 与 max-size 在 before-upload 之前生效，max-size=0 表示不限制', async () => {
        const el = mount({ accept: 'image/*', 'max-size': '5' });
        await tick();

        const errors = collect(el, 'error');
        selectFiles(el, [
            new File(['aaaaa'], 'a.txt', { type: 'text/plain' }),
            new File(['aaaaaaaaaa'], 'b.png', { type: 'image/png' }),
        ]);
        await tick();

        expect(el.getFileList()).toHaveLength(0);
        expect(errors).toHaveLength(2);
        expect(errors[0].detail.message).toContain('文件类型不符合限制');
        expect(errors[1].detail.message).toContain('文件大小超过限制');

        const unlimited = mount({ 'max-size': '0', action: '/api/upload' });
        await tick();
        const unlimitedErrors = collect(unlimited, 'error');
        selectFiles(unlimited, [new File(['aaaaaaaaaa'], 'c.txt', { type: 'text/plain' })]);
        await tick();

        expect(unlimited.getFileList()).toHaveLength(1);
        expect(unlimitedErrors).toHaveLength(0);
    });
});

describe('无障碍', () => {
    it('拖拽区可通过键盘触发，状态与进度可被读屏识别', async () => {
        const el = mount({ drag: '', action: '/api/upload' });
        await tick();

        const drag = el.shadowRoot.querySelector('.upload__drag') as HTMLElement;
        expect(drag.getAttribute('role')).toBe('button');
        expect(drag.getAttribute('tabindex')).toBe('0');
        expect(drag.getAttribute('aria-disabled')).toBe('false');

        const input = el.shadowRoot.querySelector('input[type="file"]') as HTMLInputElement;
        const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
        drag.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
        expect(clickSpy).toHaveBeenCalledTimes(1);

        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();
        MockXHR.last().emitUploadProgress(30, 100);
        await tick();

        const progressbar = el.shadowRoot.querySelector('[role="progressbar"]') as HTMLElement;
        expect(progressbar.getAttribute('aria-valuenow')).toBe('30');
        expect(progressbar.getAttribute('aria-valuetext')).toBe('30%');

        const status = el.shadowRoot.querySelector('.upload__list-status') as HTMLElement;
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');

        const remove = el.shadowRoot.querySelector('.upload__list-remove') as HTMLElement;
        expect(remove.getAttribute('role')).toBe('button');
        expect(remove.getAttribute('aria-label')).toBe('移除 a.txt');
    });

    it('禁用时拖拽区与按钮不可聚焦', async () => {
        const el = mount({ drag: '', disabled: '' });
        await tick();

        const drag = el.shadowRoot.querySelector('.upload__drag') as HTMLElement;
        expect(drag.getAttribute('tabindex')).toBe('-1');
        expect(drag.getAttribute('aria-disabled')).toBe('true');

        const buttonEl = mount({ disabled: '' });
        await tick();
        const button = buttonEl.shadowRoot.querySelector('.upload__button') as HTMLElement;
        expect(button.getAttribute('tabindex')).toBe('-1');
        expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    it('禁用时不渲染移除按钮，直接调用 handleRemove 也不会删除文件', async () => {
        const el = mount({
            disabled: '',
            'file-list': JSON.stringify([{ uid: '1', name: 'a.txt', status: 'done' }]),
        });
        await tick();

        expect(el.shadowRoot.querySelector('.upload__list-remove')).toBeNull();

        const file = el.getFileList()[0];
        el.handleRemove(file);
        await tick();
        expect(el.getFileList()).toHaveLength(1);
    });

    it('禁用时 dragover / drop / handleFiles 均不会触发上传', async () => {
        const el = mount({ drag: '', disabled: '', action: '/api/upload' });
        await tick();

        const drag = el.shadowRoot.querySelector('.upload__drag') as HTMLElement;
        const dragover = new Event('dragover', { bubbles: true, composed: true, cancelable: true });
        drag.dispatchEvent(dragover);
        expect(dragover.defaultPrevented).toBe(false);
        expect(el.$data.isDragging).toBe(false);

        const file = new File(['a'], 'a.txt');
        const drop = new Event('drop', { bubbles: true, composed: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
        drag.dispatchEvent(drop);
        await tick();

        expect(MockXHR.instances).toHaveLength(0);
        expect(el.getFileList()).toHaveLength(0);

        // 命令式入口同样受 disabled 守卫
        el.handleFiles([file]);
        await tick();
        expect(el.getFileList()).toHaveLength(0);
    });
});
