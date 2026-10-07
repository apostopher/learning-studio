/// <reference types="vitest/config" />
// Side-effect import, kept FIRST: env.ts validates env vars at config-load time
// (via ./plugins/vite-theme below), and `vitest`/`build` don't go through the
// dotenv-cli wrapper the `dev` script uses. ESM evaluates this import's body
// before later imports, so .env.local is loaded before env.ts runs. dotenv does
// not override vars already in process.env, so platform envs (Vercel) win.
import './load-env';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { themePlugin } from './plugins/vite-theme';

/**
 * Tavus reaches our custom-LLM endpoint and webhook through a public tunnel
 * (TAVUS_PUBLIC_URL — ngrok in dev). Vite's dev server rejects requests whose
 * Host header it doesn't recognise (DNS-rebinding protection), so Tavus got a
 * 403 on the first spoken turn and ended every call. Allow exactly that one
 * host, never a wildcard. Dev-server only; production doesn't use this.
 */
const tavusTunnelHost = (() => {
  try {
    return new URL(process.env.TAVUS_PUBLIC_URL ?? '').hostname;
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { allowedHosts: tavusTunnelHost ? [tavusTunnelHost] : [] },
  // @jsquash ships emscripten glue that loads its own .wasm via import.meta.url.
  // Excluding it from dep pre-bundling keeps that wasm resolution intact.
  optimizeDeps: { exclude: ['@jsquash/webp', '@jsquash/avif'] },
  plugins: [
    devtools(),
    themePlugin(),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  // vitest test config — dual-version pnpm layout prevents augmentation from
  // vite@8 (project) vs vite@7 (vitest peer); cast is the minimal workaround.
  ...({ test: { setupFiles: ['./vitest.setup.ts'] } } as Record<
    string,
    unknown
  >),
});
