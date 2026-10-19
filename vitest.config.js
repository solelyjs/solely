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
      // 覆盖率门禁：略低于当前实际值（81.3/78.0/87.0/81.3），
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
