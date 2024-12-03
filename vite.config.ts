import dtsPlugin from 'vite-plugin-dts';


export default {
  base: '',
  plugins: [
    // 生成声明文件
    dtsPlugin({
      outDir: 'dist',
      exclude: [
        'src/test.ts'
      ]
    }),
  ],
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