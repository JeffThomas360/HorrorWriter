import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  adapter: cloudflare(),
  // We don't use Astro sessions (auth is Supabase). Pin a no-op in-memory
  // session driver so the Cloudflare adapter doesn't auto-require a SESSION
  // KV namespace binding at deploy time.
  session: {
    driver: 'memory',
  },
  server: {
    port: 5173
  },
  vite: {
    envPrefix: ['PUBLIC_', 'VITE_'],
    plugins: [tailwindcss()],
    resolve: {
      // Required if Vite 8 is hoisted by npm; forces the compiler to accept resolution pathways
      tsconfigPaths: true
    }
  }
});
