import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client/src"),
      "@shared": path.resolve(process.cwd(), "shared"),
    },
  },
  test: {
    include: ["server/**/*.test.ts", "client/src/**/*.test.ts"],
    environment: "node",
  },
});
