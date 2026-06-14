# Solely 快速开始指南

## 目录

- [环境准备](#环境准备)
- [创建第一个组件](#创建第一个组件)
- [模板语法详解](#模板语法详解)
- [响应式数据](#响应式数据)
- [组件通信](#组件通信)
- [路由配置](#路由配置)
- [构建部署](#构建部署)

---

## 环境准备

### 1. 创建项目

```bash
# 创建项目目录
mkdir my-solely-app
cd my-solely-app

# 初始化 npm
npm init -y

# 安装 Solely
npm install solely

# 安装开发依赖
npm install -D typescript vite
```

### 2. 配置 TypeScript

创建 `tsconfig.json`：

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "lib": ["ES2020", "DOM", "DOM.Iterable"],
        "moduleResolution": "bundler",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true,
        "useDefineForClassFields": false
    },
    "include": ["src/**/*"]
}
```

### 3. 配置 Vite

创建 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
    },
});
```

### 4. 创建入口文件

创建 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My Solely App</title>
    </head>
    <body>
        <div id="app">
            <router-view></router-view>
        </div>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

---

## 创建第一个组件

### 1. 计数器组件

创建 `src/components/counter.ts`：

```typescript
import { BaseElement, CustomElement } from 'solely';

interface CounterData {
    count: number;
    step: number;
}

@CustomElement({
    tagName: 'my-counter',
    template: `
    <div class="counter">
      <h2>计数: {{ $data.count }}</h2>
      <div class="controls">
        <button @click="this.decrease()">-</button>
        <span>步长: {{ $data.step }}</span>
        <button @click="this.increase()">+</button>
      </div>
      <input 
        type="number" 
        s-model="$data.step" 
        min="1" 
        max="10"
      >
    </div>
  `,
    styles: `
    .counter {
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
      text-align: center;
    }
    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin: 15px 0;
    }
    button {
      padding: 8px 16px;
      font-size: 16px;
      cursor: pointer;
    }
    input {
      width: 60px;
      padding: 5px;
    }
  `,
})
export class MyCounter extends BaseElement<CounterData> {
    constructor() {
        super({
            count: 0,
            step: 1,
        });
    }

    increase() {
        this.$data.count += this.$data.step;
    }

    decrease() {
        this.$data.count -= this.$data.step;
    }

    mounted() {
        console.log('计数器组件已挂载');
    }
}
```

### 2. 使用组件

创建 `src/main.ts`：

```typescript
import { createRouter } from 'solely';
import './components/counter';

// 简单路由配置
const router = createRouter({
    routes: [
        {
            path: '/',
            tagName: 'my-counter',
        },
    ],
    mode: 'hash',
});

// 启动路由监听
router.setupListeners();
```

### 3. 启动开发服务器

```bash
npx vite
```

访问 `http://localhost:5173` 查看效果。

---

## 模板语法详解

### 文本插值

```html
<!-- 简单表达式 -->
<p>{{ $data.message }}</p>

<!-- 计算表达式 -->
<p>{{ $data.price * $data.quantity }}</p>

<!-- 调用方法 -->
<p>{{ this.formatDate($data.date) }}</p>

<!-- 三元表达式 -->
<p>{{ $data.isActive ? '激活' : '未激活' }}</p>
```

### 属性绑定

```html
<!-- 标准属性 -->
<img :src="$data.imageUrl" :alt="$data.description" />

<!-- 布尔属性 -->
<button :disabled="$data.isLoading">提交</button>
<input :checked="$data.isAgreed" type="checkbox" />

<!-- 动态类 -->
<div :class="{ active: $data.isActive, disabled: $data.isDisabled }">内容</div>

<!-- 动态样式 -->
<div :style="{ color: $data.textColor, fontSize: $data.fontSize + 'px' }">样式文本</div>
```

### 事件处理

```html
<!-- 简单事件 -->
<button @click="this.handleClick()">点击</button>

<!-- 内联表达式 -->
<button @click="$data.count++">增加</button>

<!-- 访问事件对象 -->
<input @input="this.handleInput(event)" />

<!-- 阻止默认行为需要手动调用 event.preventDefault() -->
<form @submit="this.handleSubmit(event)"></form>
```

### 条件渲染

```html
<!-- 简单条件 -->
<If test="$data.isVisible">
    <p>现在可见</p>
</If>

<!-- if-else -->
<If test="$data.isLoggedIn">
    <p>欢迎回来</p>
</If>
<If test="!$data.isLoggedIn">
    <p>请登录</p>
</If>

<!-- 多条件 -->
<If test="$data.status === 'loading'">
    <p>加载中...</p>
</If>
<If test="$data.status === 'success'">
    <p>加载成功</p>
</If>
<If test="$data.status === 'error'">
    <p>加载失败</p>
</If>
```

### 列表渲染

```html
<!-- 基础列表 -->
<ul>
    <For each="$data.items" item="item">
        <li>{{ item.name }}</li>
    </For>
</ul>

<!-- 带索引 -->
<ul>
    <For each="$data.items" item="item" index="i">
        <li>{{ i + 1 }}. {{ item.name }}</li>
    </For>
</ul>

<!-- 嵌套列表 -->
<ul>
    <For each="$data.categories" item="category">
        <li>
            <strong>{{ category.name }}</strong>
            <ul>
                <For each="category.products" item="product">
                    <li>{{ product.name }} - ¥{{ product.price }}</li>
                </For>
            </ul>
        </li>
    </For>
</ul>
```

### 双向绑定

```html
<!-- 文本输入 -->
<input s-model="$data.username" placeholder="用户名" />

<!-- 多行文本 -->
<textarea s-model="$data.content" rows="4"></textarea>

<!-- 复选框 -->
<input type="checkbox" s-model="$data.isAgreed" /> 同意条款

<!-- 单选框 -->
<input type="radio" name="gender" value="male" s-model="$data.gender" /> 男
<input type="radio" name="gender" value="female" s-model="$data.gender" /> 女

<!-- 下拉选择 -->
<select s-model="$data.selectedCity">
    <option value="">请选择</option>
    <For each="$data.cities" item="city">
        <option :value="city.code">{{ city.name }}</option>
    </For>
</select>
```

---

## 响应式数据

### 基础响应式

```typescript
@CustomElement({
    tagName: 'reactive-demo',
    template: `
    <div>
      <p>计数: {{ $data.count }}</p>
      <button @click="$data.count++">增加</button>
      <button @click="this.reset()">重置</button>
    </div>
  `,
})
class ReactiveDemo extends BaseElement<{ count: number }> {
    constructor() {
        super({ count: 0 });
    }

    reset() {
        this.$data.count = 0;
    }
}
```

### 嵌套对象

```typescript
interface UserData {
    user: {
        name: string;
        profile: {
            age: number;
            email: string;
        };
    };
}

@CustomElement({
    tagName: 'user-form',
    template: `
    <div>
      <input s-model="$data.user.name" placeholder="姓名">
      <input s-model="$data.user.profile.age" type="number" placeholder="年龄">
      <input s-model="$data.user.profile.email" placeholder="邮箱">
      
      <p>预览: {{ $data.user.name }}, {{ $data.user.profile.age }}岁</p>
    </div>
  `,
})
class UserForm extends BaseElement<UserData> {
    constructor() {
        super({
            user: {
                name: '',
                profile: {
                    age: 0,
                    email: '',
                },
            },
        });
    }
}
```

### 数组操作

```typescript
interface ListData {
    items: string[];
    newItem: string;
}

@CustomElement({
    tagName: 'todo-list',
    template: `
    <div>
      <input s-model="$data.newItem" @keyup="if(event.key === 'Enter') this.addItem()">
      <button @click="this.addItem()">添加</button>

      <ul>
        <For each="$data.items" item="item" index="index">
          <li>
            {{ item }}
            <button @click="this.removeItem(index)">删除</button>
          </li>
        </For>
      </ul>
    </div>
  `,
})
class TodoList extends BaseElement<ListData> {
    constructor() {
        super({
            items: ['学习 Solely', '构建应用'],
            newItem: '',
        });
    }

    addItem() {
        if (this.$data.newItem.trim()) {
            this.$data.items.push(this.$data.newItem.trim());
            this.$data.newItem = '';
        }
    }

    removeItem(index: number) {
        this.$data.items.splice(index, 1);
    }
}
```

### 计算属性 (computed)

使用 `computed` 创建派生数据，当依赖变化时自动重新计算：

```typescript
import { computed, watchGetter } from 'solely';

interface CartItem {
    name: string;
    price: number;
    quantity: number;
}

@CustomElement({
    tagName: 'shopping-cart',
    template: `
    <div>
      <For each="$data.items" item="item">
        <p>{{ item.name }}: ¥{{ item.price }} × {{ item.quantity }}</p>
      </For>
      <p>总价: ¥{{ $data.total }}</p>
    </div>
  `,
})
class ShoppingCart extends BaseElement<{ items: CartItem[]; total: number }> {
    constructor() {
        super({ items: [], total: 0 });
    }

    created() {
        // Computed：总价 = 单价 × 数量
        const total = computed([this.$data], () =>
            this.$data.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        );

        // 使用 watchGetter 同步计算结果到 $data
        watchGetter(
            [this.$data],
            () => total.get(),
            newTotal => {
                this.$data.total = newTotal;
            },
        );
    }
}
```

### 侦听器 (watch)

使用 `watch` 侦听数据变化并执行副作用：

```typescript
import { watch, watchGetter } from 'solely';

@CustomElement({
    tagName: 'search-box',
    template: `
    <div>
      <input s-model="$data.keyword" placeholder="搜索...">
      <p>搜索结果: {{ $data.resultCount }} 条</p>
    </div>
  `,
})
class SearchBox extends BaseElement<{ keyword: string; resultCount: number }> {
    constructor() {
        super({ keyword: '', resultCount: 0 });
    }

    created() {
        // 侦听整个对象变化
        watch(this.$data, change => {
            console.log('数据变化:', change.path.join('.'), change);
        });

        // 侦听特定值的变化
        watchGetter(
            [this.$data],
            () => this.$data.keyword,
            newKeyword => {
                this.search(newKeyword);
            },
        );
    }

    private search(keyword: string) {
        // 执行搜索逻辑...
        this.$data.resultCount = keyword.length;
    }
}
```

### 显隐控制 (Show)

使用 `<Show>` 控制元素显隐，隐藏时缓存 DOM 而非销毁：

```html
<!-- 频繁切换用 Show，缓存组件状态 -->
<Show test="$data.isPanelOpen">
    <div class="panel">
        <input s-model="$data.draftContent" placeholder="草稿内容不会丢失" />
    </div>
</Show>

<!-- 条件渲染用 If，完全销毁/重建 DOM -->
<If test="$data.isLoggedIn">
    <p>欢迎回来</p>
</If>
```

> **`<Show>` 是 `<If keepalive>` 的语法糖**，编译时自动转换为单分支 Conditional + keepalive。隐藏时 DOM 被移入缓存而非销毁，显示时从缓存恢复，适合频繁切换且需要保持状态的场景。

### 组件缓存 (keepalive)

在 `<If>` / `<ElseIf>` / `<Else>` 上添加 `keepalive` 属性，条件不满足时将 DOM 移入缓存而非销毁，切换回来时从缓存恢复：

```html
<!-- 标签页切换，输入内容不会丢失 -->
<If test="$data.tab === 'list'" keepalive>
    <my-heavy-list />
</If>
<ElseIf test="$data.tab === 'detail'" keepalive>
    <my-detail-view />
</ElseIf>
```

> **`keepalive` vs 普通 `If`**：普通 `If` 切换时销毁/重建 DOM，状态丢失；`keepalive` 切换时将 DOM 移入缓存，状态保留。keepalive 分支失活时触发 `deactivated`，恢复时触发 `activated`，而非 `unmounted`/`mounted`。
>
> **keepalive 语义说明**：恢复时执行完整的 Reconciliation——内部 `<If>`/`<For>` 会根据当前数据重新求值，动态属性和动态文本也会同步更新。分支内部因条件/列表变化产生的多余节点会触发 `unmounted` 并清理事件，而非错误地进入 keepalive 缓存。

---

## 组件通信

### 1. Props（父传子）

```typescript
// 子组件
@CustomElement({
    tagName: 'user-card',
    template: `
    <div class="card">
      <h3>{{ $data.name }}</h3>
      <p>年龄: {{ $data.age }}</p>
      <span :class="{ vip: $data.isVip }">{{ $data.isVip ? 'VIP' : '普通用户' }}</span>
    </div>
  `,
    props: [
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'is-vip', type: 'boolean', default: false },
    ],
    styles: `
    .card { border: 1px solid #ddd; padding: 15px; margin: 10px; }
    .vip { color: gold; font-weight: bold; }
  `,
})
class UserCard extends BaseElement<{
    name: string;
    age: number;
    isVip: boolean;
}> {
    constructor() {
        super({ name: '', age: 0, isVip: false });
    }
}
```

HTML 中使用：

```html
<user-card name="张三" age="25" is-vip="true"></user-card> <user-card name="李四" age="30"></user-card>
```

### 2. 自定义事件（子传父）

```typescript
// 子组件
@CustomElement({
    tagName: 'child-component',
    template: `
    <button @click="this.sendMessage()">发送消息</button>
  `,
})
class ChildComponent extends BaseElement<{}> {
    sendMessage() {
        this.emit('message', { text: '来自子组件的消息', time: Date.now() });
    }
}

// 父组件
@CustomElement({
    tagName: 'parent-component',
    template: `
    <div>
      <p>收到的消息: {{ $data.lastMessage }}</p>
      <child-component @message="this.onMessage(event)"></child-component>
    </div>
  `,
})
class ParentComponent extends BaseElement<{ lastMessage: string }> {
    constructor() {
        super({ lastMessage: '' });
    }

    onMessage(event: CustomEvent) {
        this.$data.lastMessage = event.detail.text;
    }
}
```

### 3. Ref 引用

```typescript
@CustomElement({
    tagName: 'ref-demo',
    template: `
    <div>
      <input ref="inputRef" placeholder="输入内容">
      <button @click="this.focusInput()">聚焦输入框</button>
      <button @click="this.getValue()">获取值</button>
    </div>
  `,
})
class RefDemo extends BaseElement<{}> {
    focusInput() {
        this.$refs.inputRef?.focus();
    }

    getValue() {
        const value = this.$refs.inputRef?.value;
        alert(`输入值: ${value}`);
    }
}
```

---

## 路由配置

### 基础路由

```typescript
import { createRouter } from 'solely';

const router = createRouter({
    routes: [
        { path: '/', tagName: 'home-page' },
        { path: '/about', tagName: 'about-page' },
        { path: '/contact', tagName: 'contact-page' },
    ],
    mode: 'hash', // 或 'history'
});

// 启动路由监听
router.setupListeners();
```

### 动态路由

```typescript
const router = createRouter({
    routes: [
        { path: '/user/:id', tagName: 'user-profile' },
        { path: '/product/:category/:id', tagName: 'product-detail' },
    ],
});

router.setupListeners();

// 在组件中获取参数
@CustomElement({
    tagName: 'user-profile',
    template: `
    <div>
      <h1>用户 #{{ $data.userId }}</h1>
      <p>其他参数: {{ JSON.stringify($data.params) }}</p>
    </div>
  `,
})
class UserProfile extends BaseElement<{
    userId: string;
    params: Record<string, string>;
}> {
    mounted() {
        // 获取路由参数
        const router = getRouter();
        const route = router?.getCurrentRoute();

        if (route) {
            this.$data.userId = route.params.id;
            this.$data.params = route.params;
        }
    }
}
```

### 嵌套路由

```typescript
const router = createRouter({
    routes: [
        {
            path: '/dashboard',
            tagName: 'dashboard-layout',
            children: [
                { path: '', tagName: 'dashboard-home' }, // /dashboard
                { path: 'settings', tagName: 'dashboard-settings' }, // /dashboard/settings
                { path: 'profile/:id', tagName: 'user-profile' }, // /dashboard/profile/123
            ],
        },
    ],
});

router.setupListeners();
```

### 导航守卫

```typescript
const router = createRouter({
    routes: [
        {
            path: '/admin',
            tagName: 'admin-panel',
            meta: { requiresAuth: true, role: 'admin' },
        },
    ],
    beforeEach: (to, from) => {
        // 检查认证 - 返回路径字符串自动重定向
        if (to.meta.requiresAuth && !isAuthenticated()) {
            return '/login';
        }

        // 检查权限 - 返回 false 阻止导航
        if (to.meta.role && !hasRole(to.meta.role)) {
            return false;
        }

        return true;
    },
    afterEach: (to, from) => {
        console.log(`导航完成: ${from?.fullPath ?? '初始'} -> ${to.fullPath}`);
    },
});

router.setupListeners();
```

### 编程式导航

```typescript
// 在组件中导航
class MyComponent extends BaseElement<{}> {
    goToUser(userId: string) {
        const router = getRouter();
        router?.push(`/user/${userId}`);
    }

    replaceWithHome() {
        const router = getRouter();
        router?.replace('/');
    }

    goBack() {
        history.back();
    }
}
```

### 路由链接

```html
<!-- 基础链接 -->
<router-link to="/about">关于我们</router-link>

<!-- 带激活类 -->
<router-link to="/products" active-class="active">产品</router-link>

<!-- replace 模式 -->
<router-link to="/login" replace>登录（不记录历史）</router-link>
```

---

## 构建部署

### 开发构建

```bash
# 启动开发服务器
npx vite

# 构建生产版本
npx vite build
```

### 生产配置

更新 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        target: 'es2020',
        minify: 'terser',
        rollupOptions: {
            output: {
                manualChunks: {
                    solely: ['solely'],
                },
            },
        },
    },
});
```

### 部署到静态服务器

构建完成后，`dist` 目录包含所有静态文件：

```bash
# 复制到服务器
cp -r dist/* /var/www/html/

# 或使用 GitHub Pages
npm install -D gh-pages
npm run build
npm run deploy
```

---

## 常见问题

### Q: 如何调试 Solely 组件？

A: 使用浏览器开发者工具：

1. 在 Chrome DevTools 中查看自定义元素
2. 使用 `console.log` 输出 `$data` 查看响应式数据
3. 在生命周期钩子中添加断点

### Q: 性能优化建议？

A:

1. 使用 `keepalive`（模板）或 `keepAlive`（路由配置）缓存不常变化的组件，避免重复创建和销毁
2. 在 keepalive 组件中使用 `activated`/`deactivated` 生命周期管理副作用（如定时器、订阅），而非 `mounted`/`unmounted`
3. 避免在模板中使用复杂计算，将计算逻辑放在组件方法中
4. 大数据列表考虑分页加载或无限滚动，避免一次性渲染过多 DOM 节点
5. 合理使用 `shadowDOM` 封装样式，避免全局样式污染和选择器匹配开销

### Q: 如何与现有项目集成？

A: Solely 组件是标准的 Web Components，可以在任何框架中使用：

```html
<!-- React 中使用 -->
import 'my-solely-components'; function App() { return <my-counter />; }

<!-- Vue 中使用 -->
<template>
    <my-counter />
</template>

<script>
    import 'my-solely-components';
</script>
```

---

## 下一步

- 查看 [API 文档](./api.md) 了解完整 API
- 探索 [示例项目](../examples/) 学习更多用法
- 阅读 [源码](../src/) 深入理解实现原理
