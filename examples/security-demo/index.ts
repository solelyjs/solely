import { BaseElement, CustomElement } from '../../src';

// ============================================================
// 真实的 Solely 框架安全风险演示
// ============================================================
//
// 框架的工作流程：
// 1. 编译时：模板字符串 → AST → IR → 预编译函数
// 2. 运行时：IR 函数在组件上下文中执行
//
// 真正的安全风险：数据绑定中的 XSS，而不是代码执行

/**
 * 用户资料组件 - 展示 XSS 攻击场景
 *
 * ⚠️ 安全警告：
 * 1. :innerHTML 指令会直接将内容作为 HTML 渲染，存在 XSS 风险！
 *    只有当内容完全可信时才使用，用户输入的内容绝对不要使用此指令！
 * 2. :href 属性绑定用户输入的 URL 时，存在 javascript: 协议攻击风险！
 *    恶意链接如 javascript:alert(document.cookie) 会在点击时执行代码！
 * 3. :src 属性绑定 javascript: 协议在现代浏览器中不会执行（Solely 不支持 IE）
 *    但仍建议对 URL 进行协议白名单过滤（只允许 http://, https://）
 */
@CustomElement({
    tagName: 'user-profile',
    template: `
    <div class="profile">
      <h2>用户资料</h2>
      <div class="info">
        <p><strong>用户名：</strong>{{ $data.username }}</p>
        <p><strong>简介：</strong>{{ $data.bio }}</p>
        <p>
          <strong>网站：</strong><a :href="$data.website">{{ $data.website }}</a>
          <If test="$data.website && $data.website.includes('javascript:')">
            <span class="href-warning" title="此链接包含 javascript: 协议，点击会执行恶意代码！">⚠️ 危险</span>
          </If>
        </p>
      </div>
      <If test="$data.userContent">
        <div class="xss-warning">
          ⚠️ 危险区域：以下内容使用 :innerHTML 渲染，可能包含恶意代码！
        </div>
      </If>
      <div class="user-content" :innerHTML="$data.userContent"></div>
      <If test="$data.avatarUrl && ($data.avatarUrl.includes('javascript:') || $data.avatarUrl.includes('data:'))">
        <div class="xss-warning">
          ℹ️ 说明：:src 绑定包含 javascript: 协议，但在现代浏览器中不会执行（Solely 不支持 IE）
        </div>
      </If>
      <If test="$data.avatarUrl">
        <img class="user-avatar" :src="$data.avatarUrl" alt="用户头像" />
      </If>
    </div>
  `,
    styles: `
    .profile {
      border: 1px solid #ddd;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info p {
      margin: 10px 0;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .xss-warning {
      background: #ffebee;
      color: #c62828;
      padding: 10px 15px;
      border-radius: 4px;
      margin: 15px 0 10px;
      font-weight: bold;
      border-left: 4px solid #f44336;
    }
    .user-content {
      margin-top: 10px;
      padding: 15px;
      border: 2px dashed #f44336;
      min-height: 100px;
      background: #fff8f8;
    }
    .attack-highlight {
      background: #ffebee !important;
      border: 2px solid #f44336 !important;
    }
    .user-avatar {
      margin-top: 10px;
      max-width: 150px;
      max-height: 150px;
      border: 2px dashed #f44336;
      border-radius: 8px;
      padding: 10px;
      background: #fff8f8;
    }
    .href-warning {
      background: #ffebee;
      color: #c62828;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      margin-left: 8px;
      border: 1px solid #f44336;
      cursor: help;
    }
  `,
})
class UserProfile extends BaseElement<{
    username: string;
    bio: string;
    website: string;
    userContent: string;
    avatarUrl: string;
}> {
    constructor() {
        super({
            username: '',
            bio: '',
            website: '',
            userContent: '',
            avatarUrl: '',
        });
    }
}

/**
 * 评论列表组件 - 展示用户输入反射攻击
 */
