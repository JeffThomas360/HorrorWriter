import { defineConfig, sessionDrivers } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { collectBuildInfo } from './src/lib/buildInfo.js';

// Which build is live, shown on the admin Overview (src/lib/buildInfo.js).
const BUILD_INFO = await collectBuildInfo({
  version: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
  env: process.env,
  // No credential prompts and a time limit, so the unshallow attempt can never hang a build.
  run: (cmd) => execSync(cmd, {
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString().trim(),
});

// https://astro.build/config
export default defineConfig({
  site: 'https://horrorwriter.org',
  integrations: [
    react(),
    sitemap({
      // Server-rendered pages aren't discovered at build time; list the public ones.
      customPages: ['https://horrorwriter.org/prompts/'],
      // Exclude auth-gated / private / technical / demo routes — they have no SEO value
      // and shouldn't be advertised as crawlable public content.
      filter: (page) =>
        !/\/(admin|moderation|my-reports|my-stories|my-tickets|profile|library\/publish|forum\/new|auth\/callback|demo-editor)\/?$/.test(page),
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
    define: {
      __BUILD_INFO__: JSON.stringify(BUILD_INFO),
      // Playwright's webServer sets PLAYWRIGHT_TEST=true. Baked in here because pages
      // render inside workerd, where the shell's process.env is not visible
      // (src/lib/testMode.js). Production builds get a literal `false`.
      __PLAYWRIGHT_TEST__: JSON.stringify(process.env.PLAYWRIGHT_TEST === 'true'),
    },
    plugins: [tailwindcss()],
    resolve: {
      // Required if Vite 8 is hoisted by npm; forces the compiler to accept resolution pathways
      tsconfigPaths: true
    }
  }
});
