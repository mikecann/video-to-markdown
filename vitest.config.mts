import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: {
      deps: {
        external: ["@edge-runtime/vm"],
        // fluent-convex ships ESM with extensionless relative imports, which
        // Node can't resolve, so let Vite bundle it (and convex-test, as the
        // convex-test docs recommend).
        inline: ["convex-test", "fluent-convex"],
      },
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
