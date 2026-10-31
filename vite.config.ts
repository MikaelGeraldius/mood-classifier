import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// A relative base lets the built site run from any folder: its own GitHub Pages repository,
// or a sub-folder of the portfolio later. Override with BASE_PATH if a host needs an absolute one.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
