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
    },
  },
})
