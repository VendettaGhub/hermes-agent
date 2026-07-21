import type { TestProjectConfiguration } from 'vitest/config';
import { defineConfig } from 'vitest/config'

const reactUi: TestProjectConfiguration = {
  extends: './vite.config.ts',
  test: {
    name: 'ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true
  }
}

const electronNative: TestProjectConfiguration = {
  test: {
    name: 'electron',
    environment: 'node',
    include: ['electron/**/*.test.ts', 'scripts/**.test.{ts,mjs}']
  }
}

export default defineConfig({
  test: {
    // Native Windows runners report enough logical CPUs for Vitest to spawn 16
    // JSDOM workers, but transform/import contention then starves otherwise
    // fast UI tests past the default 5s timeout. Eight keeps the suite parallel
    // without turning machine load into false Billing/Skills failures.
    maxWorkers: process.platform === 'win32' ? 8 : undefined,
    projects: [reactUi, electronNative]
  }
})
