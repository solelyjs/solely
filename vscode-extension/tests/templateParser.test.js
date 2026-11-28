/**
 * 模板解析 / 诊断的回归用例。
 *
 * 每条用例都对应 `audits/vscode-extension-review-2026-11-01.md` 里的一项结论，
 * 用来锁住「误报」与「漏报」两个方向的行为。
 */

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installMock, setOpenDocuments, makeDocument } = require('./helpers/vscode');

installMock();

const parser = require('../dist/templateParser.js');
const tsSource = require('../dist/tsSource.js');
const typeResolver = require('../dist/typeResolver.js');

/** 用例创建的临时目录，跑完统一清理 */
const tempDirs = [];

after(() => {
    for (const dir of tempDirs) {
        try {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        } catch {
            /* 清理失败不影响用例结果 */
        }
    }
    tempDirs.length = 0;
});

/** 每个用例一个独立临时目录，避免缓存与文件互相干扰 */
function makeWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solely-ext-'));
    tempDirs.push(dir);
    return {
        dir,
        write(name, content) {
            const filePath = path.join(dir, name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
            return filePath;
        },
        html(name, content) {
            const filePath = this.write(name, content);
            return makeDocument(filePath, content);
        },
    };
}

/** 组件模板 + 组件 TS 的标准组合 */
function makeComponent(ws, { html, ts, htmlName = 'index.html' }) {
    const tsPath = ws.write('index.ts', ts);
    const document = ws.html(htmlName, html);
    // 让关联缓存与真实文件一致
    assert.ok(fs.existsSync(tsPath));
    return document;
}

function messages(diagnostics) {
    return diagnostics.map(d => d.message);
}

/* ============================================================
 * P0-1 多行 / 泛型方法签名
 * ============================================================ */

test('多行方法签名能被识别，不再误报未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ this.getNodeClasses() }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<Data> {',
            '  getNodeClasses(',
            '    node: TreeNode & { isFiltered?: boolean },',
            '  ): Record<string, boolean> {',
            '    return {};',
            '  }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('泛型方法签名能被识别', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ this.fetchAll() }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<Data> {',
            '  async fetchAll<T>(url: string): Promise<T[]> { return []; }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('签名文本会被规范化（参数跨行也能拿到完整签名）', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  handle(',
        '    a: string,',
        '    b: number,',
        '  ): void {}',
        '}',
    ].join('\n'));

    const signatures = parser.getMethodSignatures(tsPath);
    assert.deepStrictEqual(signatures.map(s => s.signature), ['handle(a: string, b: number): void']);
});

/* ============================================================
 * P0-2 单文件多组件
 * ============================================================ */

test('单文件多组件时，按 template 绑定取到正确的类', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ $data.parentMessage }}</div>',
        ts: [
            "import { BaseElement, CustomElement } from 'solely';",
            "import template from './index.html?raw';",
            '',
            '@CustomElement({ tagName: "child", template: `<i>{{ $data.childOnly }}</i>` })',
            'export class Child extends BaseElement<{ childOnly: string }> {',
            '  constructor() { super({ childOnly: "x" }); }',
            '}',
            '',
            '@CustomElement({ tagName: "parent", template })',
            'export class Parent extends BaseElement<{ parentMessage: string }> {',
            '  constructor() { super({ parentMessage: "hi" }); }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
    // 子组件的属性不应该出现在父组件模板的合法集合里
    assert.deepStrictEqual(parser.extractDataPropsFromTs(
        parser.findCorrespondingTsFile(document.fileName),
        document.fileName,
    ), ['parentMessage']);
});

/* ============================================================
 * P0-3 注释 / <style> / <script> / 正文
 * ============================================================ */

test('注释里的控制流标签不再报未闭合', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>\n  <!-- 旧写法 <If test="$data.x"> 已废弃 -->\n</div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{ x: boolean }> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('注释里未加引号的属性不再告警', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>\n  <!-- <a @click=foo> -->\n</div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('注释里的 this.xxx() 不再报未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>\n  <!-- <button @click="this.oldHandler()">旧</button> -->\n</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('<style> 里的 $data 不再报未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<style>\n.x::after { content: "$data.ghost"; }\n</style>\n<div></div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{ real: string }> {}",
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('<script> 里的比较运算符不会被当成标签', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<script>\n  if (a < b && c > d) {}\n</script>\n<div></div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('正文里出现的 this.xxx() 文案不再报未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<p>调用 this.doThing() 即可</p>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('非 Solely 模板（没有对应 TS）完全不做校验', () => {
    const ws = makeWorkspace();
    const document = ws.html('plain.html', '<p>Hi {{ name }}</p>\n<p>{{}}</p>\n<If test="x">');
    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

/* ============================================================
 * P0-4 super / interface 的花括号解析
 * ============================================================ */

test('super({ a: "}" }) 里的花括号字符串不会截断属性', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() {',
        '    super({',
        "      a: '}',",
        '      b: 1,',
        '      c: { nested: 1 },',
        '    });',
        '  }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'b', 'c']);
});

test('interface 里的嵌套对象类型不会截断后续属性', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'interface NData {',
        '  info: { name: string; age: number };',
        '  other: string;',
        '  list: string[];',
        '}',
        'class X extends BaseElement<NData> {',
        '  constructor() { super({}); }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['info', 'other', 'list']);
});

test('extends BaseElement<{ ... }> 的泛型花括号不会破坏类体定位', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<{ siblingBFound: string }> {',
        '  constructor() { super({ siblingBFound: "" }); }',
        '  helper() {}',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['siblingBFound']);
    assert.deepStrictEqual(parser.getMethodSignatures(tsPath).map(s => s.name), ['helper']);
});

test('单行多键 super({ a: 1, b: 2 }) 的每个键都能识别', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() { super({ value: 0, label: "", count: 1 }); }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['value', 'label', 'count']);
});

test('内联泛型 BaseElement<{ ... }> 的键也参与数据属性提取', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<{',
        '  count: number;',
        '  label: string;',
        '}> {',
        '  constructor() { super(); }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['count', 'label']);
});

test('内联泛型只取第一个类型参数（<Props, Refs>）', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<{ count: number }, { box: HTMLElement }> {',
        '  constructor() { super(); }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['count']);
});

test('内联泛型 + super() 无参时，$data 仍然被校验', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ $data.count }}</div>\n<span>{{ $data.missing }}</span>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{ count: number }> {',
            '  constructor() { super(); }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'missing' 在 super({}) 或 interface 中未定义",
    ]);
});

test('内联泛型也能取到属性类型', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<{ count: number }> {',
        '  constructor() { super(); }',
        '}',
    ].join('\n'));

    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'count'), 'number');
});

test('内联泛型里的箭头函数不会把类吃掉', () => {
    const ws = makeWorkspace();
    const source = [
        'class X extends BaseElement<{ onSave: () => void; n: number }> {',
        '  handle() {}',
        '}',
    ].join('\n');
    const tsPath = ws.write('comp.ts', source);

    // 前提：泛型里的 `>` 不一定闭合泛型（`=>` 也是）
    assert.deepStrictEqual(tsSource.listClasses(tsSource.maskTypeScript(source)).map(c => c.name), ['X']);
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['onSave', 'n']);
});

test('内联泛型带箭头函数时，模板调用自身方法不报未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<button @click="this.handle()">保存</button>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{',
            '  onSave: () => void;',
            '  n: number;',
            '}> {',
            '  handle() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('泛型参数里的箭头函数不会截断泛型文本', () => {
    const cases = [
        ['Record<string, () => void>', 'Record<string, () => void>'],
        ['{ cb: Map<string, () => void> }', '{ cb: Map<string, () => void> }'],
        ['Map<string, number>', 'Map<string, number>'],
        ['Props, Refs', 'Props, Refs'],
    ];

    for (const [typeArg, expected] of cases) {
        const source = `class X extends BaseElement<${typeArg}> { handle() {} }`;
        const classes = tsSource.listClasses(tsSource.maskTypeScript(source));
        assert.strictEqual(classes.length, 1, `应识别出类：${typeArg}`);
        assert.strictEqual(classes[0].extendsTypeArg, expected);
    }
});

test('嵌套在数组/对象/函数调用里的逗号不会被当成属性分隔符', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() { super({ items: [1, 2, 3], config: { a: 1, b: 2 }, fn: helper(1, 2), ok: true }); }',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['items', 'config', 'fn', 'ok']);
});

test('单行多键 super 的键能取到类型', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'interface Data { value: number; label: string }',
        'class X extends BaseElement<Data> {',
        '  constructor() { super({ value: 0, label: "" }); }',
        '}',
    ].join('\n'));

    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'label'), 'string');
});

test('super() 无参 / super(init) 不会把方法体当成数据对象', () => {
    const ws = makeWorkspace();

    const noArgs = ws.write('a.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() { super(); }',
        '  tick() { if (this.$data.n > 0) { this.$data.n--; } }',
        '}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(noArgs), []);

    const identifierArg = ws.write('b.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() { super(init); }',
        '  tick() { if (this.$data.n > 0) {} }',
        '}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(identifierArg), []);

    // 对照：真正的对象字面量仍然正常
    const withLiteral = ws.write('c.ts', [
        'class X extends BaseElement<Data> {',
        '  constructor() { super({ n: 0 }); }',
        '  tick() { if (this.$data.n > 0) {} }',
        '}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(withLiteral), ['n']);
});

test('super() 无参时不会误报 $data', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ $data.n }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{ n: number }> {',
            '  constructor() { super(); }',
            '  tick() { if (this.$data.n > 0) { this.$data.n--; } }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('返回对象字面量类型的方法，签名不退化', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  getState(): { ok: boolean; n: number } { return { ok: true, n: 1 }; }',
        '  union(): { a: 1 } | null { return null; }',
        '  array(): { a: 1 }[] { return []; }',
        '  plain(): void {}',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.getMethodSignatures(tsPath).map(s => s.signature), [
        'getState(): { ok: boolean; n: number }',
        'union(): { a: 1 } | null',
        'array(): { a: 1 }[]',
        'plain(): void',
    ]);
});

test('对象类型返回值的 getter 也能取到类型', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  get state(): { ok: boolean } { return { ok: true }; }',
        '}',
    ].join('\n'));

    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'state'), '{ ok: boolean }');
});

