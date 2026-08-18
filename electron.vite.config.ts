import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], define: { __BUILD_APP_ENV__: JSON.stringify(process.env.APP_ENV === "prod" ? "prod" : "local") }, build: { rollupOptions: { input: { index: resolve("src/main/index.ts"), "profile-secret-helper": resolve("src/main/profile-secret-helper.ts") } } } },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    resolve: { alias: { "@renderer": resolve("src/renderer"), "@shared": resolve("src/shared") } },
    plugins: [react()],
  },
});
