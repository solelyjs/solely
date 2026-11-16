import '../../src/components/index';
import { Modal } from '../../src/components/commands/modal/index';
import { Drawer } from '../../src/components/commands/drawer/index';
import { Popconfirm } from '../../src/components/commands/popconfirm/index';

const byId = id => document.getElementById(id);
const out = (id, text) => {
    const node = byId(id);
    if (node) node.textContent = text;
};
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const logs = {};
// 浮层区操作多，保留更长历史，避免嵌套 / Esc / 滚动锁的关键记录被后续操作挤掉
const LOG_LIMITS = { 'overlay-log': 40 };
const pushLog = (id, message) => {
    if (!logs[id]) logs[id] = [];
    logs[id].unshift(`[${stamp()}] ${message}`);
    out(id, logs[id].slice(0, LOG_LIMITS[id] || 12).join('\n'));
};

/* ---------- 勾选状态持久化 ---------- */
// 2026-11-15 自动化验收通过的条目：真实浏览器跑过 A/B/C/D 区探针、文档站关键回归与命令行产物校验。
// 首次打开（localStorage 无记录）时默认勾上；用户手动改过的项以本地记录为准，不被默认值覆盖。
const AUTO_PASSED = new Set([
    't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10',
    't12', 't19', 't21', 't24',
]);
const checklistKey = key => `solely-acceptance-${key}`;

document.querySelectorAll('#checklist input[type="checkbox"]').forEach(box => {
    const key = checklistKey(box.dataset.key);
    const saved = localStorage.getItem(key);
    box.checked = saved === null ? AUTO_PASSED.has(box.dataset.key) : saved === '1';
    box.addEventListener('change', () => localStorage.setItem(key, box.checked ? '1' : '0'));
});

// 一键回到本轮自动验收结果（覆盖此前手动改写过的勾选）
byId('btn-reset-checklist')?.addEventListener('click', () => {
    document.querySelectorAll('#checklist input[type="checkbox"]').forEach(box => {
        box.checked = AUTO_PASSED.has(box.dataset.key);
        localStorage.setItem(checklistKey(box.dataset.key), box.checked ? '1' : '0');
    });
});

/* ---------- A · 布尔语义矩阵 ---------- */
const BOOL_CASES = [
    { id: 'b-none', write: '不写 attribute', expected: false },
    { id: 'b-bare', write: 'disabled（裸）', expected: true },
    { id: 'b-empty', write: 'disabled=""', expected: true },
    { id: 'b-true', write: 'disabled="true"', expected: true },
    { id: 'b-false', write: 'disabled="false"（反转）', expected: false },
    { id: 'b-zero', write: 'disabled="0"', expected: false },
    { id: 'b-upper', write: 'disabled="FALSE"', expected: false },
    { id: 'b-space', write: 'disabled=" FALSE "', expected: false },
    { id: 'p-empty', write: 'property: el.disabled = ""（点按钮后）', expected: true },
    { id: 'a-empty', write: 'attribute: setAttribute("disabled","")（点按钮后）', expected: true },
];
let probesActivated = false;

