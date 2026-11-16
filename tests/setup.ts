// tests/setup.ts
// 全局测试环境初始化 + 兜底清理。
//
// 公共挂载/等待/事件录制工具见 tests/helpers/；这里只做与具体用例无关的全局收尾，
// 避免每个文件重复写 `document.body.innerHTML = ''`。
import { afterEach } from 'vitest';

afterEach(() => {
    // SSR / theme-node 等用例通过 `@vitest-environment node` 运行，没有 document；
    // 此时跳过清理，避免全局 hook 把 Node 环境用例带崩。
    if (typeof document === 'undefined') return;

    // 不清理 documentElement（theme 用例需要自行控制根节点），只清 body，
    // 避免上一条用例挂载的元素通过 DOM 查询/事件冒泡污染下一条用例。
    document.body.innerHTML = '';
});