@CustomElement({
    tagName: 'comment-list',
    template: `
<div class="comments">
    <h3>评论列表 ({{ $data.comments.length }}条)</h3>
    <For each="$data.comments">
        <div class="comment-item" :key="item.id">
            <div class="comment-header">
                <strong>{{ item.author }}</strong>
                <span class="time">{{ item.time }}</span>
            </div>
            <div class="comment-body">{{ item.content }}</div>
        </div>
    </For>
</div>
  `,
    styles: `
    .comments {
      margin: 20px 0;
    }
    .comment-item {
      border-bottom: 1px solid #eee;
      padding: 15px 0;
    }
    .comment-header {
      margin-bottom: 8px;
      color: #666;
    }
    .time {
      margin-left: 10px;
      font-size: 12px;
    }
    .comment-body {
      line-height: 1.6;
    }
  `,
})
class CommentList extends BaseElement<{
    comments: Array<{ id: number; author: string; content: string; time: string }>;
}> {
    constructor() {
        super({
            comments: [],
        });
    }

    addComment(author: string, content: string) {
        this.$data.comments.push({
            id: Date.now(),
            author,
            content,
            time: new Date().toLocaleString(),
        });
    }
}

/**
 * 动态模板组件 - 展示运行时模板注入风险
 */
@CustomElement({
    tagName: 'dynamic-template',
    template: `
    <div class="dynamic-demo">
      <h3>动态模板演示</h3>
      <div class="warning">
        ⚠️ 注意：动态模板应该只用于可信来源
      </div>
      <div class="template-source">
        <strong>模板来源：</strong>{{ $data.source }}
      </div>
      <div class="rendered-content">
        <strong>渲染结果：</strong>
        <div class="content-box">{{ $data.content }}</div>
      </div>
    </div>
  `,
    styles: `
    .dynamic-demo {
      border: 2px solid #ff9800;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      background: #fff8e1;
    }
    .warning {
      color: #e65100;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .template-source {
      margin: 10px 0;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .content-box {
      margin-top: 10px;
      padding: 15px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      min-height: 50px;
    }
  `,
})
class DynamicTemplate extends BaseElement<{
    source: string;
    content: string;
}> {
    constructor() {
        super({
            source: '静态模板',
            content: '',
        });
    }
}

/**
 * 事件处理器绑定测试组件 - 展示 :onclick 属性绑定行为
 *
 * 注意：Solely 框架的 :attr 绑定通过设置 DOM property 实现（el.onclick = value）
 * 当 value 是字符串时，onclick 属性期望的是函数，所以字符串不会被执行
 * 但这是一个不好的实践，应该使用框架的 @click 事件绑定语法
 */
@CustomElement({
    tagName: 'event-binding-test',
    template: `
    <div class="event-binding-demo">
      <h3>事件处理器属性绑定测试</h3>
      <div class="info-box">
        ℹ️ 说明：Solely 的 :attr 绑定设置的是 DOM property，不是 HTML attribute
      </div>
      <div class="test-area">
        <div 
          class="click-target" 
          :onclick="$data.clickHandler"
        >
          点击这个区域测试（字符串不会触发，因为 onclick 期望函数）
        </div>
        <div class="handler-info">
          <strong>绑定的值：</strong>
          <code>{{ $data.clickHandler || '无' }}</code>
          <div class="note">
            注意：onclick property 被设置为字符串，但浏览器期望函数，所以不会执行
          </div>
        </div>
      </div>
    </div>
  `,
    styles: `
    .event-binding-demo {
      border: 2px solid #ff9800;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      background: #fff8e1;
    }
    .info-box {
      color: #e65100;
      font-weight: bold;
      margin-bottom: 15px;
      padding: 10px 15px;
      background: #ffecb3;
      border-radius: 4px;
      border-left: 4px solid #ff9800;
    }
    .click-target {
      padding: 20px;
      background: #ffe0b2;
      border: 2px dashed #ff9800;
      border-radius: 4px;
      cursor: pointer;
      text-align: center;
      margin: 10px 0;
    }
    .click-target:hover {
      background: #ffcc80;
    }
    .handler-info {
      margin-top: 15px;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .handler-info code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      color: #e65100;
    }
    .handler-info .note {
      margin-top: 8px;
      color: #666;
      font-size: 14px;
    }
  `,
})
class EventBindingTest extends BaseElement<{
    clickHandler: string;
}> {
    constructor() {
        super({
            clickHandler: '',
        });
    }
}

/**
 * Style 属性绑定测试组件 - 展示 :style 属性绑定行为
 *
 * 注意：Solely 框架不支持 IE，而 style 中的 javascript: 协议攻击仅在旧版 IE 中有效。
 * 在现代浏览器中，这种攻击方式已经失效。本测试仅用于演示框架的行为。
 */
