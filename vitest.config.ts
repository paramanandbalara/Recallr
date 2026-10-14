import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't start the Electron plugin
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
