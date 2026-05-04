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
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor-react'
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/reactflow')) return 'vendor-reactflow'
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/rehype')) return 'vendor-markdown'
          if (id.includes('node_modules/@uiw') || id.includes('node_modules/codemirror')) return 'vendor-editor'
          if (id.includes('node_modules/recharts')) return 'vendor-charts'
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@radix-ui')) return 'vendor-ui'
        },
      },
    },
    // Increase chunk size warning threshold (ReactFlow is legitimately large)
    chunkSizeWarningLimit: 600,
  },
})
