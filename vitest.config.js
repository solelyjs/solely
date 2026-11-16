import { defineConfig } from 'vite'
import path from 'path'
import { solelyVitePlugin } from './src/plugins/solely-vite-plugin'

export default defineConfig({
  plugins: [
    solelyVitePlugin({
      precompile: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // 只收集根目录 tests/ 下的 Vitest 用例；
    // vscode-extension 使用 node:test，需在子包内独立运行，避免被根 Vitest 误收集
    include: ['tests/**/*.test.ts'],
    // SSR 用例会动态导入全部组件入口，Windows/全量并行时可能远超默认 5s
    testTimeout: 30000,
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // 只排除纯转发入口与类型声明；各组件目录下的 index.ts 是组件实现本体，必须计入。
      // （F-7：过去用 src/**/index.ts + src/components/**/* 把组件整体排除，组件覆盖率不可见）
      exclude: [
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        // 纯类型文件没有可执行语句，计入会把整体覆盖率稀释成假数字；
        // 组件实现本体（各目录 index.ts）仍然完整计入。
        'src/**/types.ts',
        'src/**/*-types.ts',
        'src/types/**/*',
        'src/index.ts',
        'src/runtime/index.ts',
        'src/runtime/component/index.ts',
        'src/runtime/reactivity/index.ts',
        'src/runtime/renderer/index.ts',
        'src/shared/index.ts',
        'src/compiler/index.ts',
        'src/compiler/ir/index.ts',
        'src/compiler/parser/index.ts',
        'src/plugins/index.ts',
        'src/router/index.ts',
        'src/components/index.ts',
        'src/components/elements/index.ts',
        'src/components/commands/index.ts',
      ],
      // 覆盖率门禁保持不降：组件纳入统计后如低于阈值，应如实报告并补测试，
      // 而不是调低阈值掩盖。
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
      },
    },
  },
})
