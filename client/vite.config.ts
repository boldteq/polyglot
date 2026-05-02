import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

  ],
  server: {
    port: 5173,
    proxy: {
      // SSE endpoints need buffering disabled so events stream through immediately
      '/api/logs/stream': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        headers: { Connection: 'keep-alive' },
      },
      '/api/org-chart/stream': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        headers: { Connection: 'keep-alive' },
      },
      '/api': 'http://localhost:3847',
    },
  },
  build: {
    outDir: '../public-dist',
    emptyOutDir: true,
    // Q34: Manual chunk splitting — large deps get their own cacheable chunks
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-reactflow': ['@xyflow/react', 'reactflow'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-raw'],
          'vendor-editor': ['@uiw/react-md-editor', 'codemirror'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    // Increase chunk size warning threshold (ReactFlow is legitimately large)
    chunkSizeWarningLimit: 600,
  },
})
