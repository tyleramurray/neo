import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @neo/shared to its source so vitest can follow its deps
      "@neo/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    // Let vitest resolve transitive deps from workspace packages
    server: {
      deps: {
        inline: [/^@neo\//, "zod", "@google/genai", "neo4j-driver"],
      },
    },
  },
});