test('注释里出现 <script> 不会让后续整段文件失去诊断', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: [
            '<div>',
            '  <!-- 注意 <script> 标签要放最后 -->',
            '  <b>{{ this.missing() }}</b>',
            '</div>',
        ].join('\n'),
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "方法 'missing' 在组件及其父类中未定义",
    ]);
});

test('<style> 里出现 <script> 字样同样不会清空后续诊断', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<style>.x::after{content:"<script>"}</style>\n<div>{{ this.missing() }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "方法 'missing' 在组件及其父类中未定义",
    ]);
});

test('属性值里写 <script> 不会被当成未闭合标签', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div title="<script>">{{ this.missing() }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "方法 'missing' 在组件及其父类中未定义",
    ]);
});

test('真正未闭合的 <script> 仍然屏蔽其后内容（与框架 parser 一致）', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div></div>\n<script>\nconst s = "{{ this.missing() }}";',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

/* ============================================================
 * P1-1 框架 / DOM 成员白名单
 * ============================================================ */

test('BaseElement 与 HTMLElement 的公开成员不会被判为未定义', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: [
            '<button @click="this.refresh()">刷新</button>',
            '<button @click="this.emit(\'x\')">发事件</button>',
            '<div>{{ this.getAttribute("id") }}</div>',
        ].join('\n'),
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

/* ============================================================
 * P1-2 / P1-3 关联与缓存
 * ============================================================ */

test('模板放在子目录时也能找到引用它的 TS', () => {
    const ws = makeWorkspace();
    ws.write('templates/tpl.html', '<div></div>');
    const hostPath = ws.write('host.ts', "import tpl from './templates/tpl.html?solely';");

    const found = parser.findCorrespondingTsFile(path.join(ws.dir, 'templates', 'tpl.html'));
    assert.strictEqual(found, hostPath);
});

test('同名模板不会被其它目录的组件误认领', () => {
    const ws = makeWorkspace();
    ws.write('a/index.html', '<div></div>');
    ws.write('b/index.html', '<div></div>');
    ws.write('b/index.ts', "import tpl from './index.html?solely';\nclass B extends BaseElement<{}> {}");

    assert.strictEqual(parser.findCorrespondingTsFile(path.join(ws.dir, 'a', 'index.html')), null);
    assert.strictEqual(
        parser.findCorrespondingTsFile(path.join(ws.dir, 'b', 'index.html')),
        path.join(ws.dir, 'b', 'index.ts'),
    );
});

test('补上 import 后缓存会失效（不需要重启扩展宿主）', () => {
    const ws = makeWorkspace();
    const htmlPath = ws.write('comp.html', '<div></div>');
    const tsPath = ws.write('comp.ts', 'export class A {}');

    assert.strictEqual(parser.findCorrespondingTsFile(htmlPath), null);

    fs.writeFileSync(tsPath, "import tpl from './comp.html?solely';");
    parser.invalidateForChangedFile(tsPath);

    assert.strictEqual(parser.findCorrespondingTsFile(htmlPath), tsPath);
});

test('未保存的 TS 内容也能参与解析', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}");
    const document = ws.html('index.html', '<div>{{ this.freshMethod() }}</div>');

    // 磁盘上还没有 freshMethod
    assert.deepStrictEqual(messages(parser.validateReferences(document)), ['方法 \'freshMethod\' 在组件及其父类中未定义']);

    // 编辑器里已经写了（未保存）
    const openDoc = makeDocument(tsPath, [
        "import tpl from './index.html?solely';",
        'class X extends BaseElement<{}> {',
        '  freshMethod() {}',
        '}',
    ].join('\n'), 'typescript');
    setOpenDocuments([openDoc]);
    try {
        assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
    } finally {
        setOpenDocuments([]);
    }
});

/* ============================================================
 * 模板语法：控制流 / 插值 / 属性
 * ============================================================ */

test('自闭合的 <Show /> 是合法的', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<Show test="$data.x" />',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{ x: boolean }> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('未闭合的 <If> 仍然会报错', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div><If test="$data.x"></div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{ x: boolean }> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), ['未闭合的标签 <if>']);
});

test('<If> 与 <Else> 之间夹了元素会报错（编译器会断链）', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<If test="a"></If>\n<div>gap</div>\n<Else></Else>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), ['<Else> 必须紧跟 <If> 或 <ElseIf> 之后']);
});

test('<If> 与 <Else> 之间只有注释和空白是合法的', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<If test="a"></If>\n<!-- 说明 -->\n<Else></Else>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('未加引号的事件绑定给出警告（框架虽支持，但统一风格更好）', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<button @click=this.realMethod()>go</button>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), [
        '事件绑定 @click 的值建议使用引号包裹',
    ]);
});

test('引号内形如 `a:b=c` 的文本不会被当成属性绑定', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div title="a:b=c" data-x="@y=z">ok</div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), []);
});

test('空插值给出警告', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ }}</div>',
        ts: "import tpl from './index.html?solely';\nclass X extends BaseElement<{}> {}",
    });

    assert.deepStrictEqual(messages(parser.validateTemplate(document)), ['插值表达式内容为空']);
});

test('未加引号的动态属性值同样参与引用校验', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<button @click=this.missing()>go</button>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{}> {',
            '  realMethod() {}',
            '}',
        ].join('\n'),
    });

    // 引用校验（Error）与「建议加引号」（Warning）两条规则作用在同一段文本上，不再互相打架
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "方法 'missing' 在组件及其父类中未定义",
    ]);
    assert.deepStrictEqual(messages(parser.validateTemplate(document)), [
        '事件绑定 @click 的值建议使用引号包裹',
    ]);
});

test('真实不存在的 $data 属性依然会报错', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: '<div>{{ $data.nweTodo }}</div>',
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{ newTodo: string }> {',
            '  constructor() { super({ newTodo: "" }); }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'nweTodo' 在 super({}) 或 interface 中未定义",
    ]);
});

/* ============================================================
 * 真实仓库回归：框架自己的组件库不允许出现任何误报
 * ============================================================ */

test('src/components 下所有模板零诊断', () => {
    const root = path.join(__dirname, '..', '..', 'src', 'components');
    if (!fs.existsSync(root)) return; // 单独使用扩展目录时跳过

    const files = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.html')) files.push(full);
        }
    };
    walk(root);

    assert.ok(files.length > 0);

    const offenders = [];
    for (const file of files) {
        const document = makeDocument(file, fs.readFileSync(file, 'utf-8'));
        const diagnostics = [...parser.validateTemplate(document), ...parser.validateReferences(document)];
        if (diagnostics.length > 0) {
            offenders.push(`${path.relative(root, file)}: ${diagnostics.map(d => d.message).join(' / ')}`);
        }
    }

    assert.deepStrictEqual(offenders, []);
});

/* ============================================================
 * 定义跳转
 * ============================================================ */

function assertPointsAt(location, tsPath, name) {
    assert.ok(location, `应返回跳转位置：${name}`);
    assert.strictEqual(location.uri.fsPath, tsPath);

    const lines = fs.readFileSync(tsPath, 'utf-8').split('\n');
    const { line, character } = location.range.start;
    const rest = (lines[line] ?? '').slice(character);
    assert.ok(
        rest.startsWith(name),
        `第 ${line + 1} 行第 ${character} 列应指向 ${name}，实际为 ${JSON.stringify(lines[line])}`,
    );
}

test('this.method() 跳转到方法定义', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'class X extends BaseElement<Data> {',
        '  realMethod() {}',
        '  other() {}',
        '}',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method',
        name: 'realMethod',
        fullExpression: 'this.realMethod(',
    });
    assertPointsAt(location, tsPath, 'realMethod');
});

test('$data.prop 跳转到 super({}) 里的键', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'class X extends BaseElement<Data> {',
        '  constructor() { super({ alpha: 1, beta: 2 }); }',
        '}',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'dataProp',
        name: 'beta',
        fullExpression: '$data.beta',
    });
    assertPointsAt(location, tsPath, 'beta');
});

test('this.prop 跳转到 getter 定义', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'class X extends BaseElement<Data> {',
        '  get computed(): string { return ""; }',
        '}',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'getter',
        name: 'computed',
        fullExpression: 'this.computed',
    });
    assertPointsAt(location, tsPath, 'computed');
});

test('单文件多组件时，同名方法不会跳到别的类里', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement, CustomElement } from 'solely';",
        "import template from './index.html?solely';",
        '@CustomElement({ tagName: "child", template: `<i></i>` })',
        'class Child extends BaseElement<{ a: number }> {',
        '  shared() {}',
        '}',
        '@CustomElement({ tagName: "parent", template })',
        'export class Parent extends BaseElement<{ b: number }> {',
        '  shared() {}',
        '}',
    ].join('\n'));
    const document = ws.html('index.html', '<div></div>');

    const location = parser.findDefinitionInTsFile(
        tsPath,
        { kind: 'method', name: 'shared', fullExpression: 'this.shared(' },
        document.fileName,
    );
    assertPointsAt(location, tsPath, 'shared');
    // 必须落在 Parent 里那个 shared（第 9 行），而不是 Child 里的（第 5 行）
    assert.strictEqual(location.range.start.line, 8);
});

