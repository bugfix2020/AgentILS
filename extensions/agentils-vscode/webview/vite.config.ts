import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        pure_funcs: ['console.log', 'console.debug'],
      },
    },
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/index.css'
          }
          return 'assets/[name][extname]'
        },
        // 代码分割配置
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-antd-x': ['@ant-design/x'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', '@ant-design/icons', '@ant-design/x'],
  },
})
