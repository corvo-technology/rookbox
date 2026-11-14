import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/www/src/**/*.test.ts",
      "apps/api/src/**/*.test.ts",
      "apps/reporter/src/**/*.test.ts",
    ],
  },
});
