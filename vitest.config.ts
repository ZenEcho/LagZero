import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    include: ['src/**/*.test.ts', 'tests/**/*.spec.ts']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
