import { resolve } from "node:path";
import type { Plugin } from "vite";
import { generateTheme } from "../scripts/generate-theme-css";

export function themePlugin(): Plugin {
  const envFile = resolve(process.cwd(), ".env.local");

  return {
    name: "rmtp-theme",
    enforce: "pre",

    buildStart() {
      generateTheme();
    },

    configureServer(server) {
      generateTheme();
      server.watcher.add(envFile);
      server.watcher.on("change", (path) => {
        if (path === envFile) {
          generateTheme();
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}
