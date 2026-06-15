import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

/* ========== 子组件：prop-display — 接收 :prop 透传 ========== */
interface PropDisplayData {
    message: string;
    count: number;
    active: boolean;
    items: string[];
    info: { name: string; age: number };
}

@CustomElement({
    tagName: 'prop-display',
    template: `
<div class="inner prop-inner">
    <h4>子组件 prop-display</h4>
    <p>message: <strong>{{ $data.message }}</strong></p>
    <p>count: <strong>{{ $data.count }}</strong></p>
    <p>active: <strong>{{ $data.active }}</strong></p>
    <p>items: <strong>{{ this.json($data.items) }}</strong></p>
    <p>info: <strong>{{ this.json($data.info) }}</strong></p>
    <details class="child-controls-wrap">
        <summary>子组件操作</summary>
        <div class="child-controls">
            <button onclick="this.selfChangeMessage()">子改 message</button>
            <button onclick="this.selfChangeCount()">子改 count</button>
            <button onclick="this.selfToggleActive()">子改 active</button>
            <button onclick="this.selfChangeInfo()">子改 info</button>
            <button onclick="this.selfPushItem()">子加 item</button>
        </div>
    </details>
</div>
    `,
    styles,
    props: [
        { name: 'message', type: 'string', default: '(空)' },
        { name: 'count', type: 'number', default: 0 },
        { name: 'active', type: 'boolean', default: false },
        { name: 'items', type: 'array', default: [] },
        { name: 'info', type: 'object', default: {} },
    ],
    shadowDOM: { use: true },
})
export class PropDisplay extends BaseElement<PropDisplayData> {
    constructor() {
        super({
            message: '(空)',
            count: 0,
            active: false,
            items: [],
            info: { name: '', age: 0 },
        });
    }

    json(val: unknown) {
        return JSON.stringify(val);
    }

    /* 子组件自己修改 $data — 观察是否会同步回父组件 */
    selfChangeMessage() {
        this.$data.message = 'child changed at ' + Date.now();
    }

    selfChangeCount() {
        this.$data.count += 10;
    }

    selfToggleActive() {
        this.$data.active = !this.$data.active;
    }

    /* 子组件修改 object prop — 观察是否影响父组件（引用传递） */
    selfChangeInfo() {
        // this.$data.info = { ...this.$data.info, name: 'child-' + Date.now() };
        this.$data.info.name = 'child-' + Date.now();
    }

    /* 子组件修改 array prop — 观察是否影响父组件 */
    selfPushItem() {
        // this.$data.items = [...this.$data.items, 'child-item'];
        this.$data.items.push('child-item');
    }
}

/* ========== 子组件：reflect-child — 测试 reflect 回环 ========== */
interface ReflectChildData {
    value: number;
    label: string;
}

@CustomElement({
    tagName: 'reflect-child',
    template: `
<div class="inner reflect-inner">
    <h4>reflect-child (reflect: true)</h4>
    <p>value: <strong>{{ $data.value }}</strong></p>
    <p>label: <strong>{{ $data.label }}</strong></p>
    <p>attribute: <strong id="attr-display"></strong></p>
    <details class="child-controls-wrap">
        <summary>子组件操作</summary>
        <div class="child-controls">
            <button onclick="this.selfIncrementValue()">子改 value</button>
            <button onclick="this.selfChangeLabel()">子改 label</button>
        </div>
    </details>
</div>
    `,
    styles,
    props: [
        { name: 'value', type: 'number', reflect: true, default: 0 },
        { name: 'label', type: 'string', reflect: true, default: '' },
    ],
    shadowDOM: { use: true },
})
export class ReflectChild extends BaseElement<ReflectChildData> {
    constructor() {
        super({ value: 0, label: '' });
    }

    mounted() {
        this._updateAttrDisplay();
    }

    updated() {
        this._updateAttrDisplay();
    }

    /* 子组件自己修改 reflect prop — 观察 attribute 是否同步 */
    selfIncrementValue() {
        this.$data.value += 100;
    }

    selfChangeLabel() {
        this.$data.label = 'child-' + Date.now();
    }

    private _updateAttrDisplay() {
        const el = this.shadowRoot?.getElementById('attr-display');
        if (el) {
            el.textContent = `value="${this.getAttribute('value')}" label="${this.getAttribute('label')}"`;
        }
    }
}

/* ========== 子组件：reflect-object — 测试 object + reflect（2.1 防御性缺口） ========== */
interface ReflectObjectData {
    config: { a: number; b: number };
}

@CustomElement({
    tagName: 'reflect-object',
    template: `
<div class="inner reflect-obj-inner">
    <h4>reflect-object (object + reflect)</h4>
    <p>config: <strong>{{ this.json($data.config) }}</strong></p>
    <p>attribute: <strong id="attr-obj-display"></strong></p>
    <details class="child-controls-wrap">
        <summary>子组件操作</summary>
        <div class="child-controls">
            <button onclick="this.selfChangeConfig()">子改 config</button>
        </div>
    </details>
</div>
    `,
    styles,
    props: [{ name: 'config', type: 'object', reflect: true, default: {} }],
    shadowDOM: { use: true },
})
export class ReflectObject extends BaseElement<ReflectObjectData> {
    constructor() {
        super({ config: { a: 1, b: 2 } });
    }

