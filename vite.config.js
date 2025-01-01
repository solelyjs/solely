import dtsPlugin from 'vite-plugin-dts';
import path from 'path';

export default {
  base: '',
  plugins: [
    // 生成声明文件
    dtsPlugin({
      outDir: 'dist',
      exclude: [
        'test/test.ts'
      ]
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // 配置 @ 指向 src 目录
    },
  },
  build: {
    sourcemap: false,
    emptyOutDir: true, // 是否清空该目录
    copyPublicDir: true, // 是否拷贝public
    // 库模式
    lib: {
      entry: [
        'src/solely.ts',
      ],
      name: 'solely',
      // 将添加适当的扩展名后缀
      fileName: 'solely',
    },
    // 添加declaration属性
    declaration: true, // 生成声明文件
  }
}