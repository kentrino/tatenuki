import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "@tatenuki/hono": fileURLToPath(new URL("../../packages/hono/src/index.ts", import.meta.url)),
      tatenuki: fileURLToPath(new URL("../../packages/tatenuki/src/index.ts", import.meta.url)),
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
