import { BaseElement, CustomElement, IS_DEV, Router, createRouter, routerReady, sanitizeSvg } from '../../src/index.ts';
import template from './template.html?raw';

/* ============================================================
 * 子组件：分别验证数组 reflect、自定义 setter、dataChangeEvent
 * ============================================================ */

@CustomElement({
    tagName: 'reflect-array-demo',
    template: `<div class="child">items: <code>{{ $data.items.join(',') }}</code> ｜ attribute: <code>{{ this.attrText() }}</code></div>`,
    props: [{ name: 'items', type: 'array', reflect: true }],
})
class ReflectArrayDemo extends BaseElement<{ items: number[] }> {
    constructor() {
        // 用构造函数初始化，避免对象/数组 default 在实例间共享同一引用
        super({ items: [1, 2, 3] });
    }

    attrText(): string {
        return this.getAttribute('items') ?? '(无)';
    }
}

@CustomElement({
    tagName: 'setter-demo',
    template: `<div class="child">title: <code>{{ $data.title }}</code> ｜ setter 调用: <code>{{ $data.calls }}</code></div>`,
    props: [{ name: 'title' }],
})
class SetterDemo extends BaseElement<{ title: string; calls: number }> {
    constructor() {
        super({ title: 'init', calls: 0 });
    }

    get title(): string {
        return this.$data.title;
    }

    set title(value: string) {
        this.$data.calls++;
        this.$data.title = String(value).toUpperCase();
    }
}

const eventTemplate = `<div class="child">dataChange 次数：<code>{{ this.eventCount }}</code> ｜ n：<code>{{ $data.n }}</code> <button onclick="this.bump()">n + 1</button></div>`;

class EventDemoBase extends BaseElement<{ n: number }> {
    /** 非响应式字段：避免在 dataChange 监听里改 $data 造成自触发循环 */
    eventCount = 0;

    constructor() {
        super({ n: 0 });
    }

    mounted(): void {
        this.addEventListener('dataChange', () => {
            this.eventCount++;
            this.refresh();
        });
    }

    bump(): void {
        this.$data.n++;
    }
}

@CustomElement({ tagName: 'event-on-demo', template: eventTemplate })
class EventOnDemo extends EventDemoBase {}

@CustomElement({ tagName: 'event-off-demo', template: eventTemplate, dataChangeEvent: false })
class EventOffDemo extends EventDemoBase {}

@CustomElement({
    tagName: 'shared-data-demo',
    template: '<div class="child">n: {{ $data.n }}</div>',
})
export class SharedDataDemo extends BaseElement<{ n: number }> {}

/* ============================================================
 * 主组件：自动跑完 10 个用例，并给出「预期 / 实际 / 结论」
 * ============================================================ */

interface RegressionData {
    title: string;
    picked: string[];
    dangerUrl: string | null;
    safeUrl: string;
    chain: number;
    summary: string;
    rBlank: string;
    rMulti: string;
    rReflect: string;
    rSetter: string;
    rEvent: string;
    rUrl: string;
    rSvg: string;
    rDispose: string;
    rKeepAlive: string;
    rRouterReady: string;
    rShared: string;
    rChain: string;
    rEnv: string;
}

const PENDING = '待运行…';

@CustomElement({
    tagName: 'regression-demo',
    template,
})
export class RegressionDemo extends BaseElement<RegressionData> {
    private running = false;

    constructor() {
        super({
            title: 'Ada',
            picked: ['a', 'c'],
            dangerUrl: null,
            safeUrl: 'https://example.com/docs',
            chain: 1,
            summary: PENDING,
            rBlank: PENDING,
            rMulti: PENDING,
            rReflect: PENDING,
            rSetter: PENDING,
            rEvent: PENDING,
            rUrl: PENDING,
            rSvg: PENDING,
            rDispose: PENDING,
            rKeepAlive: PENDING,
            rRouterReady: PENDING,
            rShared: PENDING,
            rChain: PENDING,
            rEnv: PENDING,
        });
    }

    mounted(): void {
        void this.runAll();
    }

    /** 依次跑完全部用例，汇总通过数 */
    async runAll(): Promise<void> {
        if (this.running) return;
        this.running = true;
        this.$data.summary = '运行中…';

        // 等一帧：多选初始态在 mounted（rAF）中同步
        await new Promise<void>(resolve => {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 16);
        });

        const results: boolean[] = [];
        results.push(this.caseBlank());
        results.push(this.caseMulti());
        results.push(this.caseReflect());
        results.push(this.caseSetter());
        results.push(this.caseEvent());
        results.push(await this.caseUrl());
        results.push(this.caseSvg());
        results.push(this.caseDispose());
        results.push(this.caseKeepAlive());
        results.push(await this.caseRouterReady());
        results.push(this.caseSharedData());
        results.push(await this.caseChain());