@CustomElement({
    tagName: 'style-binding-test',
    template: `
    <div class="style-binding-demo">
      <h3>Style 属性绑定测试</h3>
      <div class="info-box">
        ℹ️ 说明：Solely 不支持 IE，而 javascript: 协议在 style 中仅在旧版 IE 有效
      </div>
      <div class="test-area">
        <div 
          class="style-target" 
          :style="$data.userStyle"
        >
          这个元素的样式来自用户输入
        </div>
        <div class="style-info">
          <strong>绑定的样式：</strong>
          <code>{{ $data.userStyle || '无' }}</code>
          <div class="note">
            在当前浏览器中，style 中的 javascript: 协议不会执行
          </div>
        </div>
      </div>
    </div>
  `,
    styles: `
    .style-binding-demo {
      border: 2px solid #2196f3;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      background: #e3f2fd;
    }
    .info-box {
      color: #1565c0;
      font-weight: bold;
      margin-bottom: 15px;
      padding: 10px 15px;
      background: #bbdefb;
      border-radius: 4px;
      border-left: 4px solid #2196f3;
    }
    .style-target {
      padding: 20px;
      background: #90caf9;
      border: 2px dashed #2196f3;
      border-radius: 4px;
      text-align: center;
      margin: 10px 0;
      min-height: 50px;
    }
    .style-info {
      margin-top: 15px;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .style-info code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      color: #1565c0;
      word-break: break-all;
    }
    .style-info .note {
      margin-top: 8px;
      color: #666;
      font-size: 14px;
    }
  `,
})
class StyleBindingTest extends BaseElement<{
    userStyle: string;
}> {
    constructor() {
        super({
            userStyle: '',
        });
    }
}

/**
 * class 绑定测试组件 - 展示特殊字符处理
 */
@CustomElement({
    tagName: 'class-test',
    template: `
    <div class="class-binding-demo">
      <h3>Class 绑定测试结果</h3>
      <div class="demo-content">
        <div :class="$data.classObj" class="target">目标元素 - 查看应用的 class 名称</div>
        <div class="info">
          <strong>应用的 class 数量：</strong>{{ $data.classKeys.length }}
        </div>
        <div class="tags">
          <strong>所有 class 名称：</strong>
          <For each="$data.classKeys">
            <span class="tag">{{ item }}</span>
          </For>
        </div>
      </div>
    </div>
  `,
    styles: `
    .class-binding-demo {
      border: 1px solid #ddd;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .class-binding-demo h3 {
      margin-top: 0;
      color: #333;
    }
    .demo-content {
      padding: 15px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .target {
      padding: 15px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    .info {
      margin: 10px 0;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .tags {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .tag {
      background: #007bff;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
    }
  `,
})
class ClassTest extends BaseElement<{
    classObj: Record<string, boolean>;
    classKeys: string[];
}> {
    constructor() {
        super({
            classObj: {},
            classKeys: [],
        });
    }

    updateClassObj(obj: Record<string, boolean>) {
        this.$data.classObj = obj;
        this.$data.classKeys = Object.keys(obj).filter(k => obj[k]);
    }
}

// ============================================================
// 演示控制逻辑
// ============================================================

// 模拟从 URL 获取参数
function getUrlParam(name: string): string {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
}

// 模拟从 API 获取数据
async function fetchUserData(userId: string): Promise<any> {
    // 模拟 API 响应 - 正常数据
    if (userId === 'normal') {
        return {
            username: '普通用户',
            bio: '这是一个正常的用户简介',
            website: 'https://example.com',
            userContent: '<p>用户自定义内容</p>',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
        };
    }

    // 模拟 API 响应 - 被污染的数据（XSS 攻击）
    if (userId === 'attacker') {
        return {
            username: '<img src=x onerror="alert(\'XSS: 窃取cookie: \'+document.cookie)">',
            bio: '<script>alert("XSS in bio")</script>正常简介',
            website: 'javascript:alert("XSS: "+localStorage.getItem("token"))',
            userContent: '<div onclick="alert(\'点击攻击\')">点击我</div>',
            avatarUrl: 'javascript:alert("XSS via img src: "+document.cookie)',
        };
    }

    return null;
}

// 场景 1: 正常用户
(window as any).loadNormalUser = async () => {
    const container = document.getElementById('userContainer')!;
    container.innerHTML = '';

    const userData = await fetchUserData('normal');
    const profile = document.createElement('user-profile') as UserProfile;
    profile.$data = userData;
    container.appendChild(profile);

    showResult('normalResult', 'safe', '✅ 正常用户数据加载成功，无安全风险');
};

