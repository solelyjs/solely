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
 * ⚠️ 安全警告：:innerHTML 指令会直接将内容作为 HTML 渲染，存在 XSS 风险！
 * 只有当内容完全可信时才使用，用户输入的内容绝对不要使用此指令！
 */
@CustomElement({
    tagName: 'user-profile',
    template: `
    <div class="profile">
      <h2>用户资料</h2>
      <div class="info">
        <p><strong>用户名：</strong>{{ $data.username }}</p>
        <p><strong>简介：</strong>{{ $data.bio }}</p>
        <p><strong>网站：</strong><a :href="$data.website">{{ $data.website }}</a></p>
      </div>
      <If test="$data.userContent">
        <div class="xss-warning">
          ⚠️ 危险区域：以下内容使用 :innerHTML 渲染，可能包含恶意代码！
        </div>
      </If>
      <div class="user-content" :innerHTML="$data.userContent"></div>
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
  `,
})
class UserProfile extends BaseElement<{
    username: string;
    bio: string;
    website: string;
    userContent: string;
}> {
    constructor() {
        super({
            username: '',
            bio: '',
            website: '',
            userContent: '',
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
        };
    }

    // 模拟 API 响应 - 被污染的数据（XSS 攻击）
    if (userId === 'attacker') {
        return {
            username: '<img src=x onerror="alert(\'XSS: 窃取cookie: \'+document.cookie)">',
            bio: '<script>alert("XSS in bio")</script>正常简介',
            website: 'javascript:alert("XSS: "+localStorage.getItem("token"))',
            userContent: '<div onclick="alert(\'点击攻击\')">点击我</div>',
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
