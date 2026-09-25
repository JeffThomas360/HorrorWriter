import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.js', 'src/**/*.test.jsx', 'supabase/functions/_shared/**/*.test.ts', 'workers/*/src/**/*.test.js']
  }
});
