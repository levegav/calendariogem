import { defineConfig } from 'vitest/config'

// Pruebas contra el Supabase local (requiere `npx supabase start`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
