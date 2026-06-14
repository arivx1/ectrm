import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/**/*BrowserSmoke.test.ts'],
    environment: 'node',
    // Pin the API base so appConfig-derived assertions (e.g. the resolved
    // display host in userEventsPanel.test.ts) are deterministic across local
    // runs and CI, instead of depending on whether a developer has a local
    // apps/web/.env. Mirrors the VITE_API_BASE default in .env.example.
    env: {
      VITE_API_BASE: 'http://127.0.0.1:8000',
    },
  },
})