/* ============================================================
 * 补全
 * ============================================================ */

const { SolelyCompletionProvider } = require('../dist/completionProvider.js');
const { Position } = require('./helpers/vscode');

function completionAt(text, line, character) {
    const ws = makeWorkspace();
    const document = ws.html('index.html', text);
    return new SolelyCompletionProvider().provideCompletionItems(document, new Position(line, character));
}

test('@ 补全的替换范围覆盖已输入的 @，不会插成 @@click', () => {
    const items = completionAt('<button @>', 0, 9);
    assert.ok(items.length > 0);

    const click = items.find(item => item.label === '@click');
    assert.ok(click);
    assert.strictEqual(click.range.start.character, 8);
    assert.strictEqual(click.range.end.character, 9);
    assert.strictEqual(click.insertText.value, '@click="$1"$0');
});

test(': 与 s- 补全的替换范围同样覆盖触发符', () => {
    const bindItems = completionAt('<div :>', 0, 6);
    const bind = bindItems.find(item => item.label === ':class');
    assert.strictEqual(bind.range.start.character, 5);

    const directiveItems = completionAt('<input s->', 0, 9);
    const model = directiveItems.find(item => item.label === 's-model');
    assert.strictEqual(model.range.start.character, 7);
    assert.strictEqual(model.insertText.value, 's-model="$1"$0');
});

test('输入 <div 时不再弹出 If/For/Show', () => {
    assert.deepStrictEqual(completionAt('<div>', 0, 4), []);
});

test('输入 <I 时只给出 If', () => {
    const items = completionAt('<I>', 0, 2);
    assert.deepStrictEqual(items.map(item => item.label), ['If']);
});

/* ============================================================
 * 底层扫描器
 * ============================================================ */

test('掩码后的文本与原文逐字符对齐', () => {
    const source = [
        "const a = 'x';",
        'const b = `tpl {{ y }}`;',
        '// comment',
        '/* block */',
        'const c = /re}/;',
        'class X {}',
    ].join('\n');
    const masked = tsSource.maskTypeScript(source);

    assert.strictEqual(masked.length, source.length);
    assert.strictEqual(masked.split('\n').length, source.split('\n').length);
    assert.ok(!masked.includes('comment'));
    assert.ok(!masked.includes('tpl'));
    assert.ok(masked.includes('class X {}'));
});

/* ============================================================
 * 箭头函数成员
 * ============================================================ */

test('类里的箭头函数字段被当作可调用方法（含 async / 返回类型 / 无分号）', () => {
    const ws = makeWorkspace();
    const document = makeComponent(ws, {
        html: [
            '<button @click="this.handleClick()">点击</button>',
            '<button @click="this.save($data.open)">保存</button>',
            '<button @click="this.toggle($data.open)">切换</button>',
        ].join('\n'),
        ts: [
            "import { BaseElement } from 'solely';",
            "import tpl from './index.html?solely';",
            'class X extends BaseElement<{ open: boolean }> {',
            '  handleClick = () => {',
            '    this.toggle(!this.$data.open);',
            '  }',
            '  save = async (open: boolean): Promise<void> => {',
            '    await this.persist(open);',
            '  }',
            '  toggle = (open: boolean) => { this.$data.open = open; }',
            '  persist(open: boolean): Promise<void> { return Promise.resolve(); }',
            '}',
        ].join('\n'),
    });

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('带类型注解的箭头字段与单参数箭头都能识别', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  handleClick: (e: Event) => void = (e) => this.record(e);',
        '  pick = (): ((e: Event) => void) => (e) => this.record(e);',
        '  record = (e: Event): void => {};',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.getMethodSignatures(tsPath).map(s => s.signature),
        ['handleClick(e: Event): void', 'pick(): ((e: Event) => void)', 'record(e: Event): void'],
    );
});

test('箭头函数字段能跳转到定义', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'class X extends BaseElement<Data> {',
        '  handleClick = (e: Event): void => {};',
        '}',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method',
        name: 'handleClick',
        fullExpression: 'this.handleClick(',
    });
    assertPointsAt(location, tsPath, 'handleClick');
});

/* ============================================================
 * $data 类型：交叉 / 继承 / 导入 / 类型别名
 * ============================================================ */

test('交叉类型 + 导入 interface + extends 的 $data 属性都能解析', () => {
    const ws = makeWorkspace();
    ws.write('shared.ts', 'export interface BaseData { shared: string; }\n');
    ws.write('barrel.ts', "export type { BaseData } from './shared';\n");

    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import type { BaseData } from './shared';",
        "import type { BaseData as ReShared } from './barrel';",
        "import tpl from './index.html?solely';",
        'interface MyData extends BaseData { own: number; }',
        'interface Extra extends ReShared { fromBarrel: boolean; }',
        'class X extends BaseElement<MyData & { extra: string } & Partial<Extra>> {',
        '  handle = () => {};',
        '}',
    ].join('\n'));

    const document = ws.html(
        'index.html',
        '<div>{{ $data.own }}{{ $data.shared }}{{ $data.extra }}{{ $data.fromBarrel }}{{ this.handle() }}</div>',
    );

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
    assert.deepStrictEqual(
        parser.extractDataPropsFromTs(tsPath, document.fileName),
        ['own', 'shared', 'extra', 'fromBarrel'],
    );
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'shared', document.fileName), 'string');
});

test('type 别名的交叉类型也能解析出 $data 属性，且能跳转', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'interface A { alpha: string; }',
        'interface B { beta: number; }',
        'type Data = A & B;',
        'class X extends BaseElement<Data> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['alpha', 'beta']);

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'dataProp',
        name: 'beta',
        fullExpression: '$data.beta',
    });
    assertPointsAt(location, tsPath, 'beta');
});

/* ============================================================
 * 包装类型：Pick / Omit 的键集过滤
 * ============================================================ */

test('Pick / Omit 按第二个类型参数过滤键集', () => {
    const ws = makeWorkspace();
    const header = ['interface S { a: string; b: number; c: boolean }', 'type Keys = "a" | "b";'];

    const cases = [
        ['Pick<S, "a">', ['a']],
        ['Omit<S, "a">', ['b', 'c']],
        ['Pick<S, Keys>', ['a', 'b']],
        ['Pick<Omit<S, "a">, "a" | "b">', ['b']],
        ['Omit<Pick<S, "a" | "b">, "a">', ['b']],
        ['Partial<S>', ['a', 'b', 'c']],
        ['Readonly<Pick<S, "b">>', ['b']],
        // 键集无法静态确定时：Omit 保留全部键（不误报），Pick 不猜
        ['Omit<S, SomeUnknownKeys>', ['a', 'b', 'c']],
        ['Pick<S, SomeUnknownKeys>', []],
    ];

    cases.forEach(([typeArg, expected], index) => {
        const tsPath = ws.write(`case${index}.ts`, [...header, `class C extends BaseElement<${typeArg}> {}`].join('\n'));
        assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), expected, typeArg);
    });
});

test('Pick 排除掉的键在模板里会报未定义（过滤作用于校验而不只是补全）', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface S { a: string; b: number; }',
        'class X extends BaseElement<Pick<S, "a">> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.b }}</div>');

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'b' 在 super({}) 或 interface 中未定义",
    ]);
});

test('union 里重复访问同一类型不会把兄弟分支当成循环丢掉', () => {
    const ws = makeWorkspace();
    const header = ["import { BaseElement } from 'solely';", 'interface S { a: string; b: number; c: boolean }'];

    const union = ws.write('union.ts', [
        ...header,
        "type U = Pick<S, 'a'> | Pick<S, 'b'>;",
        'class X extends BaseElement<U> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(union), ['a', 'b']);

    const mixed = ws.write('mixed.ts', [
        ...header,
        "type U = (Pick<S, 'a'> & { d: string }) | Pick<S, 'c'>;",
        'class X extends BaseElement<U> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(mixed), ['a', 'd', 'c']);

    // 端到端：union 分支的属性不应产生未定义误报
    const tsPath = ws.write('index.ts', [
        ...header,
        "import tpl from './index.html?solely';",
        "type U = Pick<S, 'a'> | Pick<S, 'b'>;",
        'class X extends BaseElement<U> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.b }}</div>');
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a', 'b']);
});

test('readonly / 引号键 / 数字键都算数据键，且能取到类型与跳转', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'interface S {',
        '  readonly a: string;',
        '  b: number;',
        "  'kebab-key': boolean;",
        '  "dq-key": string;',
        '  2: number;',
        '  readonly: string;',
        '}',
        'class X extends BaseElement<S> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'b', 'kebab-key', 'dq-key', '2', 'readonly']);
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'a'), 'string');
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'kebab-key'), 'boolean');
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, '2'), 'number');

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'dataProp',
        name: 'a',
        fullExpression: '$data.a',
    });
    assertPointsAt(location, tsPath, 'a');
});

test('readonly 属性在模板里不产生误报', () => {
    const ws = makeWorkspace();
    ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface S { readonly a: string; b: number; }',
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.b }}</div>');

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('Pick<S, keyof S> 等于全键，Omit<S, keyof S> 为空', () => {
    const ws = makeWorkspace();
    const header = ["import { BaseElement } from 'solely';", 'interface S { a: string; b: number; c: boolean }'];

    const pick = ws.write('pick.ts', [...header, 'class X extends BaseElement<Pick<S, keyof S>> {}'].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(pick), ['a', 'b', 'c']);

    const omit = ws.write('omit.ts', [...header, 'class X extends BaseElement<Omit<S, keyof S>> {}'].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(omit), []);
});