function refreshBoolMatrix() {
    const tbody = byId('bool-tbody');
    tbody.textContent = '';
    for (const item of BOOL_CASES) {
        const el = byId(item.id);
        const value = el ? el.disabled : undefined;
        const attr = el && el.hasAttribute('disabled') ? JSON.stringify(el.getAttribute('disabled')) : '(无)';
        const pending = !probesActivated && (item.id === 'p-empty' || item.id === 'a-empty');
        const expected = pending ? null : item.expected;
        const verdict = expected === null ? '— 待执行' : value === expected ? '✅' : '❌';
        const tr = document.createElement('tr');
        for (const text of [item.id, item.write, String(value), attr, String(expected), verdict]) {
            const td = document.createElement('td');
            td.textContent = text;
            if (text === '✅') td.className = 'ok';
            if (text === '❌') td.className = 'bad';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    out(
        'bool-extra',
        [
            '默认开启属性 / size 归一（读回真实 property）',
            `empty     show-icon="false"  → showIcon  = ${byId('b-showicon')?.showIcon}   (期望 false)`,
            `progress  show-info="false"  → showInfo  = ${byId('b-showinfo')?.showInfo}   (期望 false)`,
            `table     local-sort="false" → localSort = ${byId('b-localsort')?.localSort} (期望 false)`,
            `select    size="middle"      → size      = ${byId('b-size')?.size}           (期望 medium)`,
        ].join('\n'),
    );
}

byId('btn-p-empty').addEventListener('click', () => {
    byId('p-empty').disabled = '';
    probesActivated = true;
    refreshBoolMatrix();
    pushLog('bool-log', 'property 路径 el.disabled = "" 已执行，看矩阵 p-empty 行');
});
byId('btn-a-empty').addEventListener('click', () => {
    byId('a-empty').setAttribute('disabled', '');
    probesActivated = true;
    refreshBoolMatrix();
    pushLog('bool-log', 'attribute 路径 setAttribute 已执行，看矩阵 a-empty 行');
});
byId('btn-bool-clear').addEventListener('click', () => {
    byId('p-empty').removeAttribute('disabled');
    byId('a-empty').removeAttribute('disabled');
    probesActivated = false;
    refreshBoolMatrix();
    pushLog('bool-log', '两个探针已清除，矩阵恢复「待执行」');
});

/* ---------- A · property → attribute 镜像 ---------- */
function showMirror(label) {
    const el = byId('mirror-probe');
    const hit = document.querySelectorAll("solely-input[name='mirrored']").length;
    out(
        'mirror-out',
        [
            label,
            `el.name                    = ${String(el.name)}`,
            `getAttribute('name')       = ${JSON.stringify(el.getAttribute('name'))}`,
            `CSS [name='mirrored'] 命中 = ${hit}（>0 时输入框出现绿色描边）`,
            `outline-color              = ${getComputedStyle(el).outlineColor}`,
        ].join('\n'),
    );
}
byId('btn-prop').addEventListener('click', () => {
    byId('mirror-probe').name = 'mirrored';
    showMirror('property 路径：el.name = "mirrored"');
});
byId('btn-attr').addEventListener('click', () => {
    byId('mirror-probe').setAttribute('name', 'mirrored');
    showMirror('attribute 路径：setAttribute("name", "mirrored")');
});
byId('btn-mirror-reset').addEventListener('click', () => {
    byId('mirror-probe').removeAttribute('name');
    showMirror('已清除 name attribute');
});

/* ---------- B · 原生表单 ---------- */
const form = byId('native-form');
form.addEventListener('submit', event => {
    event.preventDefault();
    const entries =
        Array.from(new FormData(form).entries())
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(', ') || '(空)';
    const sw = form.querySelector('solely-switch');
    pushLog(
        'form-out',
        `submit（已 preventDefault）checkValidity=${form.checkValidity()}；FormData: ${entries}` +
            `；switch.checked=${sw?.checked}（对照 FormData 里有无 notify）`,
    );
});
form.addEventListener('reset', () => {
    setTimeout(() => pushLog('form-out', 'reset 已触发，看下方 change 日志的 detail.source 是否为 "reset"'), 0);
});
form.addEventListener('change', event => {
    const target = event.target;
    const detail = event.detail ?? null;
    pushLog('form-out', `change <${target.tagName.toLowerCase()}> detail=${JSON.stringify(detail)}`);
});
byId('btn-form-check').addEventListener('click', () => {
    pushLog('form-out', `form.checkValidity() = ${form.checkValidity()}`);
});

function refreshFieldset() {
    const fs = byId('probe-fieldset');
    const input = byId('fs-input');
    const checkbox = byId('fs-checkbox');
    // aria-disabled / tabindex 都写在 shadow 内的承载元素上（ariaTarget），不是宿主
    const nativeInput = input.shadowRoot ? input.shadowRoot.querySelector('input') : null;
    const checkboxEl = checkbox.shadowRoot ? checkbox.shadowRoot.querySelector('.checkbox') : null;
    out(
        'fieldset-out',
        [
            `fieldset.disabled                    = ${fs.disabled}`,
            `input.disabled（作者态）             = ${input.disabled}  ← 级联不改写，保持 false`,
            `input.isEffectivelyDisabled()        = ${input.isEffectivelyDisabled?.()}`,
            `input 内原生 input aria-disabled     = ${nativeInput?.getAttribute('aria-disabled') ?? '(无)'}`,
            `input 内原生 input tabindex         = ${nativeInput ? (nativeInput.getAttribute('tabindex') ?? '(未设置)') : '(未渲染)'}`,
            `checkbox.isEffectivelyDisabled()     = ${checkbox.isEffectivelyDisabled?.()}`,
            `checkbox 内 .checkbox aria-disabled = ${checkboxEl?.getAttribute('aria-disabled') ?? '(无)'}`,
        ].join('\n'),
    );
}
byId('btn-toggle-fieldset').addEventListener('click', () => {
    const fs = byId('probe-fieldset');
    fs.disabled = !fs.disabled;
    // formDisabledCallback 由平台回调触发，稍等一拍再读，保证拿到刷新后的 ARIA / tabindex；
    // 同时把本次快照写进日志，切回 false 后也能回看 true 时的读数。
    setTimeout(() => {
        refreshFieldset();
        const input = byId('fs-input');
        const checkbox = byId('fs-checkbox');
        const nativeInput = input.shadowRoot ? input.shadowRoot.querySelector('input') : null;
        pushLog(
            'form-out',
            `fieldset.disabled → ${fs.disabled}；input 有效禁用=${input.isEffectivelyDisabled?.()}；` +
                `aria-disabled=${nativeInput?.getAttribute('aria-disabled') ?? '(无)'}；` +
                `tabindex=${nativeInput ? (nativeInput.getAttribute('tabindex') ?? '(未设置)') : '(未渲染)'}；` +
                `checkbox 有效禁用=${checkbox.isEffectivelyDisabled?.()}`,
        );
    }, 50);
});

/* ---------- C · 浮层基座 ---------- */
const olog = message => pushLog('overlay-log', message);
const overlaySnapshot = label => {
    const inertCount = document.querySelectorAll('[inert]').length;
    olog(
        `${label}｜body.overflow=${document.body.style.overflow || '(未设置)'}；` +
            `补偿 paddingRight(内联)=${document.body.style.paddingRight || '(未设置)'}；` +
            `computed=${getComputedStyle(document.body).paddingRight}（含页面自身 24px）；` +
            `[inert]=${inertCount}；scrollY=${Math.round(window.scrollY)}`,
    );
};

function openNested() {
    const scrollBefore = Math.round(window.scrollY);
    const content = document.createElement('div');
    const hint = document.createElement('p');
    hint.textContent = '第一层 Modal（content 为 HTMLElement）。点下面按钮继续打开 Drawer。';
    const drawerBtn = document.createElement('button');
    drawerBtn.className = 'native';
    drawerBtn.textContent = '在 Modal 内打开 Drawer';
    drawerBtn.addEventListener('click', () => {
        const drawerContent = document.createElement('div');
        const popBtn = document.createElement('button');
        popBtn.className = 'native';
        popBtn.textContent = '在 Drawer 内打开 Popconfirm';
        popBtn.addEventListener('click', () => {
            Popconfirm.show(popBtn, {
                title: '第三层 Popconfirm',
                description: '按 Esc 应只关最上层，背景仍不可点。',
                onConfirm: () => olog('Popconfirm 确认'),
                onCancel: () => olog('Popconfirm 取消'),
            });
            olog('Popconfirm 已打开（第三层）');
        });
        drawerContent.appendChild(popBtn);
        Drawer.open({
            title: '第二层 Drawer',
            content: drawerContent,
            placement: 'right',
            // Drawer 默认 cloneElement:true，cloneNode 不会复制 addEventListener；
            // 显式关掉才能保留第三层按钮的点击监听器
            cloneElement: false,
            onClose: () => olog('Drawer onClose'),
        });
        olog('Drawer 已打开（第二层）');
        overlaySnapshot('Drawer 打开后');
    });
    content.append(hint, drawerBtn);
    Modal.open({
        title: '第一层 Modal',
        content,
        maskClosable: true,
        onConfirm: () => olog('Modal onConfirm'),
        onCancel: () => olog('Modal onCancel'),
        onClose: () =>
            olog(`Modal onClose｜关闭后 scrollY=${Math.round(window.scrollY)}（打开前 ${scrollBefore}；应一致）`),
    });
    olog('Modal 已打开（第一层）；依次按 Esc 观察关闭顺序');
    overlaySnapshot('Modal 打开后');
}

byId('btn-open-nested').addEventListener('click', openNested);
byId('btn-open-nomask').addEventListener('click', () => {
    Modal.open({
        title: 'maskClosable:false',
        content: '点遮罩不应关闭；点确定时 onConfirm 返回 false，弹窗应保持打开。',
        maskClosable: false,
        onConfirm: () => {
            olog('onConfirm 返回 false → 期望保持打开');
            setTimeout(() => {
                const alive = document.querySelectorAll('.solely-modal-wrap').length;
                olog(`返回 false 后 300ms：DOM 中 Modal 数=${alive}（>0 表示保持打开生效）`);
            }, 300);
            return false;
        },
        onCancel: () => olog('no-mask Modal onCancel（取消 / X 关闭路径）'),
        onClose: () => olog('no-mask Modal onClose（所有关闭路径统一触发）'),
    });
    olog('已打开 maskClosable:false 的 Modal');
});
byId('btn-mask-probe').addEventListener('click', () => {
    const probe = () => {
        const mask = document.querySelector('.solely-modal-mask');
        const before = document.querySelectorAll('.solely-modal-wrap').length;
        if (!mask || before === 0) {
            olog('遮罩探测：仍未找到 Modal（可能刚被关闭）');
            return;
        }
        mask.click();
        setTimeout(() => {
            const alive = document.querySelectorAll('.solely-modal-wrap').length;
            olog(`模拟点遮罩后：DOM 中 Modal 数=${alive}（打开前 ${before}；>0 表示 maskClosable:false 生效）`);
        }, 200);
    };
    if (document.querySelectorAll('.solely-modal-wrap').length === 0) {
        olog('遮罩探测：当前无 Modal，自动打开一个 maskClosable:false 的');
        byId('btn-open-nomask').click();
        setTimeout(probe, 250);
    } else {
        probe();
    }
});
byId('btn-follow-probe').addEventListener('click', event => {
    Popconfirm.show(event.currentTarget, {
        title: '滚动跟随探针',
        description: '锚点在普通文档流中（非 fixed）。滚动页面，气泡应跟着按钮移动。',
        onConfirm: () => olog('跟随探针确认'),
        onCancel: () => olog('跟随探针取消'),
    });
    olog('已弹出滚动跟随探针；现在滚动页面，观察气泡是否跟随按钮');
});
byId('btn-open-confirm').addEventListener('click', () => {
    Modal.confirm({
        title: '确认操作',
        content: 'Modal.confirm 默认点遮罩不关闭。',
        onConfirm: () => olog('confirm 确定'),
        onCancel: () => olog('confirm 取消'),
    });
    olog('已打开 Modal.confirm（遮罩不关）');
});
byId('btn-open-reject').addEventListener('click', event => {
    Popconfirm.show(event.currentTarget, {
        title: '异步确认（reject）',
        description: '确认后 800ms reject，期望按钮 loading 后保持打开并显示失败信息。',
        onConfirm: async () => {
            olog('异步确认开始：期望按钮进入 loading');
            await new Promise(resolve => setTimeout(resolve, 800));
            olog('异步 reject 已抛出：期望气泡保持打开并显示失败信息');
            setTimeout(() => {
                const alive = document.querySelectorAll('.solely-popconfirm').length;
                olog(`reject 后 300ms：DOM 中 Popconfirm 数=${alive}（>0 表示保持打开生效）`);
            }, 300);
            throw new Error('模拟失败');
        },
    });
    olog('已打开异步 reject 的 Popconfirm');
});

const CORNERS = { tl: '左上', tr: '右上', bl: '左下', br: '右下' };
Object.entries(CORNERS).forEach(([key, label]) => {
    const trigger = byId(`btn-corner-${key}`);
    const target = byId(`corner-${key}`);
    const show = () => {
        Popconfirm.show(target, {
            title: `${label}贴边 Popconfirm`,
            description: '观察 flip / shift，滚动页面看是否跟随或被裁剪。',
            onConfirm: () => olog(`${label} Popconfirm 确认`),
            onCancel: () => olog(`${label} Popconfirm 取消`),
        });
        olog(`${label}贴边 Popconfirm 已打开`);
    };
    trigger.addEventListener('click', show);
    target.addEventListener('click', show);
});

// 浮层基座在 document 的 capture 阶段处理 Esc 并 stopPropagation，
// window 的冒泡监听收不到；这里同样用 capture，才能记录每次按键。
document.addEventListener(
    'keydown',
    event => {
        if (event.key !== 'Escape') return;
        const layers = document.querySelectorAll(
            '.solely-modal-wrap, .solely-drawer-wrap, .solely-popconfirm'
        ).length;
        olog(`按下 Esc｜此刻浮层数=${layers}（逐次应减 1，只关最上层）`);
    },
    true,
);

function updateOverlayState() {
    const panel = byId('overlay-state');
    panel.style.whiteSpace = 'pre-line';
    const computed = getComputedStyle(document.body);
    const inertCount = document.querySelectorAll('[inert]').length;
    const layers = [];
    Array.from(document.body.children).forEach(el => {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' && style.zIndex !== 'auto' && Number(style.zIndex) > 0) {
            layers.push(`${el.tagName.toLowerCase()}#${el.id || '-'} z=${style.zIndex}`);
        }
    });
    panel.textContent = [
        '浮层实时状态（每 300ms 刷新）',
        `body.overflow      = ${document.body.style.overflow || '(未设置)'}`,
        `html.overflow      = ${document.documentElement.style.overflow || '(未设置)'}`,
        `body.paddingRight  = ${computed.paddingRight}  ← 滚动条宽度补偿`,
        `[inert] 元素数     = ${inertCount}`,
        `可见固定浮层       = ${layers.length ? layers.join(' / ') : '无'}`,
        `页面滚动位置       = ${Math.round(window.scrollY)}px`,
    ].join('\n');
}
setInterval(updateOverlayState, 300);

/* ---------- 长内容 ---------- */
const paragraphs = byId('long-paragraphs');
for (let i = 1; i <= 60; i += 1) {
    const p = document.createElement('p');
    p.textContent = `${i}. 占位段落：用于制造纵向滚动条，测试浮层滚动锁与关闭后的位置还原。`;
    paragraphs.appendChild(p);
}

/* ---------- 初始化 ---------- */
const localSortTable = byId('b-localsort');
if (localSortTable && typeof localSortTable.setColumns === 'function') {
    localSortTable.setColumns([{ title: '列 A', dataIndex: 'a' }]);
    localSortTable.setDataSource([{ a: '1' }, { a: '2' }]);
}
refreshBoolMatrix();
refreshFieldset();
updateOverlayState();
showMirror('初始状态（尚未执行镜像）');
