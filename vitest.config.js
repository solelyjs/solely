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
      exclude: [
        'src/vite-env.d.ts',
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/components/**/*',
        'src/types/**/*',
      ],
      // 覆盖率门禁：略低于当前实际值（87.42/80.66/91.80/87.42），
      // 作为防劣化底线，后续随测试补充逐步上调
      // 注意：src/components/** 暂不计入（组件库测试骨架已建立，全量纳入会稀释总体指标，
      // 待组件覆盖率提升后再调整）
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
      },
    },
  },
})
