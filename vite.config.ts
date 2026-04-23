import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { themePlugin } from './plugins/vite-theme';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    themePlugin(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
