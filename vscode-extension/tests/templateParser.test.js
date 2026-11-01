/**
 * 模板解析 / 诊断的回归用例。
 *
 * 每条用例都对应 `audits/vscode-extension-review-2026-11-01.md` 里的一项结论，
 * 用来锁住「误报」与「漏报」两个方向的行为。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installMock, setOpenDocuments, makeDocument } = require('./helpers/vscode');

installMock();

const parser = require('../dist/templateParser.js');
const tsSource = require('../dist/tsSource.js');

/** 每个用例一个独立临时目录，避免缓存与文件互相干扰 */
function makeWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solely-ext-'));
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
