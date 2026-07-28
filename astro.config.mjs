import { defineConfig, sessionDrivers } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://horrorwriter.org',
  integrations: [
    react(),
    sitemap({
      // Exclude auth-gated / private / technical routes — they have no SEO value
      // and shouldn't be advertised as crawlable public content.
      filter: (page) =>
        !/\/(moderation|my-reports|profile|library\/publish|forum\/new|auth\/callback)\/?$/.test(page),
    }),
  ],
  adapter: cloudflare(),
  // We don't use Astro sessions (auth is Supabase). Pin a no-op in-memory
  // session driver so the Cloudflare adapter doesn't auto-require a SESSION
  // KV namespace binding at deploy time.
  //
  // `driver: 'memory'` (a bare string) is deprecated as of Astro 6 in favor of
  // the sessionDrivers factory object shape:
  // https://docs.astro.build/en/guides/upgrade-to/v6/#deprecated-session-driver-string-signature
  session: {
    driver: sessionDrivers.memory(),
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
