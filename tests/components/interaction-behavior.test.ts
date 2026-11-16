/**
 * 组件交互行为补充测试
 *
 * 覆盖范围（函数级）：
 * - steps：getSlotStepClasses / getIconStyle / getSlotStepStatus / handleSlotStepClick /
 *   setCurrent / getCurrent / next / prev / setItems
 * - backtop：updateVisibleClass / getScrollAncestors / schedulePositionUpdate /
 *   setScrollTop / handleClick 内的 scroll 动画步骤
 * - upload：uploadFile / abort / handleDragOver / handleDragLeave / handleDrop /
 *   handleRemoveKeydown / customRequest onError / fileList getter
 *
 * 说明：jsdom 没有真实布局，滚动位置通过直接写 scrollTop 模拟；
 * requestAnimationFrame 在需要的用例中替换为同步回调，保证动画步骤可断言。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import '../../src/components/elements/steps';
import '../../src/components/elements/backtop';
import '../../src/components/elements/upload';

import { mount, mountAndWait, tick, getShadowRoot, recordEvents } from '../helpers';

type AnyElement = any;

/* -------------------------------------------------------------------------- */
/* steps                                                                       */
/* -------------------------------------------------------------------------- */

const STEP_ITEMS = [{ title: '第一步', description: '填写基本信息' }, { title: '第二步' }, { title: '第三步' }];

function stepNodes(el: AnyElement): HTMLElement[] {
    return Array.from(getShadowRoot(el).querySelectorAll('.step')) as HTMLElement[];
}

describe('solely-steps 公开 API 与状态渲染', () => {
    it('next / prev / setCurrent / getCurrent 同步状态与 step 类名', async () => {
        const el = mount<AnyElement>('solely-steps', { items: JSON.stringify(STEP_ITEMS) });
        await tick();

        expect(el.getCurrent()).toBe(0);
        expect(stepNodes(el)).toHaveLength(3);
        expect(stepNodes(el)[0].classList.contains('step--process')).toBe(true);
        expect(stepNodes(el)[0].getAttribute('aria-current')).toBe('step');
        expect(stepNodes(el)[1].classList.contains('step--wait')).toBe(true);

        el.next();
        await tick();
        expect(el.getCurrent()).toBe(1);
        expect(stepNodes(el)[0].classList.contains('step--finish')).toBe(true);
        expect(stepNodes(el)[1].classList.contains('step--process')).toBe(true);
        expect(stepNodes(el)[2].classList.contains('step--wait')).toBe(true);

        // next 不超过最后一项
        el.next();
        el.next();
        await tick();
        expect(el.getCurrent()).toBe(2);
        expect(stepNodes(el)[2].classList.contains('step--process')).toBe(true);

        el.prev();
        await tick();
        expect(el.getCurrent()).toBe(1);

        el.setCurrent(0);
        await tick();
        expect(el.getCurrent()).toBe(0);
        expect(stepNodes(el)[0].classList.contains('step--process')).toBe(true);

        // prev 不小于 0
        el.prev();
        await tick();
        expect(el.getCurrent()).toBe(0);
    });

    it('setItems 替换数据源并回到 items 模式', async () => {
        const el = mount<AnyElement>('solely-steps', { items: JSON.stringify(STEP_ITEMS) });
        await tick();

        el.setItems([{ title: 'A' }, { title: 'B' }]);
        await tick();

        expect(el.getParsedItems()).toHaveLength(2);
        expect(el.$data.useSlot).toBe(false);
        expect(stepNodes(el)).toHaveLength(2);
        const titles = stepNodes(el).map(node => node.querySelector('.step__title')!.textContent!.trim());
        expect(titles).toEqual(['A', 'B']);
        expect(stepNodes(el)[0].classList.contains('step--process')).toBe(true);
    });

    it('getIconStyle / getIconClasses 处理自定义色、预设色与无色', async () => {
        const el = mount<AnyElement>('solely-steps', {
            items: JSON.stringify([
                { title: '自定义', icon: '★', color: '#ff0000' },
                { title: '预设', icon: '✓', color: 'green' },
                { title: '无色', icon: '◆' },
            ]),
        });
        await tick();

        const wrappers = Array.from(getShadowRoot(el).querySelectorAll('.step__icon-wrapper')) as HTMLElement[];
        expect(wrappers).toHaveLength(3);

        // 自定义色：内联样式 + 不追加预设色类
        expect(wrappers[0].classList.contains('step__icon-wrapper--red')).toBe(false);
        expect(wrappers[0].style.color).toBe('rgb(255, 0, 0)');
        expect(wrappers[0].style.backgroundColor).not.toBe('');

        // 预设色：修饰类 + 不产生内联样式
        expect(wrappers[1].classList.contains('step__icon-wrapper--green')).toBe(true);
        expect(wrappers[1].getAttribute('style') || '').toBe('');

        // 未提供 color：getIconStyle 返回空串
        expect(wrappers[2].getAttribute('style') || '').toBe('');
        expect(el.getIconStyle({ title: '无色' })).toBe('');
    });
});

