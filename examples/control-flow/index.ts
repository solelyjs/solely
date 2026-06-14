import { BaseElement, CustomElement, watch, watchGetter, computed } from '../../src/index.ts';
import template from './index.html?raw';

interface ControlFlowData {
    // Show
    showVisible: boolean;
    // If
    status: 'loading' | 'success' | 'error';
    // For
    items: string[];
    // Show tabs
    activeTab: 'a' | 'b' | 'c';
    tabBCount: number;
    // KeepAlive tabs
    keepAliveTab: 'x' | 'y';
    // Keepalive + 动态文本
    kaCounter: number;
    kaVisible: boolean;
    // Keepalive + 内部 For
    kaItems: string[];
    kaListVisible: boolean;
    // Keepalive 生命周期
    lcTab: 'home' | 'settings' | 'profile';
    lifecycleLogs: string[];
    // Watch
    watchCount: number;
    watchLogs: string[];
    // Computed
    price: number;
    quantity: number;
    total: number;
}

@CustomElement({
    tagName: 'control-flow-demo',
    template,
    styles: `
        .demo { padding: 20px; font-family: sans-serif; }
        .section { margin: 20px 0; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
        .section h3 { margin: 0 0 8px; color: #333; }
        .desc { color: #888; font-size: 14px; margin: 0 0 12px; }
        .panel { padding: 12px; background: #f5f5f5; border-radius: 6px; margin-top: 8px; }
        .panel.success { background: #e8f5e9; border: 1px solid #a5d6a7; }
        .panel.error { background: #ffebee; border: 1px solid #ef9a9a; }
        .panel.loading { background: #e3f2fd; border: 1px solid #90caf9; }
        .tab-panel { min-height: 120px; }

        .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .btn-group button.active { background: #4caf50; }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: #667eea;
            color: white;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover { background: #5a6fd6; }
        .btn-small { padding: 4px 10px; font-size: 12px; background: #ef5350; }
        .btn-small:hover { background: #e53935; }

        input {
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin: 4px;
            min-width: 200px;
        }
        input[type="number"] { min-width: 80px; }

        .hint { color: #666; font-size: 13px; margin-top: 6px; }

        .list-panel { list-style: none; padding: 0; margin: 8px 0; }
        .list-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: white;
            border-radius: 4px;
            margin-bottom: 6px;
            border: 1px solid #e0e0e0;
        }

        /* Watch */
        .log-panel {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 12px;
            border-radius: 6px;
            margin-top: 8px;
            font-family: monospace;
            font-size: 13px;
        }
        .log-title { color: #9cdcfe; margin: 0 0 8px; font-size: 12px; }
        .log-item { margin: 2px 0; color: #ce9178; }

        /* Computed */
        .highlight { color: #4caf50; font-size: 18px; }
    `,
    shadowDOM: { use: true },
})
export class ControlFlowDemo extends BaseElement<ControlFlowData> {
    constructor() {
        super({
            showVisible: true,
            status: 'loading',
            items: ['第一项', '第二项', '第三项'],
            activeTab: 'a',
            tabBCount: 0,
            keepAliveTab: 'x',
            kaCounter: 0,
            kaVisible: true,
            kaItems: ['列表项 A', '列表项 B'],
            kaListVisible: true,
            lcTab: 'home',
            lifecycleLogs: [],
            watchCount: 0,
            watchLogs: [],
            price: 50,
            quantity: 1,
            total: 50,
        });
    }

    created() {
        // Watch：侦听 watchCount 变化，记录日志
        watch(this.$data, change => {
            if (change.type === 'set' && change.key === 'watchCount') {
                const log = `watchCount: ${change.oldValue} → ${change.newValue}`;
                this.$data.watchLogs = [log, ...this.$data.watchLogs].slice(0, 5);
            }
        });

        // Computed：总价 = 单价 × 数量
        const total = computed([this.$data], () => this.$data.price * this.$data.quantity);

        // 用 watchGetter 同步计算值到 $data.total
        watchGetter(
            [this.$data],
            () => total.get(),
            newVal => {
                this.$data.total = newVal;
            },
        );
    }

    addItem() {
        const next = this.$data.items.length + 1;
        this.$data.items.push(`第 ${next} 项`);
    }

    removeItem(index: number) {
        this.$data.items.splice(index, 1);
    }

    addKaItem() {
        const next = this.$data.kaItems.length + 1;
        this.$data.kaItems.push(`列表项 ${String.fromCharCode(64 + next)}`);
    }

    addLifecycleLog(msg: string) {
        const time = new Date().toLocaleTimeString();
        this.$data.lifecycleLogs = [`[${time}] ${msg}`, ...this.$data.lifecycleLogs].slice(0, 10);
    }
}
