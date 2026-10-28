import { defineConfig } from "vitest/config";

// Tests sit next to the code they test: feature-name_test.ts
export default defineConfig({
  test: { include: ["src/**/*_test.ts"] },
});
