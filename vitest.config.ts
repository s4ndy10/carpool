import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/main.tsx', 'src/test/**', 'src/vite-env.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/frontend',
    },
  },
});