// 场景 2: 攻击者用户（XSS 数据）
(window as any).loadAttackerUser = async () => {
    const container = document.getElementById('userContainer')!;
    container.innerHTML = '';

    const userData = await fetchUserData('attacker');
    const profile = document.createElement('user-profile') as UserProfile;
    profile.$data = userData;
    container.appendChild(profile);

    // 检查是否存在潜在 XSS
    const hasXss = Object.values(userData).some(
        v =>
            typeof v === 'string' &&
            (v.includes('<script') || v.includes('javascript:') || v.includes('onerror=') || v.includes('onclick=')),
    );

    if (hasXss) {
        showResult(
            'normalResult',
            'danger',
            '⚠️ 检测到恶意数据！包含 script 标签、事件处理器或 javascript: 伪协议。' +
                '在 Solely 框架中，这些数据会被当作纯文本渲染，不会执行。',
        );
    }
};

// 场景 3: 评论 XSS
(window as any).addNormalComment = () => {
    const list = document.querySelector('comment-list') as CommentList;
    if (!list) {
        const container = document.getElementById('commentContainer')!;
        const newList = document.createElement('comment-list') as CommentList;
        container.appendChild(newList);
        newList.addComment('张三', '这是一条正常的评论');
        showResult('commentResult', 'safe', '✅ 正常评论添加成功');
    } else {
        list.addComment('李四', '另一条正常评论');
    }
};

(window as any).addMaliciousComment = () => {
    const container = document.getElementById('commentContainer')!;
    let list = document.querySelector('comment-list') as CommentList;
    if (!list) {
        list = document.createElement('comment-list') as CommentList;
        container.appendChild(list);
    }

    // 恶意评论 - 包含 XSS
    const maliciousContent = '<img src="x" onerror="alert(\'评论XSS: \'+document.cookie)">';
    list.addComment('攻击者', maliciousContent);

    showResult('commentResult', 'warning', '⚠️ 恶意评论已添加，但其中的 HTML 标签会被当作纯文本显示，不会执行');
};

// 场景 4: URL 参数注入
(window as any).testUrlInjection = () => {
    const container = document.getElementById('urlContainer')!;
    container.innerHTML = '';

    // 模拟从 URL 获取模板
    const urlTemplate = getUrlParam('template') || '{{ alert("XSS") }}';

    const dynamic = document.createElement('dynamic-template') as DynamicTemplate;
    dynamic.$data = {
        source: 'URL 参数: ' + urlTemplate,
        content: urlTemplate,
    };
    container.appendChild(dynamic);

    showResult(
        'urlResult',
        'info',
        'ℹ️ 模板在编译时就已经确定，URL 参数只能影响数据，不能改变模板结构。' +
            '即使模板中包含 {{ alert("XSS") }}，它也会被当作纯文本显示。',
    );
};

// 场景 5: Class 绑定特殊字符测试
(window as any).testClassSpecialChars = () => {
    const container = document.getElementById('classContainer')!;
    container.innerHTML = '';

    const classTest = document.createElement('class-test') as ClassTest;
    container.appendChild(classTest);

    // 测试各种特殊字符（包含有效和无效的 class 名称）
    const specialClassNames: Record<string, boolean> = {
        // 有效的 class 名称
        'has-dash': true,
        has_underscore: true,
        'has.dot': true,
        'emoji-😀': true,
        中文类名: true,
        camelCase: true,
        SCREAMING_CASE: true,
        // 无效的 class 名称（会被过滤，开发模式下会警告）
        'has space': true,
    };

    classTest.updateClassObj(specialClassNames);

    showResult(
        'classResult',
        'safe',
        '✅ 特殊字符 class 名称处理成功！有效的 class 名称已应用，包含空格的无效名称已被过滤（开发模式下会输出警告）。' +
            '框架使用 classList.add() 添加 class，不会导致 XSS 或其他安全问题。',
    );
};

(window as any).testClassXSSAttempt = () => {
    const container = document.getElementById('classContainer')!;
    container.innerHTML = '';

    const classTest = document.createElement('class-test') as ClassTest;
    container.appendChild(classTest);

    // 尝试 XSS 注入（这些字符串会被当作纯文本 class 名称，不会执行）
    const xssClassNames: Record<string, boolean> = {
        '<script>alert("XSS")</script>': true,
        'onclick=alert("XSS")': true,
        'onerror=alert("XSS")': true,
        '"><img src=x onerror=alert("XSS")>': true,
        "javascript:alert('XSS')": true,
    };

    classTest.updateClassObj(xssClassNames);

    showResult(
        'classResult',
        'warning',
        '⚠️ 尝试注入 XSS 作为 class 名称。这些字符串会被当作纯文本（class 名称），' +
            '不会执行任何 JavaScript。classList.add() 本身是安全的，不会解析内容为代码。',
    );
};

