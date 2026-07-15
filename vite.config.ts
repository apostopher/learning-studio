/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { themePlugin } from './plugins/vite-theme';

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