    json(val: unknown) {
        return JSON.stringify(val);
    }

    mounted() {
        this._updateDisplay();
    }

    updated() {
        this._updateDisplay();
    }

    /* 子组件修改 object prop — 验证 #reflectingAttrs 防止循环 */
    selfChangeConfig() {
        // 用 spread 重建对象，可能改变 key insertion order
        this.$data.config = { ...this.$data.config, a: this.$data.config.a + 1 };
    }

    private _updateDisplay() {
        const el = this.shadowRoot?.getElementById('attr-obj-display');
        if (el) {
            el.textContent = `config="${this.getAttribute('config')}"`;
        }
    }
}

/* ========== 子组件：attr-change-child — 测试 attributeChanged 生命周期 ========== */
interface AttrChangeChildData {
    value: number;
    changeLog: string;
}

@CustomElement({
    tagName: 'attr-change-child',
    template: `
<div class="inner attr-change-inner">
    <h4>attr-change-child</h4>
    <p>value: <strong>{{ $data.value }}</strong></p>
    <p>changeLog: <strong>{{ $data.changeLog }}</strong></p>
</div>
    `,
    styles,
    props: [{ name: 'value', type: 'number', default: 0 }],
    shadowDOM: { use: true },
})
export class AttrChangeChild extends BaseElement<AttrChangeChildData> {
    constructor() {
        super({ value: 0, changeLog: '(无)' });
    }

    attributeChanged(name: string, oldValue: unknown, newValue: unknown) {
        this.$data.changeLog = `${name}: ${oldValue} → ${newValue}`;
    }
}

/* ========== 子组件：sibling-a / sibling-b — 测试兄弟组件时序 ========== */

@CustomElement({
    tagName: 'sibling-a',
    template: `
<div class="inner sibling-a-inner">
    <h4>Sibling A</h4>
    <p>mounted 时尝试访问 sibling-b: <strong>{{ $data.siblingBFound }}</strong></p>
</div>
    `,
    styles,
    shadowDOM: { use: true },
})
export class SiblingA extends BaseElement<{ siblingBFound: string }> {
    constructor() {
        super({ siblingBFound: '检测中...' });
    }

    mounted() {
        // Solely 使用 DocumentFragment 批量插入，兄弟节点已同时存在于 DOM 中
        const sibling = this.parentElement?.querySelector('sibling-b');
        this.$data.siblingBFound = sibling ? '已找到' : '未找到';
    }
}

@CustomElement({
    tagName: 'sibling-b',
    template: `
<div class="inner sibling-b-inner">
    <h4>Sibling B</h4>
    <p>我已挂载</p>
</div>
    `,
    styles,
    shadowDOM: { use: true },
})
export class SiblingB extends BaseElement<Record<string, unknown>> {
    constructor() {
        super({});
    }
}

/* ========== 子组件：dispose-child — 测试 dispose() 显式销毁 ========== */
interface DisposeChildData {
    status: string;
    count: number;
}

@CustomElement({
    tagName: 'dispose-child',
    template: `
<div class="inner dispose-inner">
    <h4>dispose-child</h4>
    <p>status: <strong>{{ $data.status }}</strong></p>
    <p>count: <strong>{{ $data.count }}</strong></p>
    <div class="child-controls">
        <button onclick="this.selfIncrement()">子改 count</button>
    </div>
</div>
    `,
    styles,
    shadowDOM: { use: true },
})
export class DisposeChild extends BaseElement<DisposeChildData> {
    constructor() {
        super({ status: 'active', count: 0 });
    }

    mounted() {
        this.$data.status = 'mounted';
    }

    unmounted() {
        this.$data.status = 'unmounted';
    }

    selfIncrement() {
        this.$data.count++;
    }
}

/* ========== 主组件：audit-test — 整合所有测试 ========== */
interface AuditTestData {
    // prop 透传测试
    parentMessage: string;
    parentCount: number;
    parentActive: boolean;
    parentItems: string[];

    // reflect 测试
    reflectValue: number;
    reflectLabel: string;

    // array prop 测试
    arrayInput: string;

    // $data 透传测试
    childData: {
        message: string;
        count: number;
    };

    // 对象/数组子属性透传测试
    parentInfo: { name: string; age: number };
    parentTags: string[];

    // attributeChanged 测试
    attrChangeValue: number;

    // dispose 测试
    disposeStatus: string;

    // 日志
    logs: string[];
}

@CustomElement({
    tagName: 'audit-test',
    template,
    styles,
    props: [
        { name: 'parentMessage', type: 'string', default: 'Hello from parent' },
        { name: 'parentCount', type: 'number', default: 42 },
        { name: 'parentActive', type: 'boolean', default: true },
    ],
    shadowDOM: { use: true },
})
export class AuditTest extends BaseElement<AuditTestData> {
    #lastChildRef: DisposeChild | null = null;

