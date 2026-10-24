import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      alias: { 'virtual:pwa-register/vue': fileURLToPath(new URL('./tests/__mocks__/pwa-register.ts', import.meta.url)) },
    },
  }),
)