test('Pick 的键集别名可以来自其它文件', () => {
    const ws = makeWorkspace();
    ws.write('keys.ts', 'export type K = "a" | "c";\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import type { K } from './keys';",
        'interface S { a: string; b: number; c: boolean }',
        'class X extends BaseElement<Pick<S, K>> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'c']);
});

test('Pick / Omit 的键别名经 barrel 转出仍能解析', () => {
    const ws = makeWorkspace();
    ws.write(
        'types.ts',
        "export interface Full { a: string; b: number; c: boolean }\nexport type Keys = 'a' | 'b';\n",
    );
    ws.write('barrel.ts', "export { Full, Keys } from './types';\n");
    ws.write('star.ts', "export * from './types';\n");

    const head = ["import { BaseElement } from 'solely';"];

    // 矩阵场景 2：主类型直连、键别名经 barrel
    const pick = ws.write('pick.ts', [
        ...head,
        "import type { Full } from './types';",
        "import type { Keys } from './barrel';",
        'class X extends BaseElement<Pick<Full, Keys>> {}',
    ].join('\n'));
    assert.ok(typeResolver.resolveDataBodies(pick, null).length > 0, '键别名经 barrel 时不应解析为空');
    assert.deepStrictEqual(parser.extractDataPropsFromTs(pick), ['a', 'b']);

    // 矩阵场景 4：主类型与键别名都经 barrel
    const both = ws.write('both.ts', [
        ...head,
        "import type { Full, Keys } from './barrel';",
        'class X extends BaseElement<Pick<Full, Keys>> {}',
    ].join('\n'));
    assert.ok(typeResolver.resolveDataBodies(both, null).length > 0);
    assert.deepStrictEqual(parser.extractDataPropsFromTs(both), ['a', 'b']);

    const omitted = ws.write('omitted.ts', [
        ...head,
        "import type { Full, Keys } from './barrel';",
        'class X extends BaseElement<Omit<Full, Keys>> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(omitted), ['c']);

    // export * 形式的 barrel
    const starred = ws.write('starred.ts', [
        ...head,
        "import type { Full, Keys } from './star';",
        'class X extends BaseElement<Pick<Full, Keys>> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(starred), ['a', 'b']);

    // 经类型别名中间层再传（矩阵场景 5）
    const viaAlias = ws.write('via-alias.ts', [
        ...head,
        "import type { Full } from './types';",
        "import type { Keys } from './barrel';",
        'type U = Pick<Full, Keys>;',
        'class X extends BaseElement<U> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(viaAlias), ['a', 'b']);
});

/* ============================================================
 * interface 声明合并 / 计算属性名
 * ============================================================ */

test('同名 interface 声明合并时键集取并集', () => {
    const ws = makeWorkspace();
    const two = ws.write('two.ts', [
        "import { BaseElement } from 'solely';",
        'interface S { a: string }',
        'interface S { b: number }',
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(two), ['a', 'b']);

    const three = ws.write('three.ts', [
        "import { BaseElement } from 'solely';",
        'interface S { a: string }',
        '// 中间夹注释',
        'interface S { b: number }',
        'interface S { c: boolean }',
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(three), ['a', 'b', 'c']);

    // 每个声明各自的 extends 也要合并进来
    const withBase = ws.write('with-base.ts', [
        "import { BaseElement } from 'solely';",
        'interface Base { root: string }',
        'interface S extends Base { a: string }',
        'interface S { b: number }',
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(withBase), ['a', 'b', 'root']);
});

test('声明合并的 interface 在模板里不产生误报', () => {
    const ws = makeWorkspace();
    ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface S { alpha: string }',
        'interface S { beta: number; gamma: boolean }',
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.alpha }}{{ $data.beta }}{{ $data.gamma }}</div>');

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('计算属性名 [key] 算数据键，索引签名与 symbol 方法不算', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'interface S {',
        '  alpha: string;',
        "  ['beta']: number;",
        '  gamma: boolean;',
        "  ['c-d']: string;",
        '  [key: string]: unknown;',
        '  [Symbol.iterator](): Iterator<string>;',
        '}',
        'class X extends BaseElement<S> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['alpha', 'beta', 'gamma', 'c-d']);
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'beta'), 'number');
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'c-d'), 'string');

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'dataProp',
        name: 'beta',
        fullExpression: '$data.beta',
    });
    assert.ok(location, '计算属性名应能跳转');
    assert.strictEqual(location.range.start.line, 2);
});

test('计算属性名的模板端到端无诊断', () => {
    const ws = makeWorkspace();
    ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "interface S { alpha: string; ['beta']: number; gamma: boolean }",
        'class X extends BaseElement<S> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.alpha }}{{ $data.beta }}{{ $data.gamma }}</div>');

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('深类型链：18 层别名仍能解析，超过上限时优雅降级', () => {
    const ws = makeWorkspace();

    const shallow = ["import { BaseElement } from 'solely';", 'interface Base { root: string }', 'type T0 = Base;'];
    for (let i = 1; i <= 18; i++) shallow.push(`type T${i} = T${i - 1};`);
    shallow.push('class X extends BaseElement<T18> {}');
    assert.deepStrictEqual(parser.extractDataPropsFromTs(ws.write('shallow.ts', shallow.join('\n'))), ['root']);

    // 超过 MAX_TYPE_DEPTH 后停止解析：返回空集（上层因此跳过校验），不抛异常
    const deep = ["import { BaseElement } from 'solely';", 'interface Base { root: string }', 'type D0 = Base;'];
    for (let i = 1; i <= 40; i++) deep.push(`type D${i} = D${i - 1};`);
    deep.push('class X extends BaseElement<D40> {}');
    assert.deepStrictEqual(parser.extractDataPropsFromTs(ws.write('deep.ts', deep.join('\n'))), []);
});

/* ============================================================
 * 注释 / 字符串里的 import、re-export 不算数
 * ============================================================ */

test('注释里的 import 不会被当成类型来源', () => {
    const ws = makeWorkspace();
    ws.write('wrong.ts', 'export interface Cmt { fromWrong: string; }\n');
    ws.write('right.ts', 'export interface Cmt { fromRight: string; }\n');

    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "// import type { Cmt } from './wrong';",
        "import type { Cmt } from './right';",
        'class X extends BaseElement<Cmt> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['fromRight']);
});

test('注释 / 字符串里的 re-export 不算数', () => {
    const ws = makeWorkspace();
    ws.write('wrong.ts', 'export interface R { fromWrong: string; }\n');
    ws.write('right.ts', 'export interface R { fromRight: string; }\n');

    ws.write('barrel.ts', ["// export type { R } from './wrong';", "export type { R } from './right';"].join('\n'));
    ws.write('barrel2.ts', ["const s = \"export * from './wrong'\";", "export * from './right';"].join('\n'));

    const fromNamed = ws.write('named.ts', [
        "import { BaseElement } from 'solely';",
        "import type { R } from './barrel';",
        'class X extends BaseElement<R> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(fromNamed), ['fromRight']);

    const fromStar = ws.write('star.ts', [
        "import { BaseElement } from 'solely';",
        "import type { R } from './barrel2';",
        'class X extends BaseElement<R> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(fromStar), ['fromRight']);
});

test('只有注释掉的 re-export 时解析为空', () => {
    const ws = makeWorkspace();
    ws.write('wrong.ts', 'export interface R { fromWrong: string; }\n');
    ws.write('barrel.ts', "// export type { R } from './wrong';\n");

    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import type { R } from './barrel';",
        'class X extends BaseElement<R> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), []);
});

test('NodeNext 的 ./types.js 写法能映射到 ./types.ts', () => {
    const ws = makeWorkspace();
    ws.write('types.ts', 'export interface JsType { jsField: string; }\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import type { JsType } from './types.js';",
        'class X extends BaseElement<JsType> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['jsField']);
});

/* ============================================================
 * 反向用例：不要把普通属性识别成方法 / 不要误报
 * ============================================================ */

test('普通属性字段不会被当成方法', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  label: string = DEFAULT_LABEL;',
        '  count: number = this.initialCount;',
        '  value: number = compute(1);',
        '  ready = false;',
        '  realMethod(): void {}',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.getMethodSignatures(tsPath).map(s => s.signature), ['realMethod(): void']);
});

test('循环继承不栈溢出、Record 不透出索引键、缺失导入返回空', () => {
    const ws = makeWorkspace();

    const circular = ws.write('circular.ts', [
        "import { BaseElement } from 'solely';",
        'interface A extends B { a: string }',
        'interface B extends A { b: number }',
        'class X extends BaseElement<A> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(circular), ['a', 'b']);

    const record = ws.write('record.ts', [
        "import { BaseElement } from 'solely';",
        'class X extends BaseElement<Record<string, number>> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(record), []);

    const missing = ws.write('missing.ts', [
        "import { BaseElement } from 'solely';",
        "import type { Nope } from './nope';",
        'class X extends BaseElement<Nope> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(missing), []);
});

/* ============================================================
 * 暂存区审查 2026-11-25：别名导入 / 循环 barrel / 箭头字段签名
 * ============================================================ */

test('别名导入的类型按原名解析，别名目标里的键会参与 $data 校验', () => {
    const ws = makeWorkspace();
    ws.write('shared.ts', 'export interface BaseData { sharedField: string; }\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import type { BaseData as Alias } from './shared';",
        'class X extends BaseElement<Alias> {}',
    ].join('\n'));
    const document = ws.html(
        'index.html',
        '<div>{{ $data.sharedField }}{{ $data.notThere }}</div>',
    );

    // 只有别名目标 shared.ts 里才有 sharedField；解析不到原名时这里会是 []
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['sharedField']);
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'sharedField', document.fileName), 'string');
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'notThere' 在 super({}) 或 interface 中未定义",
    ]);
});

test('循环 barrel 的 export * 不会栈溢出，解析安全返回 null', () => {
    const ws = makeWorkspace();
    ws.write('b1/index.ts', "export * from '../b2';\n");
    ws.write('b2/index.ts', "export * from '../b1';\n");

    const moduleResolver = require('../dist/moduleResolver.js');
    assert.doesNotThrow(() => {
        assert.strictEqual(moduleResolver.resolveImportDeclaration(ws.dir, './b1', 'Missing'), null);
    });
});

test('带类型别名注解的箭头字段不把字段类型当成返回类型', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'type Handler = (e: Event) => void;',
        'class X extends BaseElement<Data> {',
        '  onClick: Handler = (e) => {};',
        '  plain: (e: Event) => void = (e) => {};',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.getMethodSignatures(tsPath).map(s => s.signature), [
        'onClick(e): void',
        'plain(e: Event): void',
    ]);
});

/* ============================================================
 * 暂存区审查修复 2026-11-28：别名导入 / barrel 别名 / 联合参数箭头
 * ============================================================ */

test('别名导入的父类能沿继承链解析（不误报继承方法）', () => {
    const ws = makeWorkspace();
    ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        'export class Base extends BaseElement<{}> { parentMethod() {} }',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import { Base as MyBase } from './base';",
        'class X extends MyBase<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ this.parentMethod() }}</div>');

    const ancestors = parser.findAncestorFiles(tsPath, document.fileName);
    assert.strictEqual(ancestors.length, 1);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
    assertPointsAt(parser.findDefinitionInTsFile(tsPath, {
        kind: 'method', name: 'parentMethod', fullExpression: 'this.parentMethod(',
    }, document.fileName), ancestors[0], 'parentMethod');
});

test('默认导入（含别名）能沿继承链解析', () => {
    const ws = makeWorkspace();
    ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        'export default class ActualBase extends BaseElement<{}> { parentMethod() {} }',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import MyBase from './base';",
        'class X extends MyBase<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ this.parentMethod() }}</div>');

    assert.strictEqual(parser.findAncestorFiles(tsPath, document.fileName).length, 1);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('别名导入的属性类型能解析到声明文件（链式调用跳转）', () => {
    const ws = makeWorkspace();
    const routerPath = ws.write('router.ts', 'export class Router { push() {} }\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Router as Nav } from './router';",
        'class X extends BaseElement<{}> { router: Nav = new Nav(); }',
    ].join('\n'));

    assert.strictEqual(parser.findPropertyClassFile(tsPath, 'router'), routerPath);
});

test('行内 type 修饰符的命名导入能解析 $data 类型', () => {
    const ws = makeWorkspace();
    ws.write('types.ts', 'export interface Data { a: string }\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { type Data } from './types';",
        'class X extends BaseElement<Data> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a']);
});

test('barrel 别名再导出能按原名解析（含 Pick 键别名）', () => {
    const ws = makeWorkspace();
    ws.write('types.ts', "export interface Full { a: string; b: number }\nexport type Keys = 'a';\n");
    ws.write('barrel.ts', "export { Full as ReFull, Keys as ReKeys } from './types';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import type { ReFull } from './barrel';",
        'class X extends BaseElement<ReFull> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'b']);

    const pickPath = ws.write('pick.ts', [
        "import { BaseElement } from 'solely';",
        "import type { ReFull, ReKeys } from './barrel';",
        'class X extends BaseElement<Pick<ReFull, ReKeys>> {}',
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(pickPath), ['a']);
});

test('参数含联合类型的函数类型注解仍识别为箭头字段', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        'class X extends BaseElement<Data> {',
        '  handler: (e: string | number) => void = (e) => {};',
        '}',
    ].join('\n'));

    assert.deepStrictEqual(parser.getMethodSignatures(tsPath).map(s => s.signature), [
        'handler(e: string | number): void',
    ]);
});

/* ============================================================
 * 暂存区审查 2026-11-28 第二轮：泛型约束 / 多级继承 / 混合键集
 * ============================================================ */

test('泛型 interface 的对象约束不会被当成 $data 类型体', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'interface S<T extends { id: string }> { a: string; b: number }',
        'class X extends BaseElement<S<string>> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'b']);
});

test('泛型 interface 的对象约束不影响 extends 基类键', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        'interface Base { root: string }',
        'interface S<T extends { id: string }> extends Base { a: string }',
        'class X extends BaseElement<S<string>> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath), ['a', 'root']);
});