    constructor() {
        super({
            parentMessage: 'Hello from parent',
            parentCount: 42,
            parentActive: true,
            parentItems: ['apple', 'banana', 'cherry'],

            reflectValue: 1,
            reflectLabel: 'initial',

            arrayInput: '["a", "b", "c"]',

            childData: {
                message: 'via $data',
                count: 99,
            },

            parentInfo: { name: 'Alice', age: 25 },
            parentTags: ['vue', 'react', 'solely'],

            attrChangeValue: 10,

            disposeStatus: '正常',

            logs: [],
        });
    }

    /* ---- prop 透传测试 ---- */
    changeMessage() {
        this.$data.parentMessage = 'Updated at ' + Date.now();
        this._log('prop', `parentMessage → "${this.$data.parentMessage}"`);
    }

    changeCount() {
        this.$data.parentCount++;
        this._log('prop', `parentCount → ${this.$data.parentCount}`);
    }

    toggleActive() {
        this.$data.parentActive = !this.$data.parentActive;
        this._log('prop', `parentActive → ${this.$data.parentActive}`);
    }

    /* ---- reflect 测试 ---- */
    incrementReflect() {
        this.$data.reflectValue++;
        this._log('reflect', `reflectValue → ${this.$data.reflectValue}`);
    }

    changeReflectLabel() {
        this.$data.reflectLabel = 'updated-' + Date.now();
        this._log('reflect', `reflectLabel → "${this.$data.reflectLabel}"`);
    }

    /* ---- array prop 测试 ---- */
    setValidArray() {
        this.$data.parentItems = ['x', 'y', 'z'];
        this._log('array', `items → ["x", "y", "z"]`);
    }

    setArrayWithQuote() {
        // 测试包含单引号的数组值（通过动态绑定，不经过 JSON 解析）
        this.$data.parentItems = ["it's ok", 'hello'];
        this._log('array', `items → ["it's ok", "hello"]`);
    }

    /* ---- $data 透传测试 ---- */
    changeChildData() {
        this.$data.childData = {
            message: 'updated via $data at ' + Date.now(),
            count: this.$data.childData.count + 1,
        };
        this._log('$data', `childData updated`);
    }

    /* ---- 对象/数组子属性透传测试 ---- */
    changeInfoName() {
        this.$data.parentInfo = { ...this.$data.parentInfo, name: 'Bob' };
        this._log('obj-prop', `parentInfo.name → "${this.$data.parentInfo.name}"`);
    }

    changeInfoAge() {
        this.$data.parentInfo = { ...this.$data.parentInfo, age: this.$data.parentInfo.age + 1 };
        this._log('obj-prop', `parentInfo.age → ${this.$data.parentInfo.age}`);
    }

    addTag() {
        this.$data.parentTags = [...this.$data.parentTags, 'tag-' + Date.now()];
        this._log('arr-prop', `parentTags → ${this.json(this.$data.parentTags)}`);
    }

    removeTag() {
        if (this.$data.parentTags.length > 0) {
            this.$data.parentTags = this.$data.parentTags.slice(0, -1);
            this._log('arr-prop', `parentTags → ${this.json(this.$data.parentTags)}`);
        }
    }

    /* ---- attributeChanged 测试 ---- */
    incrementAttrChange() {
        this.$data.attrChangeValue++;
        this._log('attrChanged', `attrChangeValue → ${this.$data.attrChangeValue}`);
    }

    /* ---- dispose 测试 ---- */
    testDispose() {
        const child = this.shadowRoot?.querySelector('dispose-child') as DisposeChild | null;
        if (child) {
            this.#lastChildRef = child;
            child.dispose();
            this.$data.disposeStatus = '已 dispose（不可 reconnect）';
            this._log('dispose', `dispose-child 已销毁`);
        }
    }

    testDetach() {
        const child = this.shadowRoot?.querySelector('dispose-child') as DisposeChild | null;
        if (child && child.parentElement) {
            this.#lastChildRef = child;
            child.remove();
            this.$data.disposeStatus = '已 detach（可 reconnect）';
            this._log('dispose', `dispose-child 已 detach`);
        }
    }

    testReattach() {
        const container = this.shadowRoot?.querySelector('.dispose-container');
        const child = (this.shadowRoot?.querySelector('dispose-child') as DisposeChild | null) || this.#lastChildRef;
        if (container && child) {
            container.appendChild(child);
            if (!child.isConnected) {
                this.$data.disposeStatus = 'reconnect 失败: 组件已被 dispose，不可重新连接';
                this._log('dispose', `reconnect 失败`);
            } else {
                this.$data.disposeStatus = '已重新 attach';
                this._log('dispose', `dispose-child 已重新 attach`);
            }
        }
    }

    /* ---- 工具 ---- */
    json(val: unknown) {
        return JSON.stringify(val);
    }

    /* ---- 日志 ---- */
    private _log(category: string, msg: string) {
        const time = new Date().toLocaleTimeString();
        this.$data.logs = [`[${time}][${category}] ${msg}`, ...this.$data.logs].slice(0, 20);
    }

    clearLogs() {
        this.$data.logs = [];
    }
}