// 场景 5: 事件处理器属性绑定测试
(window as any).testEventBindingXSS = () => {
    const container = document.getElementById('eventContainer')!;
    container.innerHTML = '';

    const eventTest = document.createElement('event-binding-test') as EventBindingTest;
    container.appendChild(eventTest);

    // 模拟尝试注入事件处理器（字符串形式）
    const maliciousHandler = "alert('XSS via onclick: ' + document.cookie)";
    eventTest.$data = {
        clickHandler: maliciousHandler,
    };

    showResult(
        'eventResult',
        'warning',
        '⚠️ 注意：虽然绑定了字符串到 :onclick，但在 Solely 框架中这不会执行。' +
            '因为 :attr 绑定设置的是 DOM property（el.onclick = string），而 onclick 期望的是函数。' +
            '尽管如此，仍不建议将用户输入绑定到事件处理器属性，应该使用 @click 语法。',
    );
};

(window as any).testSafeEventBinding = () => {
    const container = document.getElementById('eventContainer')!;
    container.innerHTML = '';

    const eventTest = document.createElement('event-binding-test') as EventBindingTest;
    container.appendChild(eventTest);

    // 安全的事件处理器（仅用于演示，实际应该使用框架的事件绑定语法如 @click）
    eventTest.$data = {
        clickHandler: '',
    };

    showResult(
        'eventResult',
        'safe',
        '✅ 安全：事件处理器属性未绑定任何代码。' +
            '在实际开发中，应该使用框架提供的事件绑定语法（如 @click）而不是 :onclick。',
    );
};

// 场景 6: Style 属性绑定测试
(window as any).testStyleBindingXSS = () => {
    const container = document.getElementById('styleContainer')!;
    container.innerHTML = '';

    const styleTest = document.createElement('style-binding-test') as StyleBindingTest;
    container.appendChild(styleTest);

    // 尝试通过 style 属性执行 XSS（利用 background-image: url('javascript:...')）
    // 注意：Solely 框架不支持 IE，这种攻击在现代浏览器中无效
    const maliciousStyle = 'background-image: url(\'javascript:alert("XSS via style")\')';
    styleTest.$data = {
        userStyle: maliciousStyle,
    };

    showResult(
        'styleResult',
        'info',
        'ℹ️ 演示：绑定了包含 javascript: 协议的样式。' +
            '由于 Solely 框架不支持 IE，且现代浏览器已修复此漏洞，代码不会执行。' +
            '这是为了演示框架对 style 属性的绑定行为。',
    );
};

(window as any).testSafeStyleBinding = () => {
    const container = document.getElementById('styleContainer')!;
    container.innerHTML = '';

    const styleTest = document.createElement('style-binding-test') as StyleBindingTest;
    container.appendChild(styleTest);

    // 安全的样式
    styleTest.$data = {
        userStyle: 'color: blue; font-size: 16px;',
    };

    showResult(
        'styleResult',
        'safe',
        '✅ 安全：样式属性只包含安全的 CSS 属性。' +
            '在实际开发中，应该对 style 属性进行白名单过滤，禁止包含 url() 等可能执行代码的样式。',
    );
};

// 显示结果
function showResult(elementId: string, type: 'safe' | 'danger' | 'warning' | 'info', message: string) {
    const el = document.getElementById(elementId)!;
    el.className = `result ${type}`;
    el.innerHTML = message;
    el.style.display = 'block';
}

// 初始化
console.log('🛡️ Solely 框架安全演示已加载');
console.log('');
console.log('框架的安全机制：');
console.log('1. 模板编译时确定，运行时不可更改');
console.log('2. {{ }} 插值自动进行 HTML 转义');
console.log('3. 数据绑定只影响内容，不影响结构');
console.log('');
console.log('真实的 XSS 风险：');
console.log('- 如果框架提供 :innerHTML 指令渲染原始 HTML');
console.log('- 如果用户数据被用于构造动态模板');
console.log('- 如果属性绑定未对 javascript: 等协议进行过滤');