test('默认导入的多级继承链每一层都能解析', () => {
    const ws = makeWorkspace();
    ws.write('c.ts', "export default class GrandBase extends BaseElement<{}> { m2() {} }\n");
    ws.write('b.ts', [
        "import Grand from './c';",
        'export default class ActualBase extends Grand { m1() {} }',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import Base from './b';",
        'class X extends Base<{}> {}',
    ].join('\n'));
    ws.html('index.html', '<div></div>');

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['b.ts', 'c.ts'],
    );
});

test('非 index barrel 的别名再导出能被继承链跟随', () => {
    const ws = makeWorkspace();
    ws.write('real.ts', "export class Real extends BaseElement<{}> { m() {} }\n");
    ws.write('barrel.ts', "export { Real as Renamed } from './real';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Renamed } from './barrel';",
        'class X extends Renamed<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['real.ts'],
    );
});

test('index barrel 别名再导出后仍能继续解析下一层继承', () => {
    const ws = makeWorkspace();
    ws.write('base/real.ts', "export class Real extends BaseElement<{}> { grand() {} }\n");
    ws.write('base/index.ts', "export { Real as Renamed } from './real';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Renamed } from './base';",
        'class X extends Renamed<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['real.ts'],
    );
});

test('Pick 的键集混合别名与字面量时取并集', () => {
    const ws = makeWorkspace();
    const header = [
        "import { BaseElement } from 'solely';",
        'interface S { a: string; b: number; c: boolean }',
        "type K = 'a' | 'b';",
    ];

    const aliased = ws.write('aliased.ts', [
        ...header,
        "class X extends BaseElement<Pick<S, K | 'c'>> {}",
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(aliased), ['a', 'b', 'c']);

    const withKeyof = ws.write('keyof.ts', [
        ...header,
        "class X extends BaseElement<Pick<S, keyof S | 'c'>> {}",
    ].join('\n'));
    assert.deepStrictEqual(parser.extractDataPropsFromTs(withKeyof), ['a', 'b', 'c']);
});

/* ============================================================
 * 暂存区审查 2026-11-28 第三轮：属性跳转 / barrel 默认再导出
 * ============================================================ */

test('属性类型经 barrel 别名再导出仍能解析到声明文件', () => {
    const ws = makeWorkspace();
    const routerPath = ws.write('router.ts', 'export class Router { push() {} }\n');
    ws.write('bar.ts', "export { Router as Nav } from './router';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Nav } from './bar';",
        'class X extends BaseElement<{}> { router: Nav = new Nav(); }',
    ].join('\n'));

    assert.strictEqual(parser.findPropertyClassFile(tsPath, 'router'), routerPath);
});

test('export { default } from 的默认再导出能沿继承链解析', () => {
    const ws = makeWorkspace();
    ws.write('d.ts', "export default class ActualBase extends BaseElement<{}> { m() {} }\n");
    ws.write('barrel.ts', "export { default } from './d';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import MyBase from './barrel';",
        'class X extends MyBase<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['d.ts'],
    );
});

test('export { X as default } from 的默认再导出能沿继承链解析', () => {
    const ws = makeWorkspace();
    ws.write('d.ts', "export class ActualBase extends BaseElement<{}> { m() {} }\n");
    ws.write('barrel.ts', "export { ActualBase as default } from './d';\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import MyBase from './barrel';",
        'class X extends MyBase<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['d.ts'],
    );
});

test('无 from 的本地再导出 export { X as Y } 能沿继承链解析', () => {
    const ws = makeWorkspace();
    ws.write('d.ts', "export class LBase extends BaseElement<{}> { m() {} }\n");
    ws.write('barrel.ts', [
        "import { LBase } from './d';",
        'export { LBase as LAlias };',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { LAlias } from './barrel';",
        'class X extends LAlias<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(
        parser.findAncestorFiles(tsPath).map(p => path.basename(p)),
        ['d.ts'],
    );
});

/* ============================================================
 * 暂存区审查 2026-11-28 第四轮：本地再导出的正则边界与本地声明兜底
 * ============================================================ */

test('带 from 的 re-export 目标解析失败时不会回退到同名的无关 import', () => {
    const ws = makeWorkspace();
    const moduleResolver = require('../dist/moduleResolver.js');
    // z.ts 有无关的 class X；y.ts 的 X 是 type（命名 re-export 目标解析失败）
    ws.write('z.ts', "export class X extends BaseElement<{}> { wrong() {} }\n");
    ws.write('y.ts', "export type X = string;\n");
    ws.write('barrel.ts', [
        "import { X } from './z';",
        "export { X } from './y';",
    ].join('\n'));

    assert.strictEqual(moduleResolver.resolveImportDeclaration(ws.dir, './barrel', 'X', false), null);
});

test('barrel 自己声明的类经别名导出也能沿继承链解析', () => {
    const ws = makeWorkspace();
    const barrelPath = ws.write('barrel.ts', [
        "import { BaseElement } from 'solely';",
        'class Foo extends BaseElement<{}> { m() {} }',
        'export { Foo as Alias };',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Alias } from './barrel';",
        'class X extends Alias<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.findAncestorFiles(tsPath), [barrelPath]);
});

/* ============================================================
 * 既有缺口修复 2026-11-28：先声明后导出 / 命名空间继承 / 父类属性链
 * ============================================================ */

test('class Late + export default Late 能沿继承链解析', () => {
    const ws = makeWorkspace();
    const basePath = ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        'class Late extends BaseElement<{}> { parentMethod() {} }',
        'export default Late;',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import Base from './base';",
        'class X extends Base<{}> {}',
    ].join('\n'));
    ws.html('index.html', '<div>{{ this.parentMethod() }}</div>');

    assert.deepStrictEqual(parser.findAncestorFiles(tsPath), [basePath]);
});