        const passed = results.filter(Boolean).length;
        this.$data.summary = `${passed}/${results.length} 通过 ${passed === results.length ? '✅' : '❌'}`;
        this.caseEnv();
        this.running = false;
    }

    private setResult(key: string, ok: boolean, expected: string, actual: string): boolean {
        (this.$data as unknown as Record<string, unknown>)[key] =
            `${ok ? '✅ 通过' : '❌ 失败'}\n预期：${expected}\n实际：${actual}`;
        return ok;
    }

    private tick(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    private caseBlank(): boolean {
        const text = (name: string) =>
            this.querySelector<HTMLElement>(`[data-case="${name}"]`)?.textContent ?? '(缺失)';
        const inline = text('inline-space');
        const interp = text('before-interp');
        const trailing = text('trailing-space');
        const nbsp = text('nbsp');
        const entities = text('entities');

        const ok =
            inline === 'Hello World' &&
            interp === 'Name: Ada' &&
            trailing === 'Hello World' &&
            nbsp === 'A\u00A0B\u00A0C\u00A0D' &&
            entities === '— × “引用”';

        return this.setResult(
            'rBlank',
            ok,
            '"Hello World" / "Name: Ada" / "Hello World" / "A␠B␠C␠D" / "— × “引用”"',
            `${JSON.stringify(inline)} / ${JSON.stringify(interp)} / ${JSON.stringify(trailing)} / ${JSON.stringify(nbsp)} / ${JSON.stringify(entities)}`,
        );
    }

    private caseMulti(): boolean {
        const select = this.querySelector('select');
        const values = select ? Array.from(select.selectedOptions).map(option => option.value) : [];

        return this.setResult('rMulti', values.join(',') === 'a,c', 'a,c', values.join(',') || '(空)');
    }

    private caseReflect(): boolean {
        const demo = this.$refs.reflectDemo as unknown as ReflectArrayDemo;
        demo.$data.items = [4, 5, 6];
        const attribute = demo.getAttribute('items');

        return this.setResult(
            'rReflect',
            attribute === '[4,5,6]',
            'attribute = [4,5,6]',
            `attribute = ${attribute ?? '(无)'}`,
        );
    }

    private caseSetter(): boolean {
        const demo = this.$refs.setterDemo as unknown as SetterDemo;
        const before = demo.$data.calls;

        // 交替取值：attribute 值相同不会触发 attributeChangedCallback，重跑时会误判
        const next = demo.$data.title === 'HELLO' ? 'world' : 'hello';
        demo.setAttribute('title', next);

        const expected = next.toUpperCase();
        const ok = demo.$data.title === expected && demo.$data.calls === before + 1;
        return this.setResult(
            'rSetter',
            ok,
            `title = ${expected}，setter 调用次数 +1`,
            `title = ${demo.$data.title}，调用 ${before} → ${demo.$data.calls}`,
        );
    }

    private caseEvent(): boolean {
        const on = this.$refs.eventOn as unknown as EventOnDemo;
        const off = this.$refs.eventOff as unknown as EventOffDemo;
        const onBefore = on.eventCount;
        const offBefore = off.eventCount;

        on.bump();
        off.bump();

        const ok = on.eventCount === onBefore + 1 && off.eventCount === offBefore;
        return this.setResult(
            'rEvent',
            ok,
            '默认组件 +1，关闭组件 +0',
            `默认 ${onBefore} → ${on.eventCount}，关闭 ${offBefore} → ${off.eventCount}`,
        );
    }

    private async caseUrl(): Promise<boolean> {
        const link = this.$refs.dangerLink as HTMLAnchorElement;

        this.$data.dangerUrl = null;
        await this.tick();
        const before = link.getAttribute('href');

        // 捕获框架的拦截告警，避免控制台刷屏；每次用新值以便观察「告警一次」
        const originalWarn = console.warn;
        const warnings: string[] = [];
        console.warn = (...args: unknown[]) => {
            warnings.push(args.map(String).join(' '));
        };

        const dangerous = `javascript:alert(${Date.now()})`;
        try {
            this.$data.dangerUrl = dangerous;
            await this.tick();
        } finally {
            console.warn = originalWarn;
        }

        const after = link.getAttribute('href');
        const urlWarnings = warnings.filter(line => line.includes('Blocked unsafe URL'));

        // 回显到控制台，方便手动确认告警确实存在（每次运行只输出一次）
        urlWarnings.forEach(line => originalWarn(line));

        this.$data.dangerUrl = null;
        await this.tick();

        const ok = before === null && after === null && urlWarnings.length > 0;
        return this.setResult(
            'rUrl',
            ok,
            'href 保持为空，并输出 1 条拦截告警（见控制台）',
            `设置前 ${before ?? '(无)'}，设置后 ${after ?? '(无)'}，告警 ${urlWarnings.length} 条`,
        );
    }

    private caseSvg(): boolean {
        const input = '<style>@import url(https://evil.example/x.css);</style><path d="M0 0h8v8H0z"/>';
        const output = sanitizeSvg(input);
        const hasImport = output.includes('@import');
        const hasPath = output.includes('<path');

        return this.setResult(
            'rSvg',
            !hasImport && hasPath,
            '不含 @import，保留 <path>',
            `含 @import = ${hasImport}，含 <path> = ${hasPath}`,
        );
    }

    private caseDispose(): boolean {
        const host = this.$refs.disposeHost as HTMLElement;
        host.replaceChildren();

        const element = document.createElement('setter-demo') as unknown as SetterDemo;
        host.appendChild(element);
        element.dispose();

        // 捕获预期的 disposed 错误日志，避免控制台出现红色报错
        const originalError = console.error;
        const captured: string[] = [];
        console.error = (...args: unknown[]) => {
            captured.push(args.map(String).join(' '));
        };

        let threw = false;
        try {
            host.appendChild(element);
        } catch {
            threw = true;
        } finally {
            console.error = originalError;
        }

        const gotLog = captured.some(line => line.includes('has been disposed'));
        const ok = !threw && !element.isConnected && gotLog;

        return this.setResult(
            'rDispose',
            ok,
            '不抛错、被移除，并捕获 1 条 disposed 日志',
            `抛错 = ${threw}，isConnected = ${element.isConnected}，捕获日志 ${captured.length} 条`,
        );
    }

    private caseKeepAlive(): boolean {
        const router = new Router({ routes: [], maxKeepAlive: 1 });
        let evicted = 0;
        let destroyed = 0;

        const first = document.createElement('div');
        (first as HTMLElement & { dispose?: () => void }).dispose = () => {
            evicted++;
        };
        const second = document.createElement('div');
        (second as HTMLElement & { dispose?: () => void }).dispose = () => {
            destroyed++;
        };

        router.setKeepAlive('a', first);
        router.setKeepAlive('b', second); // 超出上限，淘汰 a
        router.destroy(); // 释放 b

        const ok = evicted === 1 && destroyed === 1;
        return this.setResult(
            'rKeepAlive',
            ok,
            '淘汰与 destroy 各 dispose 1 次',
            `淘汰 ${evicted} 次，destroy ${destroyed} 次`,
        );
    }

    private async caseRouterReady(): Promise<boolean> {
        const first = createRouter({ routes: [] });
        first.destroy();

        let resolved = false;
        void routerReady.then(() => {
            resolved = true;
        });

        await new Promise(resolve => setTimeout(resolve, 60));
        const pendingAfterDestroy = !resolved;

        const second = createRouter({ routes: [] });
        await this.tick();
        const resolvedAfterCreate = resolved;
        second.destroy();

        const ok = pendingAfterDestroy && resolvedAfterCreate;
        return this.setResult(
            'rRouterReady',
            ok,
            'destroy 后 pending，新建后 resolved',
            `destroy 后 ${pendingAfterDestroy ? 'pending' : 'resolved'}，新建后 ${
                resolvedAfterCreate ? 'resolved' : 'pending'
            }`,
        );
    }

    /** 手动切换条件链（页面按钮用） */
    setChain(value: number): void {
        this.$data.chain = value;
    }

    private caseSharedData(): boolean {
        const shared = { n: 0 };
        const originalWarn = console.warn;
        const warnings: string[] = [];
        console.warn = (...args: unknown[]) => {
            warnings.push(args.map(String).join(' '));
        };

        let first: HTMLElement | null = null;
        let second: HTMLElement | null = null;
        try {
            first = document.createElement('shared-data-demo');
            second = document.createElement('shared-data-demo');
            (first as unknown as { $data: { n: number } }).$data = shared;
            (second as unknown as { $data: { n: number } }).$data = shared;
        } finally {
            console.warn = originalWarn;
        }

        const sharedWarnings = warnings.filter(line => line.includes('已被其他实例使用'));

        // 回显到控制台，方便手动确认告警确实存在（每次运行只输出一次）
        sharedWarnings.forEach(line => originalWarn(line));

        first?.remove();
        second?.remove();

        return this.setResult(
            'rShared',
            sharedWarnings.length > 0,
            '第二次传入同一对象时输出 1 条告警（见控制台）',
            `告警 ${sharedWarnings.length} 条`,
        );
    }

    private async caseChain(): Promise<boolean> {
        const expected: Array<[number, string]> = [
            [1, '分支 A'],
            [2, '分支 B'],
            [3, '分支 C'],
        ];
        const actual: string[] = [];
        let ok = true;

        for (const [value, text] of expected) {
            this.$data.chain = value;
            await this.tick();
            const rendered = (this.querySelector<HTMLElement>('[data-case="chain"]')?.textContent ?? '').trim();
            actual.push(`${value}→${rendered || '(空)'}`);
            if (rendered !== text) ok = false;
        }

        return this.setResult('rChain', ok, '1→分支 A，2→分支 B，3→分支 C', actual.join('；'));
    }

    private caseEnv(): void {
        this.$data.rEnv = `ℹ️ 当前 IS_DEV = ${IS_DEV}\n（仅信息，不计入通过数）`;
    }
}