describe('solely-steps 插槽模式', () => {
    it('渲染 slot 内容，点击切换当前项并派发 change', async () => {
        const el = document.createElement('solely-steps') as AnyElement;
        el.setAttribute('clickable', '');
        el.innerHTML = `
            <div data-step="1" data-title="账号" data-description="填写账号">
                <span class="slot-icon">①</span>
            </div>
            <div data-step="2" data-title="完成">②</div>
        `;
        document.body.appendChild(el);
        await tick();

        expect(el.$data.useSlot).toBe(true);
        expect(stepNodes(el)).toHaveLength(2);

        const titles = stepNodes(el).map(node => node.querySelector('.step__title')!.textContent!.trim());
        expect(titles).toEqual(['账号', '完成']);
        expect(stepNodes(el)[0].querySelector('.step__description')!.textContent!.trim()).toBe('填写账号');
        expect(stepNodes(el)[0].querySelector('.step__icon-substitution')!.innerHTML).toContain('slot-icon');
        expect(stepNodes(el)[0].classList.contains('step--process')).toBe(true);
        expect(stepNodes(el)[0].getAttribute('role')).toBe('button');
        expect(stepNodes(el)[0].getAttribute('tabindex')).toBe('0');

        const changes = recordEvents<CustomEvent>(el, ['change']);
        stepNodes(el)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(el.getCurrent()).toBe(1);
        expect(changes.of('change')).toHaveLength(1);
        expect(changes.of('change')[0].detail).toMatchObject({ index: 1, item: { title: '完成' } });
        expect(stepNodes(el)[0].classList.contains('step--finish')).toBe(true);
        expect(stepNodes(el)[0].getAttribute('aria-current')).toBeNull();
        expect(stepNodes(el)[1].classList.contains('step--process')).toBe(true);
        expect(stepNodes(el)[1].getAttribute('aria-current')).toBe('step');

        // 插槽模式下 next / prev 以 slotItems 数量为边界
        el.next();
        await tick();
        expect(el.getCurrent()).toBe(1);
        el.prev();
        await tick();
        expect(el.getCurrent()).toBe(0);
    });

    it('禁用的插槽步骤点击不改变当前项', async () => {
        const el = document.createElement('solely-steps') as AnyElement;
        el.setAttribute('clickable', '');
        el.innerHTML = `
            <div data-step="1" data-title="第一步"></div>
            <div data-step="2" data-title="第二步" disabled></div>
        `;
        document.body.appendChild(el);
        await tick();

        expect(stepNodes(el)[1].classList.contains('step--disabled')).toBe(true);
        expect(stepNodes(el)[1].classList.contains('step--clickable')).toBe(false);
        expect(stepNodes(el)[1].getAttribute('role')).toBe('listitem');
        expect(stepNodes(el)[1].getAttribute('aria-disabled')).toBe('true');

        const changes = recordEvents(el, ['change']);
        stepNodes(el)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        await tick();

        expect(el.getCurrent()).toBe(0);
        expect(changes.of('change')).toHaveLength(0);
        expect(stepNodes(el)[0].classList.contains('step--process')).toBe(true);
    });
});