test('import * as ns + extends ns.Base 能沿继承链解析', () => {
    const ws = makeWorkspace();
    const basePath = ws.write('x.ts', "export class Base extends BaseElement<{}> { parentMethod() {} }\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import * as ns from './x';",
        'class X extends ns.Base<{}> {}',
    ].join('\n'));
    ws.html('index.html', '<div>{{ this.parentMethod() }}</div>');

    assert.deepStrictEqual(parser.findAncestorFiles(tsPath), [basePath]);
});

test('多个命名空间导入时 extends ns.Base 能选对来源', () => {
    const ws = makeWorkspace();
    ws.write('wrong.ts', "export class Other extends BaseElement<{}> {}\n");
    const rightPath = ws.write('right.ts', "export class Base extends BaseElement<{}> { m() {} }\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import * as w from './wrong';",
        "import * as ns from './right';",
        'class X extends ns.Base<{}> {}',
    ].join('\n'));

    assert.deepStrictEqual(parser.findAncestorFiles(tsPath), [rightPath]);
});

test('属性声明在父类时，this.router.push() 仍能跳转到类型定义', () => {
    const ws = makeWorkspace();
    const routerPath = ws.write('router.ts', 'export class Router { push() {} }\n');
    ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        "import { Router } from './router';",
        'export class Base extends BaseElement<{}> { router: Router = new Router(); }',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Base } from './base';",
        'class X extends Base<{}> {}',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method', name: 'push', fullExpression: 'this.router.push(',
    });
    assert.ok(location, '应能沿继承链找到父类属性的类型定义');
    assert.strictEqual(location.uri.fsPath, routerPath);
});

/* ============================================================
 * 第五轮审查修复：无分号 default 导出 / 多 namespace 同名类
 * ============================================================ */

test('无分号的 export default Late 能沿继承链解析', () => {
    const ws = makeWorkspace();
    const basePath = ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        'class Late extends BaseElement<{}> { parentMethod() {} }',
        'export default Late', // ASI：无分号
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import Base from './base';",
        'class X extends Base<{}> {}',
    ].join('\n'));
    ws.html('index.html', '<div>{{ this.parentMethod() }}</div>');

    assert.deepStrictEqual(parser.findAncestorFiles(tsPath), [basePath]);
});

test('多个 namespace 含同名类时按 extends 别名选对来源', () => {
    const ws = makeWorkspace();
    ws.write('wrong.ts', "export class Base extends BaseElement<{}> { wrongMethod() {} }\n");
    const rightPath = ws.write('right.ts', "export class Base extends BaseElement<{}> { rightMethod() {} }\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import * as w from './wrong';",
        "import * as ns from './right';",
        'class X extends ns.Base<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ this.rightMethod() }}</div>');

    // 必须选中 ns 对应的 right.ts，而不是先出现的 w（wrong.ts）
    assert.deepStrictEqual(parser.findAncestorFiles(tsPath, document.fileName), [rightPath]);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('extends ns.Base 时同名的命名导入不会抢先解析到错误来源', () => {
    const ws = makeWorkspace();
    ws.write('other.ts', "export class Base extends BaseElement<{}> { otherMethod() {} }\n");
    const rightPath = ws.write('right.ts', "export class Base extends BaseElement<{}> { rightMethod() {} }\n");
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import { Base } from './other';",
        "import * as ns from './right';",
        'class X extends ns.Base<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ this.rightMethod() }}</div>');

    // extendsExpr 带 ns. 前缀，必须按别名选 namespace 来源，不能命中命名导入 Base
    assert.deepStrictEqual(parser.findAncestorFiles(tsPath, document.fileName), [rightPath]);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

/* ============================================================
 * 外部审查 P0：interface / type 别名属性的链式跳转回归
 * ============================================================ */

test('属性类型是 interface 时 this.router.push() 仍能跳转到方法定义', () => {
    const ws = makeWorkspace();
    const routerPath = ws.write('router.ts', 'export interface Router {\n  push(): void\n}\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Router } from './router';",
        'class X extends BaseElement<{}> { private router: Router = null as any; }',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method', name: 'push', fullExpression: 'this.router.push(',
    });
    assert.ok(location, 'interface 属性的链式调用应能跳转');
    assert.strictEqual(location.uri.fsPath, routerPath);
    assert.strictEqual(location.range.start.line, 1);
});

test('属性类型是 type 别名时 this.router.push() 仍能跳转', () => {
    const ws = makeWorkspace();
    const routerPath = ws.write('router.ts', 'export type Router = {\n  push(): void\n};\n');
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import { Router } from './router';",
        'class X extends BaseElement<{}> { router: Router = null as any; }',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method', name: 'push', fullExpression: 'this.router.push(',
    });
    assert.ok(location, 'type 别名属性的链式调用应能跳转');
    assert.strictEqual(location.uri.fsPath, routerPath);
});

test('hover 链式调用与 definition 一致：属性声明在父类时也能取到签名', async () => {
    const { SolelyHoverProvider } = require('../dist/hoverProvider.js');
    const ws = makeWorkspace();
    ws.write('router.ts', "export class Router { push(): void {} }\n");
    ws.write('base.ts', [
        "import { BaseElement } from 'solely';",
        "import { Router } from './router';",
        'export class Base extends BaseElement<{}> { router: Router = new Router(); }',
    ].join('\n'));
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import { Base } from './base';",
        'class X extends Base<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<button @click="this.router.push()">go</button>');

    const position = new Position(0, document.getText().indexOf('push') + 1);
    const hover = await new SolelyHoverProvider().provideHover(document, position, {});
    assert.ok(hover, '属性声明在父类时 hover 也应能取到链式方法签名');
    const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
    assert.ok(contents.some(c => c.value.includes('push')));
});

/* ============================================================
 * 暂存区审查 2026-11-28 第三轮：残缺键集 / 跨文件缓存版本
 * ============================================================ */

test('泛型别名未代入类型实参时，$data 校验整体跳过而不是按残缺键集报错', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'type WithId<T> = T & { id: string };',
        'interface Data { count: number }',
        'class X extends BaseElement<WithId<Data>> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.count }}{{ $data.id }}</div>');

    // 残缺键集仍供补全 / 跳转使用，但不能用来判未定义
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['id']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('索引访问类型的键集不可信时，$data 校验整体跳过', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface Props { data: { count: number } }',
        'class X extends BaseElement<Props["data"]> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.count }}</div>');

    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('Record 等动态键类型叠加时，$data 校验整体跳过而不是误报', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'class X extends BaseElement<{ a: string } & Record<string, unknown>> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.zzz }}</div>');

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('被引用的类型文件变化后，缓存按文件版本自动失效', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import type { Data } from './types';",
        'class X extends BaseElement<Data> {}',
    ].join('\n'));
    const typesPath = ws.write('types.ts', 'export interface Data {\n  count: number;\n}\n');
    const document = ws.html('index.html', '<div>{{ $data.count }}</div>');

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['count']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);

    // 模拟 git checkout / 外部生成：types.ts 变了，文件监听（或文档事件）递增缓存代次，
    // 但组件文件本身没变，必须靠逐文件版本校验发现旧下标不可用
    ws.write('types.ts', '// ' + 'x'.repeat(120) + '\nexport interface Data {\n  total: number;\n}\n');
    parser.invalidateForChangedFile(typesPath);

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['total']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'count' 在 super({}) 或 interface 中未定义",
    ]);
});

test('interface 体内的索引签名不会造成 $data 误报', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface Props { [key: string]: unknown; a: string }',
        'class X extends BaseElement<Props> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.zzz }}</div>');

    // 索引签名意味着还有无法枚举的动态键，拿不到的键不能判未定义
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('readonly 修饰的索引签名同样被视为动态键', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface Props { readonly [key: string]: unknown; a: string }',
        'class X extends BaseElement<Props> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.zzz }}</div>');

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('readonly 修饰的计算键仍是具名键，不会被当成动态键', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "interface Props { readonly ['a']: string }",
        'class X extends BaseElement<Props> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.zzz }}</div>');

    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'zzz' 在 super({}) 或 interface 中未定义",
    ]);
});

test('成员名解析三处共用：readonly 计算键的类型查询与跳转不再丢失', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface Props {',
        "  readonly ['a']: string;",
        '  b?: number;',
        '  c?(): void;',
        '}',
        'class X extends BaseElement<Props> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.b }}</div>');

    // 可选方法不是数据键；`?` 后面的具名键仍算
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a', 'b']);
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'a', document.fileName), 'string');
    assert.strictEqual(parser.getPropTypeFromTsFile(tsPath, 'b', document.fileName), 'number');

    const location = parser.findDefinitionInTsFile(
        tsPath,
        { kind: 'dataProp', name: 'a', fullExpression: '$data.a' },
        document.fileName,
    );
    assert.ok(location, 'readonly 计算键应能跳转');
    assert.strictEqual(location.uri.fsPath, tsPath);
    assert.strictEqual(location.range.start.line, 3);
});

