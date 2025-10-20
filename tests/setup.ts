// tests/setup.ts
// 可以留空，或者添加必要的测试环境初始化代码
import { vi } from 'vitest';

// 示例：设置全局 mocks
vi.mock('some-module', () => ({
    someFunction: vi.fn(),
}));