import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// App version surfaced in Settings → About. Read from the root package.json so
// the "Polyglot version" shown is the real app version, not the client subpkg.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
      // Playground run is an SSE stream. Without explicit handling it falls
      // through to the generic '/api' string rule below, where http-proxy can
      // buffer the stream so chunks arrive in one end-blob — the UI then looks
      // frozen for the whole run and the client idle-watchdog aborts it
      // ("client_disconnect"). The configure() hook force-flushes headers and
      // disables Nagle/buffering on both sockets so tokens stream the instant
      // the server emits them.
      '/api/playground/run': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        headers: { Connection: 'keep-alive' },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Disable Nagle on the upstream socket so small SSE frames aren't held.
            proxyReq.on('socket', (socket) => socket.setNoDelay(true))
          })
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            // Mirror the server's no-buffer hints and flush headers immediately so
            // the browser starts receiving events before the first token.
            proxyRes.headers['x-accel-buffering'] = 'no'
            proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            delete proxyRes.headers['content-length']
            res.socket?.setNoDelay?.(true)
            res.flushHeaders?.()
          })
        },
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
          // C18 audit fix: anchor matches to package boundaries (trailing slash)
          // so `node_modules/react` no longer greedily captures react-syntax-
          // highlighter / react-markdown / react-router. Heavy/independent deps
          // get isolated cacheable chunks; dead branches (@uiw/codemirror/recharts/
          // reactflow/@radix-ui — not installed) removed. Order: specific first.
          if (!id.includes('/node_modules/')) return
          if (id.includes('/node_modules/react-syntax-highlighter/') || id.includes('/node_modules/refractor/') || id.includes('/node_modules/prismjs/')) return 'vendor-prism'
          if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/prosemirror') || id.includes('/node_modules/tiptap-markdown/')) return 'vendor-editor'
          if (id.includes('/node_modules/react-markdown/') || id.includes('/node_modules/remark') || id.includes('/node_modules/rehype') || id.includes('/node_modules/micromark') || id.includes('/node_modules/mdast') || id.includes('/node_modules/hast') || id.includes('/node_modules/unist')) return 'vendor-markdown'
          if (id.includes('/node_modules/@xyflow/')) return 'vendor-reactflow'
          if (id.includes('/node_modules/html-to-image/')) return 'vendor-htmltoimage'
          if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons'
          // Keep the whole React ecosystem in one chunk to avoid cross-chunk init order issues.
          if (id.includes('/node_modules/react-router') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react'
        },
      },
    },
    // Increase chunk size warning threshold (ReactFlow is legitimately large)
    chunkSizeWarningLimit: 600,
  },
})
