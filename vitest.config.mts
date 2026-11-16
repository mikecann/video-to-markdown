import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: {
      deps: {
        external: ["@edge-runtime/vm"],
        // Let Vite bundle convex-test, as the convex-test docs recommend.
        inline: ["convex-test"],
      },
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
