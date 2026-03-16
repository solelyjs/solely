import dtsPlugin from 'vite-plugin-dts';
import path from 'path';
// import htmlPrecompilePlugin from './src/plugins/html-precompile';

// 判断是否为开发模式
const isDev = process.env.NODE_ENV === 'development';

export default {
  base: '',
  plugins: [
    // 生成声明文件（仅在构建时使用）
    !isDev && dtsPlugin({
      outDir: 'dist',
      exclude: [
        'test/test.ts',
        'examples',
        '**/* copy*.ts'
      ]
    }),
    // // 转换 CustomElement 中的模板为 AST
    // htmlPrecompilePlugin({
    //   sourceMap: false,
    // }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // 配置 @ 指向 src 目录
    },
  },
  ...(isDev ? {
    // 开发模式配置
    server: {
      port: 5173,
      open: './examples/index.html',
    },
    build: {
      outDir: 'dist/examples',
      emptyOutDir: true,
    }
  } : {
    // 构建模式配置
    build: {
      sourcemap: false,
      emptyOutDir: true, // 是否清空该目录
      copyPublicDir: true, // 是否拷贝public
      // 库模式
      lib: {
        entry: [
          'src/index.ts',
        ],
        name: 'solely',
        // 将添加适当的扩展名后缀
        fileName: 'index',
      },
      // 添加declaration属性
      declaration: true, // 生成声明文件
    }
  })
}