describe('solely-steps 插槽图标回退与配色（R-09 / R-10）', () => {
    it('未提供图标内容时回退到状态图标或序号，不渲染空圆圈', async () => {
        const el = document.createElement('solely-steps') as AnyElement;
        el.setAttribute('current', '1');
        el.innerHTML = `
            <div data-step="1" data-title="第一步"></div>
            <div data-step="2" data-title="第二步"></div>
            <div data-step="3" data-title="第三步"></div>
        `;
        document.body.appendChild(el);
        await tick();

        const nodes = stepNodes(el);
        // 已完成状态改由线性 SVG 承载，不再是 ✓ 字符
        expect(nodes[0].querySelector('.step__icon-substitution svg.solely-linear-icon')).not.toBeNull();
        expect(nodes[1].querySelector('.step__icon-text')!.textContent!.trim()).toBe('2');
        expect(nodes[2].querySelector('.step__icon-text')!.textContent!.trim()).toBe('3');
        // 没有图标内容时不输出 step--has-icon
        expect(nodes.every(node => !node.classList.contains('step--has-icon'))).toBe(true);
    });

    it('提供图标内容时渲染插槽内容并输出 step--has-icon', async () => {
        const el = document.createElement('solely-steps') as AnyElement;
        el.innerHTML = `
            <div data-step="1" data-title="有图标"><span class="slot-icon">★</span></div>
            <div data-step="2" data-title="无图标"></div>
        `;
        document.body.appendChild(el);
        await tick();

        const nodes = stepNodes(el);
        expect(nodes[0].querySelector('.step__icon-substitution')!.innerHTML).toContain('slot-icon');
        expect(nodes[0].classList.contains('step--has-icon')).toBe(true);
        expect(nodes[1].classList.contains('step--has-icon')).toBe(false);
    });

    it('data-color 与 items 模式的 color 语义一致（预设色与自定义色）', async () => {
        const el = document.createElement('solely-steps') as AnyElement;
        el.innerHTML = `
            <div data-step="1" data-title="预设色" data-color="green"><span>★</span></div>
            <div data-step="2" data-title="自定义色" data-color="#ff0000"><span>★</span></div>
            <div data-step="3" data-title="无图标" data-color="blue"></div>
        `;
        document.body.appendChild(el);
        await tick();

        const wrappers = Array.from(getShadowRoot(el).querySelectorAll('.step__icon-wrapper')) as HTMLElement[];
        expect(wrappers[0].classList.contains('step__icon-wrapper--green')).toBe(true);
        expect(wrappers[1].style.color).toBe('rgb(255, 0, 0)');
        // 与 items 模式一致：没有图标时 color 不生效
        expect(wrappers[2].getAttribute('style') || '').toBe('');
    });

    it('items 模式按实际图标输出 step--has-icon，点状模式不输出', async () => {
        const el = mount<AnyElement>('solely-steps', {
            items: JSON.stringify([{ title: '有图标', icon: '★' }, { title: '无图标' }]),
        });
        await tick();

        const nodes = stepNodes(el);
        expect(nodes[0].classList.contains('step--has-icon')).toBe(true);
        expect(nodes[1].classList.contains('step--has-icon')).toBe(false);

        const dot = mount<AnyElement>('solely-steps', {
            'progress-dot': true,
            items: JSON.stringify([{ title: '有图标', icon: '★' }]),
        });
        await tick();
        expect(stepNodes(dot)[0].classList.contains('step--has-icon')).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* backtop                                                                     */
/* -------------------------------------------------------------------------- */

describe('solely-backtop 滚动与回顶', () => {
    beforeEach(() => {
        document.documentElement.scrollTop = 0;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('document 容器：滚动切换 backtop--visible', async () => {
        const el = await mountAndWait<AnyElement>('solely-backtop', {}, 120);

        expect(el.$data.visible).toBe(false);
        expect(el.classList.contains('backtop--visible')).toBe(false);

        document.documentElement.scrollTop = 500;
        window.dispatchEvent(new Event('scroll'));
        await tick();

        expect(el.$data.visible).toBe(true);
        expect(el.classList.contains('backtop--visible')).toBe(true);

        document.documentElement.scrollTop = 0;
        // 越过 throttle 的 16ms 窗口后再派发
        await tick(20);
        window.dispatchEvent(new Event('scroll'));
        await tick();

        expect(el.$data.visible).toBe(false);
        expect(el.classList.contains('backtop--visible')).toBe(false);
    });

    it('document 容器：点击回顶调用 scrollTo 并派发 backtop-finish', async () => {
        const el = await mountAndWait<AnyElement>('solely-backtop', {}, 120);
        document.documentElement.scrollTop = 600;

        const finish = recordEvents(el, ['backtop-finish']);
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        let now = 1000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            now += 1000;
            callback(0);
            return 1;
        });

        const base = getShadowRoot(el).querySelector('.backtop') as HTMLElement;
        base.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
        expect(document.documentElement.scrollTop).toBe(0);
        expect(finish.of('backtop-finish')).toHaveLength(1);
    });

    it('非 document 容器：定位、祖先检测、显隐与容器回顶', async () => {
        const outer = document.createElement('div');
        outer.style.overflowY = 'scroll';
        const container = document.createElement('div');
        container.style.overflowY = 'auto';
        outer.appendChild(container);
        document.body.appendChild(outer);

        (container as AnyElement).getBoundingClientRect = () => ({ right: 100, bottom: 200 });
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        const el = mount<AnyElement>('solely-backtop', {}, container);
        await tick(120);

        // 初始化定位：fixed + 容器右下角 + 20px 偏移
        expect(el.style.position).toBe('fixed');
        expect(el.style.right).toBe(`${window.innerWidth - 100 + 20}px`);
        expect(el.style.bottom).toBe(`${window.innerHeight - 200 + 20}px`);

        // getScrollAncestors 只收集 overflow-y: auto/scroll 的祖先
        expect(el.getScrollAncestors(container)).toEqual([outer]);
        expect(el.getScrollAncestors(document.body)).toEqual([]);

        // 容器滚动：handleScroll + schedulePositionUpdate
        container.scrollTop = 500;
        container.dispatchEvent(new Event('scroll'));
        await tick();

        expect(el.$data.visible).toBe(true);
        expect(el.classList.contains('backtop--visible')).toBe(true);
        expect(el.style.right).toBe(`${window.innerWidth - 100 + 20}px`);

        // visibilityHeight setter 立即重新判定显隐
        el.visibilityHeight = 600;
        expect(el.visibilityHeight).toBe(600);
        expect(el.classList.contains('backtop--visible')).toBe(false);

        el.visibilityHeight = 100;
        expect(el.classList.contains('backtop--visible')).toBe(true);

        // 容器回顶：setScrollTop 走 container.scrollTop 分支，不调用 window.scrollTo
        const finish = recordEvents(el, ['backtop-finish']);
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        let now = 1000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            now += 1000;
            callback(0);
            return 1;
        });

        const base = getShadowRoot(el).querySelector('.backtop') as HTMLElement;
        base.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

        expect(container.scrollTop).toBe(0);
        expect(scrollTo).not.toHaveBeenCalled();
        expect(finish.of('backtop-finish')).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/* upload                                                                      */
/* -------------------------------------------------------------------------- */

type Listener = (event: any) => void;

/** 可手动驱动的 XHR mock，避免访问真实网络 */
class MockXHR {
    static instances: MockXHR[] = [];

    uploadListeners = new Map<string, Listener[]>();
    listeners = new Map<string, Listener[]>();

    upload = {
        addEventListener: (type: string, listener: Listener) => this.addListener(this.uploadListeners, type, listener),
    };

    method = '';
    url = '';
    status = 0;
    statusText = 'OK';
    responseText = '{}';
    aborted = false;
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

    open(method: string, url: string): void {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(key: string, value: string): void {
        this.headers[key] = value;
    }

    addEventListener(type: string, listener: Listener): void {
        this.addListener(this.listeners, type, listener);
    }

    send(body: FormData): void {
        this.body = body;
    }

    abort(): void {
        this.aborted = true;
    }

    private addListener(map: Map<string, Listener[]>, type: string, listener: Listener): void {
        const list = map.get(type) || [];
        list.push(listener);
        map.set(type, list);
    }

    respond(status = 200, body = '{}'): void {
        this.status = status;
        this.responseText = body;
        (this.listeners.get('load') || []).forEach(listener => listener({ type: 'load' }));
    }
}

const originalXHR = globalThis.XMLHttpRequest;

function createFileList(files: File[]): FileList {
    return {
        ...files,
        item: (index: number) => files[index],
        length: files.length,
    } as unknown as FileList;
}

function selectFiles(el: AnyElement, files: File[]): void {
    const input = getShadowRoot(el).querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: createFileList(files), configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function uploadShadow(el: AnyElement): ShadowRoot {
    return getShadowRoot(el);
}

describe('solely-upload 交互与请求控制', () => {
    beforeEach(() => {
        MockXHR.reset();
        (globalThis as any).XMLHttpRequest = MockXHR;
        (URL as any).createObjectURL = vi.fn(() => 'blob:test/local');
        (URL as any).revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        (globalThis as any).XMLHttpRequest = originalXHR;
        vi.restoreAllMocks();
    });

    it('fileList getter 返回数组并与内部状态一致', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload', { action: '/api/upload' });

        expect(Array.isArray(el.fileList)).toBe(true);
        expect(el.fileList).toHaveLength(0);

        selectFiles(el, [new File(['a'], 'a.txt', { type: 'text/plain' })]);
        await tick();
        MockXHR.last().respond(200);
        await tick();

        expect(Array.isArray(el.fileList)).toBe(true);
        expect(el.fileList).toBe(el.getFileList());
        expect(el.fileList[0].name).toBe('a.txt');
        expect(el.fileList[0].status).toBe('done');
    });

    it('uploadFile 对已有条目发起请求，abort 取消该请求', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload', { action: '/api/upload' });
        el.fileList = [{ name: 'pending.txt', status: 'waiting' }];
        await tick();

        const [item] = el.fileList;
        const cancel = recordEvents(el, ['cancel']);

        el.uploadFile(item, new File(['x'], 'pending.txt'));

        expect(MockXHR.instances).toHaveLength(1);
        expect(item.status).toBe('uploading');

        el.abort(item.uid);
        await tick();

        expect(MockXHR.last().aborted).toBe(true);
        expect(item.status).toBe('cancelled');
        expect(cancel.of('cancel')).toHaveLength(1);
    });

    it('customRequest 的 onError 回调标记失败并派发 error', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload');
        let options: AnyElement;
        el.customRequest = (requestOptions: AnyElement) => {
            options = requestOptions;
            return { abort: vi.fn() };
        };

        const errors = recordEvents<CustomEvent>(el, ['error']);
        selectFiles(el, [new File(['a'], 'a.txt')]);
        await tick();

        const [item] = el.fileList;
        options.onError(new Error('boom'));
        await tick();

        expect(item.status).toBe('error');
        expect(errors.of('error')).toHaveLength(1);
        expect(errors.of('error')[0].detail).toMatchObject({
            message: '上传失败: boom',
            reason: 'custom-request',
        });
    });

    it('拖拽 dragover / dragleave 切换高亮 class', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload', { drag: '' });
        const drag = uploadShadow(el).querySelector('.upload__drag') as HTMLElement;

        const over = new Event('dragover', { bubbles: true, cancelable: true });
        drag.dispatchEvent(over);
        await tick();

        expect(over.defaultPrevented).toBe(true);
        expect(drag.classList.contains('upload__drag--active')).toBe(true);

        const leave = new Event('dragleave', { bubbles: true, cancelable: true });
        drag.dispatchEvent(leave);
        await tick();

        expect(leave.defaultPrevented).toBe(true);
        expect(drag.classList.contains('upload__drag--active')).toBe(false);
    });

    it('drop 接收文件并加入上传列表', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload', { drag: '', action: '/api/upload' });
        const drag = uploadShadow(el).querySelector('.upload__drag') as HTMLElement;

        // 先进入拖拽态，验证 drop 会同时清除高亮
        drag.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
        await tick();
        expect(drag.classList.contains('upload__drag--active')).toBe(true);

        const change = recordEvents(el, ['change']);
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', {
            value: { files: createFileList([new File(['abc'], 'drop.txt')]) },
            configurable: true,
        });
        drag.dispatchEvent(drop);
        await tick();
        MockXHR.last().respond(200);
        await tick();

        expect(drop.defaultPrevented).toBe(true);
        expect(drag.classList.contains('upload__drag--active')).toBe(false);
        expect(el.fileList).toHaveLength(1);
        expect(el.fileList[0].name).toBe('drop.txt');
        expect(el.fileList[0].status).toBe('done');
        expect(change.of('change')).toHaveLength(1);
    });

    it('移除按钮 Enter 触发移除，Delete 不在源码支持范围', async () => {
        const el = await mountAndWait<AnyElement>('solely-upload', { multiple: '' });
        selectFiles(el, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
        await tick();

        const removeButtons = () =>
            Array.from(uploadShadow(el).querySelectorAll('.upload__list-remove')) as HTMLElement[];
        const events = recordEvents<CustomEvent>(el, ['remove']);

        // 源码 handleRemoveKeydown 只接受 Enter / Space，Delete 应保持无操作
        removeButtons()[0].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, composed: true, cancelable: true }),
        );
        await tick();
        expect(el.fileList).toHaveLength(2);
        expect(events.of('remove')).toHaveLength(0);

        const enter = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        removeButtons()[1].dispatchEvent(enter);
        await tick();

        expect(enter.defaultPrevented).toBe(true);
        expect(el.fileList).toHaveLength(1);
        expect(el.fileList[0].name).toBe('a.txt');
        expect(events.of('remove')).toHaveLength(1);
        expect(events.of('remove')[0].detail.file.name).toBe('b.txt');
    });
});
