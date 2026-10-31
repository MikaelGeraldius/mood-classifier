import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// A relative base lets the built site run from any folder: its own GitHub Pages repository,
// or a sub-folder of the portfolio later. Override with BASE_PATH if a host needs an absolute one.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  build: { target: 'es2022' },
  // During `npm run dev`, song lookups go through the dev server, which isn't bound by the browser's CORS
  // rules. The live site uses the Cloudflare Worker in proxy/ instead (VITE_RECCOBEATS_PROXY).
  server: {
    proxy: {
      '/reccobeats': {
        target: 'https://api.reccobeats.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reccobeats/, ''),
      },
      '/spotify': {
        target: 'https://open.spotify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spotify/, ''),
      },
      '/scdn': {
        target: 'https://p.scdn.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scdn/, ''),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