test('诊断入口按文件版本重新校验，不依赖磁盘监听事件', async () => {
    const { SolelyDiagnosticProvider } = require('../dist/diagnosticProvider.js');
    const { getDiagnostics, hasDiagnosticEntry } = require('./helpers/vscode');

    const ws = makeWorkspace();
    ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import type { Data } from './types';",
        'class X extends BaseElement<Data> {}',
    ].join('\n'));
    ws.write('types.ts', 'export interface Data {\n  count: number;\n}\n');
    const document = ws.html('index.html', '<div>{{ $data.count }}</div>');
    setOpenDocuments([document]);

    /** 等诊断真正写入，而不是赌一个固定时长 */
    const waitForEntry = async () => {
        const deadline = Date.now() + 2000;
        while (!hasDiagnosticEntry(document.uri) && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.ok(hasDiagnosticEntry(document.uri), '诊断应在防抖后写入');
    };

    // 防抖间隔可注入，测试用 5ms，慢 CI 上也不会因为固定等待而抖动
    const provider = new SolelyDiagnosticProvider(5);

    provider.updateDiagnostics(document);
    await waitForEntry();
    assert.deepStrictEqual(getDiagnostics(document.uri), []);

    // 外部修改 types.ts：没有文档事件，也不在「已打开文档」里
    ws.write('types.ts', '// ' + 'x'.repeat(120) + '\nexport interface Data {\n  total: number;\n}\n');
    provider.clearDiagnostics(document);

    provider.updateDiagnostics(document);
    await waitForEntry();
    assert.deepStrictEqual(
        getDiagnostics(document.uri).map(d => d.message),
        ["数据属性 'count' 在 super({}) 或 interface 中未定义"],
    );

    provider.dispose();
});

test('模块语法紧凑写法（import{X}from\'./x\'）也能解析出继承链与模板关联', () => {
    const ws = makeWorkspace();
    const implPath = ws.write('impl.ts', "import{BaseElement}from'solely';\nexport class Base extends BaseElement<{}> { m() {} }\n");
    ws.write('barrel.ts', "export{Base}from'./impl';\n");
    const tsPath = ws.write('index.ts', [
        "import{BaseElement}from'solely';",
        "import tpl from'./index.html?solely';",
        "import{Base}from'./barrel';",
        'class X extends Base<{}> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ this.m() }}</div>');

    // 继承链：X → {Base} → export{Base} → impl.ts 里的 Base
    assert.deepStrictEqual(parser.findAncestorFiles(tsPath, document.fileName), [implPath]);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), []);
});

test('注释与字符串里的模板导入不算数，不会关联到错误模板', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "// import fake from './fake.html?solely'",
        'const note = "import tpl from \'./fake.html?solely\'";',
        "import { BaseElement } from 'solely';",
        "import tpl from './real.html?solely';",
        'class X extends BaseElement<{}> {}',
    ].join('\n'));
    const realPath = ws.write('real.html', '<div></div>');
    ws.write('fake.html', '<div></div>');

    // 注释在最前面，旧实现会先命中 fake.html
    assert.strictEqual(parser.findCorrespondingHtmlFile(tsPath), realPath);
    assert.strictEqual(parser.findCorrespondingTsFile(path.join(ws.dir, 'real.html')), tsPath);
    assert.strictEqual(parser.findCorrespondingTsFile(path.join(ws.dir, 'fake.html')), null);

    // 只有注释掉的导入时，不应关联到任何模板
    const onlyComment = ws.write('only-comment.ts', [
        "// import tpl from './fake.html?solely'",
        'export const unused = 1;',
    ].join('\n'));
    assert.strictEqual(parser.findCorrespondingHtmlFile(onlyComment), null);
});

test('注释里的包名不会带偏 BaseElement 的兜底查找', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'solely');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'solely', types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), 'export {};\n');
    const basePath = path.join(pkgDir, 'base-element.d.ts');
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');

    const tsPath = ws.write('comp.ts', [
        "// import { BaseElement } from 'ghost-package'",
        "import tpl from './index.html?solely';",
        "import { helper } from 'solely';",
        'class X { run() {} }',
    ].join('\n'));

    // 类本身没有 extends，走 findBaseElementDeclaration 兜底；注释里的包名不能抢先
    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method',
        name: 'emit',
        fullExpression: 'this.emit(',
    });
    assert.ok(location, '应跳过注释里的包名，解析到真正导入的框架包');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('组件还导入了别的包时，BaseElement 兜底查找不受导入顺序影响', () => {
    const ws = makeWorkspace();
    const makePkg = (name, withBaseElement) => {
        const dir = path.join(ws.dir, 'node_modules', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, types: 'index.d.ts' }));
        fs.writeFileSync(path.join(dir, 'index.d.ts'), 'export {};\n');
        return withBaseElement ? path.join(dir, 'base-element.d.ts') : null;
    };
    makePkg('lodash', false);
    const basePath = makePkg('solely', true);
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');

    const tsPath = ws.write('comp.ts', [
        "import { debounce } from 'lodash';",
        "import { helper } from 'solely';",
        "import tpl from './index.html?solely';",
        'class X {}\n',
    ].join('\n'));

    // 只认「第一个非相对导入」时，lodash 会挡住 solely，跳转直接失败
    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method',
        name: 'emit',
        fullExpression: 'this.emit(',
    });
    assert.ok(location, '应跳过没有 BaseElement 的包，继续找下一个');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('npm install 装上带声明的版本后，base-element 负缓存自动失效', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'framework');
    fs.mkdirSync(pkgDir, { recursive: true });
    const pkgJson = path.join(pkgDir, 'package.json');
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'framework', types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), 'export {};\n');

    const tsPath = ws.write('comp.ts', [
        "import tpl from './index.html?solely';",
        "import { helper } from 'framework';",
        'class X { run() {} }',
    ].join('\n'));

    const findEmit = () =>
        parser.findDefinitionInTsFile(tsPath, {
            kind: 'method',
            name: 'emit',
            fullExpression: 'this.emit(',
        });

    // 第一次：包里还没有声明文件，负结果进缓存
    assert.strictEqual(findEmit(), null);

    // 模拟 npm install：补上声明文件并改写 package.json（指纹变化）
    const basePath = path.join(pkgDir, 'base-element.d.ts');
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'framework', types: 'index.d.ts', version: '1.0.1' }));

    const location = findEmit();
    assert.ok(location, '依赖更新后应重新遍历包目录，而不是一直用负缓存');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('只往包根补声明文件（不改 package.json）也会让负缓存失效', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'framework');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'framework', types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), 'export {};\n');

    const tsPath = ws.write('comp.ts', [
        "import tpl from './index.html?solely';",
        "import { helper } from 'framework';",
        'class X { run() {} }',
    ].join('\n'));

    const findEmit = () =>
        parser.findDefinitionInTsFile(tsPath, {
            kind: 'method',
            name: 'emit',
            fullExpression: 'this.emit(',
        });

    assert.strictEqual(findEmit(), null);

    // 构建产物 / 手工拷贝：只补文件，package.json 一个字都不动
    const basePath = path.join(pkgDir, 'base-element.d.ts');
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');

    const location = findEmit();
    assert.ok(location, '目录内容变化应让负缓存失效');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('构件补进已存在的子目录（dist/deep）也会让负缓存失效', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'framework');
    const deepDir = path.join(pkgDir, 'dist', 'deep');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'framework', types: 'dist/index.d.ts' }));
    fs.writeFileSync(path.join(pkgDir, 'dist', 'index.d.ts'), 'export {};\n');
    // dist/deep 在负缓存建立前就存在（且已被遍历过），之后往它里面补文件
    fs.writeFileSync(path.join(deepDir, 'chunk.d.ts'), 'export {};\n');

    const tsPath = ws.write('comp.ts', [
        "import tpl from './index.html?solely';",
        "import { helper } from 'framework';",
        'class X { run() {} }',
    ].join('\n'));

    const findEmit = () =>
        parser.findDefinitionInTsFile(tsPath, {
            kind: 'method',
            name: 'emit',
            fullExpression: 'this.emit(',
        });

    assert.strictEqual(findEmit(), null);

    const basePath = path.join(deepDir, 'base-element.d.ts');
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');

    const location = findEmit();
    assert.ok(location, '已遍历过的子目录内容变化也应让负缓存失效');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('package.json 入口字段变化后，包解析缓存会失效', () => {
    const moduleResolver = require('../dist/moduleResolver.js');
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'fw');
    fs.mkdirSync(pkgDir, { recursive: true });
    const pkgJson = path.join(pkgDir, 'package.json');
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'fw', types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), 'export {};\n');
    fs.writeFileSync(path.join(pkgDir, 'main.d.ts'), 'export {};\n');

    assert.strictEqual(moduleResolver.resolvePackageImport(ws.dir, 'fw'), path.join(pkgDir, 'index.d.ts'));

    // 依赖更新改了 types 字段（写入内容不同，指纹必变）
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'fw', types: 'main.d.ts', version: '2.0.0' }));
    assert.strictEqual(moduleResolver.resolvePackageImport(ws.dir, 'fw'), path.join(pkgDir, 'main.d.ts'));
});

