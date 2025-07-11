import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: {
      deps: {
        external: ["@edge-runtime/vm"],
      },
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
