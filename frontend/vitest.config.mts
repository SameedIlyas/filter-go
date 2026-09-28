import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url))

/** Unit tests for pure frontend logic (form rows, formatting, parsing). Mirrors the tsconfig path aliases. */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@core\//, replacement: `${src('@core')}/` },
      { find: /^@layouts\//, replacement: `${src('@layouts')}/` },
      { find: /^@menu\//, replacement: `${src('@menu')}/` },
      { find: /^@assets\//, replacement: `${src('assets')}/` },
      { find: /^@components\//, replacement: `${src('components')}/` },
      { find: /^@configs\//, replacement: `${src('configs')}/` },
      { find: /^@views\//, replacement: `${src('views')}/` },
      { find: /^@\//, replacement: `${src('')}` }
    ]
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