test('mock 的两个诊断集合互不清除同一 uri', () => {
    const { createDiagnosticCollection, getDiagnostics } = require('./helpers/vscode');
    const uri = { toString: () => 'test://mock-same-uri' };
    const a = createDiagnosticCollection();
    const b = createDiagnosticCollection();

    a.set(uri, [{ message: 'a' }]);
    b.set(uri, [{ message: 'b' }]);
    a.dispose();
    assert.deepStrictEqual(
        getDiagnostics(uri).map(d => d.message),
        ['b'],
    );

    b.dispose();
    assert.deepStrictEqual(getDiagnostics(uri), []);
});

test('构建产物补在已存在的 dist/ 里（包根不动）也会让负缓存失效', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'framework');
    const distDir = path.join(pkgDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'framework', types: 'dist/index.d.ts' }));
    fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export {};\n');
    // dist/ 在负缓存建立之前就存在：包根 mtime 不会再变，只有入口目录会变
    fs.writeFileSync(path.join(distDir, 'chunk.d.ts'), 'export {};\n');

    const tsPath = ws.write('comp.ts', [
        "import tpl from './index.html?solely';",
        "import { helper } from 'framework';",
        'class X { run() {} }',
    ].join('\n'));

    const findEmit = () =>
        parser.findDefinitionInTsFile(tsPath, {
            kind: 'method',
            name: 'emit',
            fullExpression: 'this.emit(',
        });

    assert.strictEqual(findEmit(), null);

    // 本地构建把声明写进入口目录，package.json 与包根目录都没动
    const basePath = path.join(distDir, 'base-element.d.ts');
    fs.writeFileSync(basePath, 'export declare class BaseElement {\n  emit(event: string): void;\n}\n');

    const location = findEmit();
    assert.ok(location, '入口目录变化也应让负缓存失效');
    assert.strictEqual(location.uri.fsPath, basePath);
});

test('包根查找以 node_modules 为边界，不会一路走到盘根', () => {
    const ws = makeWorkspace();
    const fwDir = path.join(ws.dir, 'node_modules', 'fw');
    fs.mkdirSync(fwDir, { recursive: true });
    const entry = path.join(fwDir, 'index.d.ts');
    fs.writeFileSync(entry, 'export {};\n');

    // 没有 package.json：必须直接放弃，否则会拿盘根当包目录做深度遍历
    assert.strictEqual(parser.findPackageRoot(entry), null);

    // 有 package.json：正常返回包根
    fs.writeFileSync(path.join(fwDir, 'package.json'), JSON.stringify({ name: 'fw' }));
    assert.strictEqual(parser.findPackageRoot(entry), fwDir);
});

test('包没有 package.json 时不会把 node_modules 外的声明当成框架', () => {
    const ws = makeWorkspace();
    const pkgDir = path.join(ws.dir, 'node_modules', 'fw');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), 'export {};\n');

    // 诱饵：放在 node_modules 外面，旧实现会一路走到盘根再深度遍历，可能把它捡走
    fs.writeFileSync(
        path.join(ws.dir, 'base-element.d.ts'),
        'export declare class BaseElement {\n  emit(event: string): void;\n}\n',
    );

    const tsPath = ws.write('comp.ts', [
        "import tpl from './index.html?solely';",
        "import { helper } from 'fw';",
        'class X { run() {} }',
    ].join('\n'));

    const location = parser.findDefinitionInTsFile(tsPath, {
        kind: 'method',
        name: 'emit',
        fullExpression: 'this.emit(',
    });
    assert.strictEqual(location, null, '没有 package.json 的包应直接放弃，不能扫描 node_modules 之外');
});

test('import type 的说明符不会被当成模板默认导入名', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('comp.ts', [
        "import type { SomeType } from './index.html?solely';",
        "import tpl from './index.html?solely';",
        'interface First { a: string }',
        'interface Second { b: string }',
        'class FirstComponent extends BaseElement<First> {}',
        '@Component({ template: tpl })',
        'class SecondComponent extends BaseElement<Second> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div></div>');

    // 多类文件靠 template 绑定的导入名定位组件；取成 `type` 会退回「第一个类」
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['b']);
});

test('activate 接线磁盘监听：外部修改会触发失效并刷新已打开模板', async () => {
    const { activate } = require('../dist/extension.js');
    const { getLastFileSystemWatcher, getDiagnostics } = require('./helpers/vscode');

    const ws = makeWorkspace();
    ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        "import type { Data } from './types';",
        'class X extends BaseElement<Data> {}',
    ].join('\n'));
    const typesPath = ws.write('types.ts', 'export interface Data {\n  count: number;\n}\n');
    const document = ws.html('index.html', '<div>{{ $data.count }}</div>');
    setOpenDocuments([document]);

    const context = { subscriptions: [] };
    assert.doesNotThrow(() => activate(context));
    assert.ok(context.subscriptions.length >= 10, 'activate 应注册 providers / 监听器 / watcher');

    const watcher = getLastFileSystemWatcher();
    assert.ok(watcher && watcher.handlers.change.length > 0, 'activate 应注册磁盘 change 回调');

    // 外部修改 types.ts：没有文档事件，只能由磁盘监听触发
    ws.write('types.ts', '// ' + 'x'.repeat(120) + '\nexport interface Data {\n  total: number;\n}\n');
    for (const handler of watcher.handlers.change) handler({ fsPath: typesPath });

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        if (getDiagnostics(document.uri).some(d => d.message.includes("'count'"))) break;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(
        getDiagnostics(document.uri).some(d => d.message.includes("'count'")),
        '监听事件后诊断应基于新类型重新计算',
    );
});

test('外部修改让已有组件开始导入模板时，模板关联缓存也会失效', () => {
    const { activate } = require('../dist/extension.js');
    const { getLastFileSystemWatcher } = require('./helpers/vscode');

    const ws = makeWorkspace();
    const document = ws.html('index.html', '<div>{{ $data.a }}</div>');
    const htmlPath = document.fileName;
    const tsPath = ws.write('comp.ts', 'export class C {}\n');
    setOpenDocuments([document]);

    activate({ subscriptions: [] });

    // 首次查找会把「没有组件导入这个模板」缓存下来
    assert.strictEqual(parser.findCorrespondingTsFile(htmlPath), null);

    // 外部（git checkout / codegen）往已有文件里写入了模板导入：
    // 模板关联缓存里那条 null 必须一起清掉，否则 HTML 永远认不到组件
    ws.write('comp.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'export class C extends BaseElement<{ a: string }> {}',
    ].join('\n'));
    for (const handler of getLastFileSystemWatcher().handlers.change) handler({ fsPath: tsPath });

    assert.strictEqual(parser.findCorrespondingTsFile(htmlPath), tsPath);
    setOpenDocuments([]);
});

test('注释与字符串里的「imports from」不会被当成模板导入', () => {
    const ws = makeWorkspace();
    ws.write('fake.html', '<div></div>');
    const realPath = ws.write('real.html', '<div></div>');
    const tsPath = ws.write('comp.ts', [
        "// imports from './fake.html?solely' 只是说明文字",
        'const note = "imports from \'./fake.html?solely\'";',
        "import tpl from './real.html?solely';",
        'class X {}',
    ].join('\n'));

    // `import` 后若不要求词边界，`imports` 也会命中，组件会被错误关联到 fake.html
    assert.strictEqual(parser.findCorrespondingHtmlFile(tsPath), realPath);
});

test('import 语句中间注释里的路径不算模板导入', () => {
    const ws = makeWorkspace();
    ws.write('fake.html', '<div></div>');
    const realPath = ws.write('real.html', '<div></div>');

    // 行尾注释里带路径：说明符在注释里，实际并没有这条导入
    const trailing = ws.write('trailing.ts', [
        "import { BaseElement } // from './fake.html?solely'",
        'class X extends BaseElement<{}> {}',
    ].join('\n'));
    assert.strictEqual(parser.findCorrespondingHtmlFile(trailing), null);

    // 多行导入：注释里的路径出现在说明符之前。这里选择「宁可当没有导入」，
    // 也不把注释里的假路径当真（否则整套诊断会挂到别的模板上）
    const multiline = ws.write('multiline.ts', [
        'import {',
        "    BaseElement, // from './fake.html?solely'",
        "} from './real.html?solely';",
        'class Y extends BaseElement<{}> {}',
    ].join('\n'));
    assert.strictEqual(parser.findCorrespondingHtmlFile(multiline), null);

    // 真实的多行导入仍然识别，不受上面的收紧影响
    const plain = ws.write('plain.ts', [
        'import {',
        '    BaseElement,',
        "} from './real.html?solely';",
        'class Z extends BaseElement<{}> {}',
    ].join('\n'));
    assert.strictEqual(parser.findCorrespondingHtmlFile(plain), realPath);
});

test('符号键不算索引签名：$data 校验仍然生效', () => {
    const ws = makeWorkspace();
    const tsPath = ws.write('index.ts', [
        "import { BaseElement } from 'solely';",
        "import tpl from './index.html?solely';",
        'interface Props { [Symbol.iterator](): Iterator<string>; a: string }',
        'class X extends BaseElement<Props> {}',
    ].join('\n'));
    const document = ws.html('index.html', '<div>{{ $data.a }}{{ $data.zzz }}</div>');

    // 符号键是具名成员，但不代表还有动态键：拼错的 $data 仍要报出来
    assert.deepStrictEqual(parser.extractDataPropsFromTs(tsPath, document.fileName), ['a']);
    assert.deepStrictEqual(messages(parser.validateReferences(document)), [
        "数据属性 'zzz' 在 super({}) 或 interface 中未定义",
    ]);
});
